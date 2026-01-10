# coding=utf-8
"""
搜索索引管理器

统一管理全文索引和向量索引，提供构建、更新、搜索等接口。
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from hotnews.core.logger import get_logger
from .config import SearchConfig, get_search_config
from .daily_aggregator import DailyDataAggregator
from .fts_index import FTSIndex, SearchResult
from .hybrid_search import unified_search, HybridSearchResult
from .vector_index import VectorIndex

logger = get_logger(__name__)


class SearchIndexManager:
    """
    搜索索引管理器

    负责：
    1. 管理 FTS5 全文索引和向量索引
    2. 构建和增量更新索引
    3. 执行统一搜索
    4. 索引生命周期管理
    """

    def __init__(
        self,
        data_dir: str = "output",
        config: Optional[SearchConfig] = None,
    ):
        """
        初始化索引管理器

        Args:
            data_dir: 新闻数据目录
            config: 搜索配置
        """
        self.data_dir = Path(data_dir)
        self.config = config or get_search_config()
        self.config.ensure_index_dir()

        # 初始化组件
        self.aggregator = DailyDataAggregator(
            data_dir=str(self.data_dir),
            search_days=self.config.search_days,
        )

        self.fts_index = FTSIndex(index_dir=str(self.config.index_dir))
        self.vector_index = VectorIndex(
            index_dir=str(self.config.index_dir),
            embedding_model=self.config.embedding_model,
        ) if self.config.vector_enabled else None

        if self.vector_index is not None and not getattr(self.vector_index, "_available", True):
            self.vector_index = None

        # 索引状态
        self._last_update: Optional[datetime] = None
        self._built = False

    def build_all_indexes(self, force: bool = False) -> Dict[str, int]:
        """
        构建所有索引

        Args:
            force: 强制重新构建

        Returns:
            各索引的记录数
        """
        if self._built and not force:
            logger.info("索引已存在，使用 incremental_update 更新")
            return self.get_stats()

        logger.info("开始构建所有搜索索引...")

        # 获取所有数据
        data = self.aggregator.get_all_data_for_indexing()
        logger.info(f"聚合到 {len(data)} 条数据")

        if not data:
            logger.warning("没有数据可供索引")
            return {"fts": 0, "vector": 0}

        # 清空旧索引
        self.fts_index.clear()
        if self.vector_index:
            self.vector_index.clear()

        # 构建 FTS 索引
        self.fts_index.build_from_data(data)
        logger.info("FTS5 索引构建完成")

        # 构建向量索引（如果可用）
        if self.vector_index and self.vector_index._available:
            try:
                self.vector_index.build_from_data(data)
                logger.info("向量索引构建完成")
            except Exception as e:
                logger.warning(f"向量索引构建失败: {e}")
                self.vector_index = None

        self._built = True
        self._last_update = datetime.now()

        return self.get_stats()

    def incremental_update(self, date: Optional[str] = None):
        """
        增量更新索引

        Args:
            date: 指定日期，为空则更新所有有变化的日期
        """
        logger.info(f"增量更新索引: date={date}")

        if date:
            # 更新指定日期
            items = self.aggregator.read_news_from_date(date)
            data = [
                (item.title, item.url, item.platform_id, item.date, item.id)
                for item in items
            ]
            if data:
                self.fts_index.incremental_update(data)
                if self.vector_index:
                    self.vector_index.incremental_update(data)
        else:
            # 更新所有有变化的日期
            dates = self.aggregator.get_incremental_dates(self._last_update)
            for d in dates:
                self.incremental_update(d)

        self._last_update = datetime.now()
        logger.info("增量更新完成")

    def search(
        self,
        query: str,
        search_mode: str = "hybrid",
        limit: int = 100,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[HybridSearchResult]:
        """
        统一搜索

        Args:
            query: 搜索查询
            search_mode: 搜索模式 ("keyword", "fuzzy", "semantic", "hybrid")
            limit: 返回结果数量
            platform_filter: 平台过滤
            date_filter: 日期范围过滤

        Returns:
            HybridSearchResult 列表
        """
        # 检查索引是否已构建
        if not self._built:
            logger.warning("索引未构建，自动构建中...")
            self.build_all_indexes()

        return unified_search(
            query=query,
            fts_index=self.fts_index,
            vector_index=self.vector_index,
            search_mode=search_mode,
            limit=limit,
            platform_filter=platform_filter,
            date_filter=date_filter or self.aggregator.get_date_range(),
        )

    def keyword_search(
        self,
        query: str,
        limit: int = 100,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[HybridSearchResult]:
        """
        关键词搜索（精确/模糊匹配）

        Args:
            query: 搜索关键词
            limit: 返回结果数量
            platform_filter: 平台过滤
            date_filter: 日期范围过滤

        Returns:
            HybridSearchResult 列表
        """
        return self.search(
            query=query,
            search_mode="keyword",
            limit=limit,
            platform_filter=platform_filter,
            date_filter=date_filter,
        )

    def semantic_search(
        self,
        query: str,
        limit: int = 100,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[HybridSearchResult]:
        """
        语义搜索（向量搜索）

        Args:
            query: 搜索查询
            limit: 返回结果数量
            platform_filter: 平台过滤
            date_filter: 日期范围过滤

        Returns:
            HybridSearchResult 列表
        """
        if not self.vector_index or not self.config.vector_enabled:
            logger.warning("向量搜索未启用")
            return []

        return self.search(
            query=query,
            search_mode="semantic",
            limit=limit,
            platform_filter=platform_filter,
            date_filter=date_filter,
        )

    def hybrid_search(
        self,
        query: str,
        limit: int = 100,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[HybridSearchResult]:
        """
        混合搜索（关键词 + 语义）

        Args:
            query: 搜索查询
            limit: 返回结果数量
            platform_filter: 平台过滤
            date_filter: 日期范围过滤

        Returns:
            HybridSearchResult 列表
        """
        return self.search(
            query=query,
            search_mode="hybrid",
            limit=limit,
            platform_filter=platform_filter,
            date_filter=date_filter,
        )

    def get_stats(self) -> Dict[str, int]:
        """获取索引统计信息"""
        fts_stats = self.fts_index.get_stats()
        vector_stats = self.vector_index.get_stats() if self.vector_index else {"available": False}

        return {
            "fts_items": fts_stats.get("total_items", 0),
            "vector_items": vector_stats.get("total_items", 0) if vector_stats.get("available") else 0,
            "date_range": fts_stats.get("date_range", (None, None)),
            "fts_size_mb": fts_stats.get("index_size_mb", 0),
            "vector_size_mb": vector_stats.get("index_size_mb", 0),
        }

    def get_date_range(self) -> Tuple[str, str]:
        """获取当前索引的日期范围"""
        return self.aggregator.get_date_range()

    def optimize_indexes(self):
        """优化索引"""
        self.fts_index.optimize()
        if self.vector_index:
            logger.info("向量索引无需优化")
        logger.info("索引优化完成")

    def clear_all(self):
        """清空所有索引"""
        self.fts_index.clear()
        if self.vector_index:
            self.vector_index.clear()
        self._built = False
        self._last_update = None
        logger.info("所有索引已清空")


# 全局索引管理器实例
_search_manager: Optional[SearchIndexManager] = None


def get_search_manager(force_reload: bool = False) -> SearchIndexManager:
    """获取全局搜索管理器实例"""
    global _search_manager
    if _search_manager is None or force_reload:
        _search_manager = SearchIndexManager()
    return _search_manager


def reset_search_manager():
    """重置搜索管理器（主要用于测试）"""
    global _search_manager
    _search_manager = None
