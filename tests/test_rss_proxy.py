# coding=utf-8
"""
单元测试 - RSS 代理安全验证
"""

import os
import pytest
from unittest.mock import patch


class TestURLValidation:
    """URL 验证测试类"""

    def test_validate_http_url_valid_https(self):
        """有效的 HTTPS URL 应通过验证"""
        from trendradar.web.rss_proxy import validate_http_url

        url = validate_http_url("https://example.com/feed.xml")
        assert url == "https://example.com/feed.xml"

    def test_validate_http_url_valid_http(self):
        """有效的 HTTP URL 应通过验证"""
        from trendradar.web.rss_proxy import validate_http_url

        url = validate_http_url("http://example.com/feed.xml")
        assert url == "http://example.com/feed.xml"

    def test_validate_http_url_rejects_ftp(self):
        """FTP URL 应被拒绝"""
        from trendradar.web.rss_proxy import validate_http_url

        with pytest.raises(ValueError, match="Invalid url scheme"):
            validate_http_url("ftp://example.com/feed.xml")

    def test_validate_http_url_rejects_empty(self):
        """空 URL 应被拒绝"""
        from trendradar.web.rss_proxy import validate_http_url

        with pytest.raises(ValueError, match="Missing url"):
            validate_http_url("")

    def test_validate_http_url_rejects_credentials(self):
        """包含凭据的 URL 应被拒绝"""
        from trendradar.web.rss_proxy import validate_http_url

        with pytest.raises(ValueError, match="credentials not allowed"):
            validate_http_url("https://user:pass@example.com/feed.xml")

    def test_validate_http_url_rejects_non_standard_ports(self):
        """非标准端口应被拒绝（除非配置）"""
        from trendradar.web.rss_proxy import validate_http_url

        with pytest.raises(ValueError, match="Port 8080 not allowed"):
            validate_http_url("https://example.com:8080/feed.xml")

    def test_validate_http_url_default_port_http(self):
        """HTTP 默认端口 80 应被允许"""
        from trendradar.web.rss_proxy import validate_http_url

        url = validate_http_url("http://example.com/feed.xml")
        assert url == "http://example.com/feed.xml"

    def test_validate_http_url_default_port_https(self):
        """HTTPS 默认端口 443 应被允许"""
        from trendradar.web.rss_proxy import validate_http_url

        url = validate_http_url("https://example.com/feed.xml")
        assert url == "https://example.com/feed.xml"

    def test_resolve_and_validate_host_blocks_localhost(self):
        """localhost 应被阻止"""
        from trendradar.web.rss_proxy import resolve_and_validate_host

        with pytest.raises(ValueError, match="Blocked host"):
            resolve_and_validate_host("localhost")

    def test_resolve_and_validate_host_blocks_localhost_localdomain(self):
        """localhost.localdomain 应被阻止"""
        from trendradar.web.rss_proxy import resolve_and_validate_host

        with pytest.raises(ValueError, match="Blocked host"):
            resolve_and_validate_host("localhost.localdomain")

    def test_resolve_and_validate_host_blocks_private_ip(self):
        """私有 IP 地址应被阻止"""
        from trendradar.web.rss_proxy import resolve_and_validate_host

        with pytest.raises(ValueError, match="Blocked IP"):
            resolve_and_validate_host("192.168.1.1")

    def test_resolve_and_validate_host_blocks_loopback(self):
        """回环地址应被阻止"""
        from trendradar.web.rss_proxy import resolve_and_validate_host

        with pytest.raises(ValueError, match="Blocked IP"):
            resolve_and_validate_host("127.0.0.1")

    def test_whitelist_allows_domain(self):
        """白名单中的域名应被允许"""
        from trendradar.web.rss_proxy import _get_allowed_domains

        # 设置白名单
        with patch.dict(os.environ, {"TREND_RADAR_RSS_ALLOWED_DOMAINS": "allowed.com,trusted.org"}):
            # 重新加载
            import trendradar.web.rss_proxy as proxy
            proxy._ALLOWED_DOMAINS_LOADED = False
            proxy._ALLOWED_DOMAINS.clear()

            domains = proxy._get_allowed_domains()
            assert "allowed.com" in domains
            assert "trusted.org" in domains
            assert "other.com" not in domains

    def test_get_allowed_ports_default(self):
        """默认应只允许 80 和 443 端口"""
        from trendradar.web.rss_proxy import _get_allowed_ports

        with patch.dict(os.environ, {}, clear=True):
            import trendradar.web.rss_proxy as proxy
            proxy._ALLOWED_DOMAINS_LOADED = False  # 重置

            ports = _get_allowed_ports()
            assert 80 in ports
            assert 443 in ports
            assert 8080 not in ports

    def test_custom_ports_allowed(self):
        """自定义端口应被允许"""
        from trendradar.web.rss_proxy import _get_allowed_ports

        with patch.dict(os.environ, {"TREND_RADAR_RSS_ALLOWED_PORTS": "80,443,8080,9000"}):
            ports = _get_allowed_ports()
            assert 80 in ports
            assert 443 in ports
            assert 8080 in ports
            assert 9000 in ports
