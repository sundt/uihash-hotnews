# coding=utf-8
"""
核心模块 - 配置管理和核心工具
"""

from hotnews.core.config import (
    parse_multi_account_config,
    validate_paired_configs,
    limit_accounts,
    get_account_at_index,
)
from hotnews.core.loader import load_config
from hotnews.core.frequency import load_frequency_words, matches_word_groups
from hotnews.core.data import (
    save_titles_to_file,
    read_all_today_titles_from_storage,
    read_all_today_titles,
    detect_latest_new_titles_from_storage,
    detect_latest_new_titles,
    is_first_crawl_today,
)
from hotnews.core.analyzer import (
    calculate_news_weight,
    format_time_display,
    count_word_frequency,
)

__all__ = [
    "parse_multi_account_config",
    "validate_paired_configs",
    "limit_accounts",
    "get_account_at_index",
    "load_config",
    "load_frequency_words",
    "matches_word_groups",
    # 数据处理
    "save_titles_to_file",
    "read_all_today_titles_from_storage",
    "read_all_today_titles",
    "detect_latest_new_titles_from_storage",
    "detect_latest_new_titles",
    "is_first_crawl_today",
    # 统计分析
    "calculate_news_weight",
    "format_time_display",
    "count_word_frequency",
]
