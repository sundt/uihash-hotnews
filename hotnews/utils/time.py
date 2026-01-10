# coding=utf-8
"""
时间工具模块 - 统一时间处理函数
"""

from datetime import datetime
from typing import Optional

import pytz

# 默认时区
DEFAULT_TIMEZONE = "Asia/Shanghai"


def get_configured_time(timezone: str = DEFAULT_TIMEZONE) -> datetime:
    """
    获取配置时区的当前时间

    Args:
        timezone: 时区名称，如 'Asia/Shanghai', 'America/Los_Angeles'

    Returns:
        带时区信息的当前时间
    """
    try:
        tz = pytz.timezone(timezone)
    except pytz.UnknownTimeZoneError:
        print(f"[警告] 未知时区 '{timezone}'，使用默认时区 {DEFAULT_TIMEZONE}")
        tz = pytz.timezone(DEFAULT_TIMEZONE)
    return datetime.now(tz)


def format_date_folder(
    date: Optional[str] = None, timezone: str = DEFAULT_TIMEZONE
) -> str:
    """
    格式化日期文件夹名 (ISO 格式: YYYY-MM-DD)

    Args:
        date: 指定日期字符串，为 None 则使用当前日期
        timezone: 时区名称

    Returns:
        格式化后的日期字符串，如 '2025-12-09'
    """
    if date:
        return date
    return get_configured_time(timezone).strftime("%Y-%m-%d")


def format_time_filename(timezone: str = DEFAULT_TIMEZONE) -> str:
    """
    格式化时间文件名 (格式: HH-MM，用于文件名)

    Windows 系统不支持冒号作为文件名，因此使用连字符

    Args:
        timezone: 时区名称

    Returns:
        格式化后的时间字符串，如 '15-30'
    """
    return get_configured_time(timezone).strftime("%H-%M")


def get_current_time_display(timezone: str = DEFAULT_TIMEZONE) -> str:
    """
    获取当前时间显示 (格式: HH:MM，用于显示)

    Args:
        timezone: 时区名称

    Returns:
        格式化后的时间字符串，如 '15:30'
    """
    return get_configured_time(timezone).strftime("%H:%M")


def convert_time_for_display(time_str: str) -> str:
    """
    将 HH-MM 格式转换为 HH:MM 格式用于显示

    Args:
        time_str: 输入时间字符串，如 '15-30'

    Returns:
        转换后的时间字符串，如 '15:30'
    """
    if time_str and "-" in time_str and len(time_str) == 5:
        return time_str.replace("-", ":")
    return time_str
