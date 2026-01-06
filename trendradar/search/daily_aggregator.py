# coding=utf-8
"""
数据聚合模块

合并最近 N 天的新闻数据，去重并生成统一的数据视图。
"""

import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from trendradar.core.logger import get_logger

logger = get_logger(__name__)


@dataclass
class NewsItem:
    """新闻条目数据结构"""

    id: int
    title: str
    platform_id: str
    url: str
    first_crawl_time: str
    last_crawl_time: str
    date: str  # 所属日期目录


@dataclass
class AggregatedData:
    """聚合后的数据结构"""

    items: List[NewsItem]
    date_range: Tuple[str, str]  # (start_date, end_date)
    total_count: int
    by_platform: Dict[str, int]  # 平台 -> 数量

    def get_all_titles(self) -> List[Tuple[str, NewsItem]]:
        """获取所有标题及对应的新闻条目"""
        return [(item.title, item) for item in self.items]


class DailyDataAggregator:
    """每日数据聚合器

    负责读取最近 N 天的数据，合并去重后提供统一接口。
    """

    def __init__(self, data_dir: str = "output", search_days: int = 30):
        """
        初始化聚合器

        Args:
            data_dir: 数据目录
            search_days: 搜索最近多少天的数据
        """
        self.data_dir = Path(data_dir)
        self.search_days = search_days

    def get_recent_dates(self, count: Optional[int] = None) -> List[str]:
        """
        获取最近的日期列表

        Args:
            count: 返回的日期数量，默认使用 search_days

        Returns:
            日期字符串列表 (YYYY-MM-DD 格式)
        """
        if count is None:
            count = self.search_days

        dates = []
        today = datetime.now().date()

        for i in range(count):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")

            # 检查日期目录是否存在
            date_path = self.data_dir / date_str
            if date_path.exists() and (date_path / "news.db").exists():
                dates.append(date_str)

        return dates

    def get_date_range(self) -> Tuple[str, str]:
        """
        获取当前配置的日期范围

        Returns:
            (开始日期, 结束日期)
        """
        dates = self.get_recent_dates()
        if not dates:
            return ("", "")

        dates.sort()
        return (dates[0], dates[-1])

    def read_news_from_date(self, date: str) -> List[NewsItem]:
        """
        读取某一天的新闻数据

        Args:
            date: 日期字符串 (YYYY-MM-DD)

        Returns:
            NewsItem 列表
        """
        db_path = self.data_dir / date / "news.db"

        if not db_path.exists():
            logger.warning(f"数据库文件不存在: {db_path}")
            return []

        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()

            cursor.execute("""
                SELECT id, title, platform_id, url, first_crawl_time, last_crawl_time
                FROM news_items
                ORDER BY id
            """)

            items = []
            for row in cursor.fetchall():
                items.append(NewsItem(
                    id=row[0],
                    title=row[1],
                    platform_id=row[2],
                    url=row[3] or "",
                    first_crawl_time=row[4],
                    last_crawl_time=row[5],
                    date=date,
                ))

            conn.close()
            return items

        except Exception as e:
            logger.error(f"读取日期 {date} 的数据失败: {e}")
            return []

    def aggregate_all(self) -> AggregatedData:
        """
        聚合所有最近日期的数据

        Returns:
            聚合后的数据对象
        """
        dates = self.get_recent_dates()
        logger.info(f"开始聚合最近 {len(dates)} 天的数据: {dates}")

        all_items: List[NewsItem] = []
        seen_urls: Dict[str, NewsItem] = {}  # URL -> NewsItem，用于去重

        for date in dates:
            items = self.read_news_from_date(date)
            logger.debug(f"日期 {date}: 读取到 {len(items)} 条数据")

            for item in items:
                # 按 URL 去重，保留第一条（通常是排名最高的）
                if item.url and item.url not in seen_urls:
                    seen_urls[item.url] = item
                    all_items.append(item)

        # 按日期和排名排序
        all_items.sort(key=lambda x: (x.date, -x.id))

        # 统计各平台数量
        by_platform: Dict[str, int] = {}
        for item in all_items:
            by_platform[item.platform_id] = by_platform.get(item.platform_id, 0) + 1

        date_range = self.get_date_range()

        result = AggregatedData(
            items=all_items,
            date_range=date_range,
            total_count=len(all_items),
            by_platform=by_platform,
        )

        logger.info(f"聚合完成: 共 {result.total_count} 条数据, "
                    f"日期范围: {date_range[0]} ~ {date_range[1]}, "
                    f"平台数: {len(by_platform)}")

        return result

    def get_incremental_dates(self, last_update: Optional[datetime] = None) -> List[str]:
        """
        获取自上次更新以来有变化的天

        Args:
            last_update: 上次更新时间

        Returns:
            需要更新的日期列表
        """
        if last_update is None:
            return self.get_recent_dates()

        # 检查最近几天的修改时间
        dates = self.get_recent_dates(self.search_days)
        updated_dates = []

        for date in dates:
            date_path = self.data_dir / date
            db_path = date_path / "news.db"

            if db_path.exists():
                mtime = datetime.fromtimestamp(db_path.stat().st_mtime)
                if last_update is None or mtime > last_update:
                    updated_dates.append(date)

        return updated_dates

    def get_all_data_for_indexing(self) -> List[Tuple[str, str, str, str, int]]:
        """
        获取所有用于建立索引的数据

        Returns:
            [(title, url, platform_id, date, id), ...]
        """
        data = self.aggregate_all()
        return [
            (item.title, item.url, item.platform_id, item.date, item.id)
            for item in data.items
        ]
