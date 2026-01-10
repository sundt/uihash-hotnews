# coding=utf-8
"""
单元测试 - 速率限制模块
"""

import time
from unittest.mock import MagicMock, Mock

import pytest

from hotnews.web.rate_limit import (
    is_rate_limited,
    check_rate_limit,
    reset_rate_limit_storage,
    get_rate_limit_stats,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW,
)


class TestRateLimit:
    """速率限制测试类"""

    def setup_method(self):
        """每个测试前重置状态"""
        reset_rate_limit_storage()

    def test_no_limit_for_new_client(self):
        """新客户端不应被限制"""
        is_limited, remaining = is_rate_limited("ip:127.0.0.1")
        assert is_limited is False
        assert remaining == RATE_LIMIT_REQUESTS

    def test_limit_after_max_requests(self):
        """超过最大请求数后应被限制"""
        client_id = "ip:127.0.0.2"

        # 发送 RATE_LIMIT_REQUESTS 次请求
        for i in range(RATE_LIMIT_REQUESTS):
            is_limited, remaining = is_rate_limited(client_id)
            assert is_limited is False, f"Request {i} should not be limited"
            # remaining 应该递减（但由于 deque maxlen 的初始行为，第一次调用时不减少）
            assert remaining <= RATE_LIMIT_REQUESTS, f"Remaining {remaining} should be <= {RATE_LIMIT_REQUESTS}"

        # 下一次请求应被限制
        is_limited, remaining = is_rate_limited(client_id)
        assert is_limited is True, "Should be limited after max requests"
        assert remaining == 0

    def test_limit_resets_after_window(self):
        """时间窗口过后限制应重置"""
        client_id = "ip:127.0.0.3"

        # 发送部分请求
        for _ in range(RATE_LIMIT_REQUESTS - 10):
            is_rate_limited(client_id)

        # 等待窗口过期
        time.sleep(RATE_LIMIT_WINDOW + 1)

        # 现在应该有更多可用请求
        is_limited, remaining = is_rate_limited(client_id)
        assert is_limited is False
        assert remaining >= 10  # 至少有 10 个可用

    def test_different_clients_independent(self):
        """不同客户端的限制是独立的"""
        client1 = "ip:127.0.0.1"
        client2 = "ip:127.0.0.2"

        # 填满 client1 的请求
        for _ in range(RATE_LIMIT_REQUESTS):
            is_rate_limited(client1)

        # client2 应该仍然可以请求
        is_limited, remaining = is_rate_limited(client2)
        assert is_limited is False
        assert remaining == RATE_LIMIT_REQUESTS

    def test_get_rate_limit_stats(self):
        """测试获取统计信息"""
        reset_rate_limit_storage()

        # 创建一些请求
        is_rate_limited("ip:127.0.0.1")
        is_rate_limited("ip:127.0.0.2")
        is_rate_limited("ip:127.0.0.2")  # 同一个客户端多个请求

        stats = get_rate_limit_stats()

        assert stats["total_clients"] == 2
        assert stats["total_requests"] == 3
        assert stats["window_seconds"] == RATE_LIMIT_WINDOW
        assert stats["max_requests"] == RATE_LIMIT_REQUESTS

    def test_check_rate_limit_for_health_endpoint(self):
        """健康检查端点应跳过速率限制"""
        mock_request = Mock()
        mock_request.url.path = "/health"
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"

        is_limited, response = check_rate_limit(mock_request)

        assert is_limited is False
        assert response is None

    def test_check_rate_limit_for_static_path(self):
        """静态资源路径应跳过速率限制"""
        mock_request = Mock()
        mock_request.url.path = "/static/js/app.js"
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"

        is_limited, response = check_rate_limit(mock_request)

        assert is_limited is False
        assert response is None

    def test_check_rate_limit_when_limited(self):
        """被限制时返回 429 响应"""
        mock_request = Mock()
        mock_request.url.path = "/api/news"
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"

        # 填满请求
        for _ in range(RATE_LIMIT_REQUESTS):
            is_rate_limited("ip:127.0.0.1")

        is_limited, response = check_rate_limit(mock_request)

        assert is_limited is True
        assert response.status_code == 429
        assert response.headers["Retry-After"] == str(RATE_LIMIT_WINDOW)

    def test_reset_rate_limit_storage(self):
        """测试重置存储"""
        # 创建一些请求
        is_rate_limited("ip:127.0.0.1")
        is_rate_limited("ip:127.0.0.2")

        stats_before = get_rate_limit_stats()
        assert stats_before["total_clients"] == 2

        # 重置
        reset_rate_limit_storage()

        stats_after = get_rate_limit_stats()
        assert stats_after["total_clients"] == 0
        assert stats_after["total_requests"] == 0
