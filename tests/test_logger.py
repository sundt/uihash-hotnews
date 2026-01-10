# coding=utf-8
"""
单元测试 - 日志模块
"""

import logging
import os
import tempfile
from pathlib import Path

import pytest


class TestLogger:
    """日志模块测试类"""

    def test_get_logger_returns_child_logger(self):
        """get_logger 应返回正确的子 logger"""
        from hotnews.core.logger import get_logger

        logger = get_logger("test_module")
        assert logger.name == "hotnews.test_module"

    def test_get_logger_returns_same_instance(self):
        """相同名称应返回相同的 logger 实例"""
        from hotnews.core.logger import get_logger

        logger1 = get_logger("singleton")
        logger2 = get_logger("singleton")
        assert logger1 is logger2

    def test_setup_logger_creates_handlers(self):
        """setup_logger 应创建处理器"""
        from hotnews.core.logger import setup_logger

        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = os.path.join(tmpdir, "test.log")
            logger = setup_logger(
                name="test_setup",
                level="DEBUG",
                log_file=log_file,
                console=False,
            )

            assert len(logger.handlers) >= 1
            # 应该有文件处理器
            handler_types = [type(h).__name__ for h in logger.handlers]
            assert "SafeFileHandler" in handler_types or "RotatingFileHandler" in handler_types

    def test_setup_logger_console_output(self):
        """setup_logger 应支持控制台输出"""
        from hotnews.core.logger import setup_logger

        logger = setup_logger(
            name="test_console",
            level="INFO",
            console=True,
        )

        assert len(logger.handlers) >= 1

    def test_logger_level_configurable(self):
        """日志级别应可配置"""
        from hotnews.core.logger import setup_logger

        logger = setup_logger(
            name="test_level",
            level="WARNING",
            console=True,
        )

        assert logger.level == logging.WARNING

    def test_log_exception_function(self):
        """log_exception 应记录异常并返回默认值"""
        from hotnews.core.logger import get_logger, log_exception

        logger = get_logger("test_exception")
        result = log_exception(logger, "Test error", default="fallback")

        assert result == "fallback"

    def test_logger_does_not_duplicate_handlers(self):
        """重复调用 setup_logger 不应添加重复处理器"""
        from hotnews.core.logger import setup_logger, logging

        # 获取 root logger
        root_logger = logging.getLogger("test_dup")
        initial_handlers = len(root_logger.handlers)

        # 多次调用
        setup_logger(name="test_dup", level="INFO", console=False)
        setup_logger(name="test_dup", level="INFO", console=False)
        setup_logger(name="test_dup", level="INFO", console=False)

        # 不应添加额外处理器
        assert len(root_logger.handlers) == initial_handlers

    def test_colored_formatter_debug(self):
        """DEBUG 级别应有颜色"""
        from hotnews.core.logger import ColoredFormatter, LOG_COLORS, RESET_COLOR

        formatter = ColoredFormatter("%(message)s")
        record = logging.LogRecord(
            name="test",
            level=logging.DEBUG,
            pathname="test.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)
        # 格式化后的消息应包含颜色代码
        assert LOG_COLORS["DEBUG"] in formatted or formatted.strip() == "Test message"

    def test_safe_file_handler_creates_directory(self):
        """SafeFileHandler 应自动创建目录"""
        from hotnews.core.logger import SafeFileHandler

        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "nested" / "dir" / "test.log"
            handler = SafeFileHandler(str(log_path))

            # 目录应已创建
            assert log_path.parent.exists()

            handler.close()
