# coding=utf-8
"""
搜索模块

提供跨日期的全文搜索和向量搜索功能。
"""

from .config import SearchConfig, get_search_config
from .index_manager import SearchIndexManager, get_search_manager
from .daily_aggregator import DailyDataAggregator
from .fts_index import FTSIndex
from .hybrid_search import hybrid_search, unified_search

__all__ = [
    "SearchConfig",
    "get_search_config",
    "SearchIndexManager",
    "get_search_manager",
    "DailyDataAggregator",
    "FTSIndex",
    "hybrid_search",
    "unified_search",
]
