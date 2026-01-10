"""
Web 模块初始化
"""

from .content_filter import ContentFilter
from .news_viewer import NewsViewerService, PLATFORM_CATEGORIES

__all__ = [
    "ContentFilter",
    "NewsViewerService",
    "PLATFORM_CATEGORIES",
]
