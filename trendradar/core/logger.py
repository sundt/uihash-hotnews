# coding=utf-8
"""
统一日志配置模块

提供项目级别的日志配置，支持：
- 控制台输出（带颜色）
- 文件日志（按日期轮转）
- 日志级别动态调整
"""

import os
import sys
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path
from typing import Optional


# 默认日志格式
DEFAULT_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
CONSOLE_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"

# 日志颜色（ANSI 转义码）
LOG_COLORS = {
    "DEBUG": "\033[36m",    # 青色
    "INFO": "\033[32m",     # 绿色
    "WARNING": "\033[33m",  # 黄色
    "ERROR": "\033[31m",    # 红色
    "CRITICAL": "\033[35m", # 紫色
}
RESET_COLOR = "\033[0m"


class ColoredFormatter(logging.Formatter):
    """带颜色的控制台日志格式化器"""

    def format(self, record: logging.LogRecord) -> str:
        # 保存原始消息
        msg = record.getMessage()

        # 添加颜色
        levelname = record.levelname
        if levelname in LOG_COLORS and sys.stdout.isatty():
            record.msg = f"{LOG_COLORS[levelname]}{msg}{RESET_COLOR}"

        return super().format(record)


class SafeFileHandler(logging.handlers.RotatingFileHandler):
    """安全的文件处理器，自动创建目录"""

    def __init__(self, filename, mode="a", maxBytes=10 * 1024 * 1024, backupCount=5, encoding=None):
        # 确保目录存在
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        super().__init__(filename, mode, maxBytes, backupCount, encoding)


def setup_logger(
    name: str = "trendradar",
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    console: bool = True,
) -> logging.Logger:
    """
    设置统一日志配置

    Args:
        name: 日志名称
        level: 日志级别（DEBUG/INFO/WARNING/ERROR/CRITICAL），默认从环境变量读取
        log_file: 日志文件路径，默认 output/logs/trendradar.log
        console: 是否输出到控制台

    Returns:
        配置好的 logger 实例
    """
    # 确定日志级别
    if level is None:
        level = os.environ.get("TREND_RADAR_LOG_LEVEL", "INFO").upper()

    # 解析日志级别
    numeric_level = getattr(logging, level, logging.INFO)

    # 获取或创建 logger
    logger = logging.getLogger(name)
    logger.setLevel(numeric_level)

    # 避免重复添加处理器
    if logger.handlers:
        return logger

    # ========== 控制台处理器 ==========
    if console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(numeric_level)
        console_formatter = ColoredFormatter(CONSOLE_FORMAT, datefmt="%H:%M:%S")
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)

    # ========== 文件处理器 ==========
    if log_file:
        # 默认日志目录
        if not Path(log_file).is_absolute():
            project_root = Path(__file__).parent.parent.parent
            log_file = str(project_root / log_file)

        # 创建日志目录
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)

        # 使用轮转日志文件（最大 10MB，保留 5 个）
        file_handler = SafeFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(numeric_level)
        file_formatter = logging.Formatter(DEFAULT_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

    return logger


def get_logger(name: str) -> logging.Logger:
    """
    获取项目 logger

    Args:
        name: 子模块名称，通常使用 __name__

    Returns:
        logger 实例
    """
    return logging.getLogger(f"trendradar.{name}")


def log_function_call(logger: logging.Logger):
    """装饰器：记录函数调用"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            logger.debug(f"Calling {func.__name__} with args={args}, kwargs={kwargs}")
            result = func(*args, **kwargs)
            logger.debug(f"{func.__name__} returned: {result}")
            return result
        return wrapper
    return decorator


# 便捷函数：记录异常并返回默认值
def log_exception(logger: logging.Logger, msg: str, default=None, exc_info=True):
    """记录异常并返回默认值"""
    logger.error(f"{msg}: {exc_info}", exc_info=exc_info)
    return default


# 初始化默认日志
def init_default_logger():
    """初始化项目默认日志配置"""
    log_dir = os.environ.get("TREND_RADAR_LOG_DIR", "output/logs")
    log_file = os.environ.get("TREND_RADAR_LOG_FILE", f"{log_dir}/trendradar.log")

    setup_logger(
        name="trendradar",
        level=None,
        log_file=log_file,
        console=True,
    )


# 模块导入时自动初始化
init_default_logger()
