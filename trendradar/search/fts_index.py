# coding=utf-8
"""
FTS5 全文索引模块

使用 SQLite FTS5 实现高效的标题全文搜索。
"""

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from trendradar.core.logger import get_logger
from .config import get_search_config

logger = get_logger(__name__)


@dataclass
class SearchResult:
    """搜索结果"""

    title: str
    url: str
    platform_id: str
    date: str
    rank: int  # 搜索结果排名
    score: float  # 搜索得分


class FTSIndex:
    """FTS5 全文索引

    使用 SQLite FTS5 虚拟表实现全文搜索。
    """

    def __init__(self, index_dir: Optional[str] = None):
        """
        初始化 FTS 索引

        Args:
            index_dir: 索引存储目录
        """
        config = get_search_config()
        self.index_dir = Path(index_dir or config.index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)

        self.db_path = self.index_dir / "fts_index.db"
        self._init_db()

    def _init_db(self):
        """初始化数据库和 FTS 表"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # 创建 FTS5 虚拟表
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(
                title,
                url,
                platform_id,
                date,
                tokenize='porter'
            )
        """)

        conn.commit()
        conn.close()

        logger.info(f"FTS5 索引已初始化: {self.db_path}")

    def clear(self):
        """清空索引"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM news_fts")
        conn.commit()
        conn.close()
        logger.info("FTS5 索引已清空")

    def build_from_data(self, data: List[Tuple[str, str, str, str, int]]):
        """
        从数据列表构建索引

        Args:
            data: [(title, url, platform_id, date, id), ...]
        """
        if not data:
            logger.warning("没有数据可索引")
            return

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # 批量插入
        cursor.executemany(
            "INSERT INTO news_fts(title, url, platform_id, date) VALUES (?, ?, ?, ?)",
            [(item[0], item[1], item[2], item[3]) for item in data]
        )

        conn.commit()
        conn.close()

        logger.info(f"FTS5 索引已构建: {len(data)} 条记录")

    def incremental_update(self, data: List[Tuple[str, str, str, str, int]]):
        """
        增量更新索引

        Args:
            data: [(title, url, platform_id, date, id), ...]
        """
        if not data:
            return

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # 查找需要删除的记录（同一 URL 旧数据）
        urls_to_replace = set(item[1] for item in data if item[1])
        if urls_to_replace:
            placeholders = ",".join("?" * len(urls_to_replace))
            cursor.execute(f"DELETE FROM news_fts WHERE url IN ({placeholders})", list(urls_to_replace))

        # 插入新数据
        cursor.executemany(
            "INSERT INTO news_fts(title, url, platform_id, date) VALUES (?, ?, ?, ?)",
            [(item[0], item[1], item[2], item[3]) for item in data]
        )

        conn.commit()
        conn.close()

        logger.debug(f"FTS5 索引已增量更新: {len(data)} 条")

    def search(
        self,
        query: str,
        limit: int = 100,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[SearchResult]:
        """
        搜索标题

        Args:
            query: 搜索关键词
            limit: 返回结果数量
            platform_filter: 平台过滤列表
            date_filter: 日期范围过滤 (start_date, end_date)

        Returns:
            SearchResult 列表
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # 构建查询条件
        where_clauses = ["title MATCH ?"]
        params = [query + "*"]  # 添加通配符支持前缀匹配

        if platform_filter:
            placeholders = ",".join("?" * len(platform_filter))
            where_clauses.append(f"platform_id IN ({placeholders})")
            params.extend(platform_filter)

        if date_filter:
            where_clauses.append("date >= ?")
            where_clauses.append("date <= ?")
            params.extend(date_filter)

        where_clause = " AND ".join(where_clauses)

        # 计算 BM25 得分并排序
        sql = f"""
            SELECT title, url, platform_id, date,
                   bm25(news_fts) as score
            FROM news_fts
            WHERE {where_clause}
            ORDER BY score ASC
            LIMIT ?
        """
        params.append(limit)

        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()

        results = []
        for rank, row in enumerate(rows, 1):
            results.append(SearchResult(
                title=row[0],
                url=row[1] or "",
                platform_id=row[2],
                date=row[3],
                rank=rank,
                score=row[4],
            ))

        logger.debug(f"FTS5 搜索 '{query}': 找到 {len(results)} 条结果")
        return results

    def simple_search(
        self,
        query: str,
        limit: int = 100,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[SearchResult]:
        """
        简单搜索（包含匹配而非全文搜索）

        适用于模糊匹配场景。

        Args:
            query: 搜索关键词
            limit: 返回结果数量
            platform_filter: 平台过滤列表
            date_filter: 日期范围过滤

        Returns:
            SearchResult 列表
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # 构建查询条件
        where_clauses = ["title LIKE ?"]
        params = [f"%{query}%"]

        if platform_filter:
            placeholders = ",".join("?" * len(platform_filter))
            where_clauses.append(f"platform_id IN ({placeholders})")
            params.extend(platform_filter)

        if date_filter:
            where_clauses.append("date >= ?")
            where_clauses.append("date <= ?")
            params.extend(date_filter)

        where_clause = " AND ".join(where_clauses)

        sql = f"""
            SELECT title, url, platform_id, date, 0 as score
            FROM news_fts
            WHERE {where_clause}
            LIMIT ?
        """
        params.append(limit)

        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()

        results = []
        for rank, row in enumerate(rows, 1):
            results.append(SearchResult(
                title=row[0],
                url=row[1] or "",
                platform_id=row[2],
                date=row[3],
                rank=rank,
                score=row[4],
            ))

        logger.debug(f"简单搜索 '{query}': 找到 {len(results)} 条结果")
        return results

    def get_stats(self) -> dict:
        """获取索引统计信息"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM news_fts")
        count = cursor.fetchone()[0]

        cursor.execute("SELECT MIN(date), MAX(date) FROM news_fts")
        date_range = cursor.fetchone()

        conn.close()

        return {
            "total_items": count,
            "date_range": date_range if date_range and date_range[0] else (None, None),
            "index_size_mb": round(self.db_path.stat().st_size / (1024 * 1024), 2),
        }

    def optimize(self):
        """优化索引"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("INSERT INTO news_fts(news_fts) VALUES('optimize')")
        conn.commit()
        conn.close()
        logger.info("FTS5 索引已优化")
