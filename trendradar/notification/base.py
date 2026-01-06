# coding=utf-8
"""
通知发送器基类

提供通用的分批发送逻辑，减少重复代码。
"""

import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional

import requests

from .batch import get_max_batch_header_size


class BaseNotificationSender(ABC):
    """通知发送器基类"""

    # 子类需要覆盖这些属性
    CHANNEL_NAME = "base"  # 渠道名称
    DEFAULT_BATCH_SIZE = 4000  # 默认批次大小
    BATCH_HEADER_TYPE = None  # 批次头部类型

    def __init__(
        self,
        batch_size: int = None,
        batch_interval: float = 1.0,
        split_content_func: Callable = None,
        proxy_url: Optional[str] = None,
    ):
        self.batch_size = batch_size or self.DEFAULT_BATCH_SIZE
        self.batch_interval = batch_interval
        self.split_content_func = split_content_func
        self.proxy_url = proxy_url
        self.logger = self._get_logger()

    def _get_logger(self):
        """获取日志记录器"""
        import logging
        return logging.getLogger(f"trendradar.notification.{self.CHANNEL_NAME}")

    def _get_proxies(self) -> Optional[Dict[str, str]]:
        """获取代理配置"""
        if self.proxy_url:
            return {"http": self.proxy_url, "https": self.proxy_url}
        return None

    def _get_headers(self) -> Dict[str, str]:
        """获取 HTTP 头"""
        return {"Content-Type": "application/json"}

    def _build_payload(self, batch_content: str, report_data: Dict, report_type: str, **kwargs) -> Dict:
        """构建发送负载（子类覆盖）"""
        return {}

    def _check_response(self, response: requests.Response) -> tuple[bool, str]:
        """检查响应是否成功（子类覆盖）"""
        return response.status_code == 200, ""

    def _get_success_message(self, batch_num: int, total: int, report_type: str) -> str:
        """获取成功消息"""
        return f"{self.CHANNEL_NAME}第 {batch_num}/{total} 批次发送成功 [{report_type}]"

    def _get_error_message(self, batch_num: int, total: int, report_type: str, error: str) -> str:
        """获取错误消息"""
        return f"{self.CHANNEL_NAME}第 {batch_num}/{total} 批次发送失败 [{report_type}]，错误：{error}"

    def _should_retry(self, response: requests.Response) -> bool:
        """判断是否应该重试"""
        return response.status_code in {429, 500, 502, 503, 504}

    def _build_url(self, **kwargs) -> str:
        """构建请求 URL（子类覆盖）"""
        return ""

    def send(
        self,
        report_data: Dict,
        report_type: str,
        update_info: Optional[Dict] = None,
        account_label: str = "",
        **kwargs
    ) -> bool:
        """
        发送报告（支持分批发送）

        Args:
            report_data: 报告数据
            report_type: 报告类型
            update_info: 更新信息（可选）
            account_label: 账号标签（多账号时显示）

        Returns:
            bool: 发送是否成功
        """
        log_prefix = f"{self.CHANNEL_NAME}{account_label}" if account_label else self.CHANNEL_NAME

        # 预留批次头部空间
        header_reserve = get_max_batch_header_size(self.BATCH_HEADER_TYPE or self.CHANNEL_NAME)
        batches = self.split_content_func(
            report_data,
            self.CHANNEL_NAME,
            update_info,
            max_bytes=self.batch_size - header_reserve,
        )

        # 统一添加批次头部
        from .batch import add_batch_headers
        batches = add_batch_headers(batches, self.BATCH_HEADER_TYPE or self.CHANNEL_NAME, self.batch_size)

        self.logger.info(f"{log_prefix}消息分为 {len(batches)} 批次发送 [{report_type}]")

        # 逐批发送
        success_count = 0
        for i, batch_content in enumerate(batches, 1):
            content_size = len(batch_content.encode("utf-8"))
            self.logger.debug(
                f"发送{log_prefix}第 {i}/{len(batches)} 批次，大小：{content_size} 字节 [{report_type}]"
            )

            payload = self._build_payload(batch_content, report_data, report_type, **kwargs)
            url = self._build_url(**kwargs)

            success = self._send_batch(url, payload, i, len(batches), report_type, log_prefix)
            if success:
                success_count += 1
            elif i < len(batches):
                time.sleep(self.batch_interval)

        if success_count == len(batches):
            self.logger.info(f"{log_prefix}所有 {len(batches)} 批次发送完成 [{report_type}]")
            return True
        elif success_count > 0:
            self.logger.warning(f"{log_prefix}部分发送成功：{success_count}/{len(batches)} 批次 [{report_type}]")
            return True
        else:
            self.logger.error(f"{log_prefix}发送完全失败 [{report_type}]")
            return False

    def _send_batch(
        self,
        url: str,
        payload: Dict,
        batch_num: int,
        total: int,
        report_type: str,
        log_prefix: str
    ) -> bool:
        """发送单个批次"""
        proxies = self._get_proxies()
        headers = self._get_headers()

        try:
            response = requests.post(url, headers=headers, json=payload, proxies=proxies, timeout=30)

            if response.status_code == 200:
                success, error = self._check_response(response)
                if success:
                    self.logger.info(self._get_success_message(batch_num, total, report_type))
                    return True
                else:
                    self.logger.warning(self._get_error_message(batch_num, total, report_type, error))
                    return False
            else:
                if self._should_retry(response) and batch_num == 1:
                    # 仅重试第一批
                    self.logger.warning(f"{log_prefix}请求失败，状态码：{response.status_code}，等待后重试...")
                    time.sleep(2)
                    return self._send_batch(url, payload, batch_num, total, report_type, log_prefix)

                self.logger.warning(
                    f"{log_prefix}第 {batch_num}/{total} 批次发送失败 [{report_type}]，状态码：{response.status_code}"
                )
                return False

        except Exception as e:
            self.logger.error(f"{log_prefix}第 {batch_num}/{total} 批次发送出错 [{report_type}]：{e}")
            return False


class WebhookSender(BaseNotificationSender):
    """基于 Webhook 的发送器基类"""

    def __init__(
        self,
        webhook_url: str,
        batch_size: int = None,
        batch_interval: float = 1.0,
        split_content_func: Callable = None,
        proxy_url: Optional[str] = None,
    ):
        super().__init__(batch_size, batch_interval, split_content_func, proxy_url)
        self.webhook_url = webhook_url

    def _build_url(self, **kwargs) -> str:
        return self.webhook_url


class FeishuSender(WebhookSender):
    """飞书发送器"""

    CHANNEL_NAME = "飞书"
    DEFAULT_BATCH_SIZE = 29000
    BATCH_HEADER_TYPE = "feishu"

    def _build_payload(self, batch_content: str, report_data: Dict, report_type: str, **kwargs) -> Dict:
        from datetime import datetime
        total_titles = sum(
            len(stat["titles"]) for stat in report_data["stats"] if stat["count"] > 0
        )
        now = datetime.now()

        return {
            "msg_type": "text",
            "content": {
                "total_titles": total_titles,
                "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
                "report_type": report_type,
                "text": batch_content,
            },
        }

    def _check_response(self, response: requests.Response) -> tuple[bool, str]:
        result = response.json()
        if result.get("StatusCode") == 0 or result.get("code") == 0:
            return True, ""
        return False, result.get("msg") or result.get("StatusMessage", "未知错误")


class DingTalkSender(WebhookSender):
    """钉钉发送器"""

    CHANNEL_NAME = "钉钉"
    DEFAULT_BATCH_SIZE = 20000
    BATCH_HEADER_TYPE = "dingtalk"

    def _build_payload(self, batch_content: str, report_data: Dict, report_type: str, **kwargs) -> Dict:
        return {
            "msgtype": "markdown",
            "markdown": {
                "title": f"TrendRadar 热点分析报告 - {report_type}",
                "text": batch_content,
            },
        }

    def _check_response(self, response: requests.Response) -> tuple[bool, str]:
        result = response.json()
        if result.get("errcode") == 0:
            return True, ""
        return False, result.get("errmsg", "未知错误")


class WeComSender(WebhookSender):
    """企业微信发送器"""

    CHANNEL_NAME = "企业微信"
    DEFAULT_BATCH_SIZE = 4000
    BATCH_HEADER_TYPE = "wework"

    def __init__(
        self,
        webhook_url: str,
        msg_type: str = "markdown",
        batch_size: int = None,
        batch_interval: float = 1.0,
        split_content_func: Callable = None,
        proxy_url: Optional[str] = None,
    ):
        super().__init__(webhook_url, batch_size, batch_interval, split_content_func, proxy_url)
        self.msg_type = msg_type.lower()
        self.header_type = "wework_text" if self.msg_type == "text" else "wework"
        self.BATCH_HEADER_TYPE = self.header_type

    def _build_payload(self, batch_content: str, report_data: Dict, report_type: str, **kwargs) -> Dict:
        if self.msg_type == "text":
            from .formatters import strip_markdown
            plain_content = strip_markdown(batch_content)
            return {"msgtype": "text", "text": {"content": plain_content}}
        else:
            return {"msgtype": "markdown", "markdown": {"content": batch_content}}

    def _check_response(self, response: requests.Response) -> tuple[bool, str]:
        result = response.json()
        if result.get("errcode") == 0:
            return True, ""
        return False, result.get("errmsg", "未知错误")


class SlackSender(WebhookSender):
    """Slack 发送器"""

    CHANNEL_NAME = "Slack"
    DEFAULT_BATCH_SIZE = 4000
    BATCH_HEADER_TYPE = "slack"

    def _build_payload(self, batch_content: str, report_data: Dict, report_type: str, **kwargs) -> Dict:
        from .formatters import convert_markdown_to_mrkdwn
        mrkdwn_content = convert_markdown_to_mrkdwn(batch_content)
        return {"text": mrkdwn_content}

    def _check_response(self, response: requests.Response) -> tuple[bool, str]:
        if response.status_code == 200 and response.text == "ok":
            return True, ""
        return False, response.text or f"状态码：{response.status_code}"


class TelegramSender(BaseNotificationSender):
    """Telegram 发送器"""

    CHANNEL_NAME = "Telegram"
    DEFAULT_BATCH_SIZE = 4000
    BATCH_HEADER_TYPE = "telegram"

    def __init__(
        self,
        bot_token: str,
        chat_id: str,
        batch_size: int = None,
        batch_interval: float = 1.0,
        split_content_func: Callable = None,
        proxy_url: Optional[str] = None,
    ):
        super().__init__(batch_size, batch_interval, split_content_func, proxy_url)
        self.bot_token = bot_token
        self.chat_id = chat_id

    def _build_url(self, **kwargs) -> str:
        return f"https://api.telegram.org/bot{self.bot_token}/sendMessage"

    def _get_headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json"}

    def _build_payload(self, batch_content: str, report_data: Dict, report_type: str, **kwargs) -> Dict:
        return {
            "chat_id": self.chat_id,
            "text": batch_content,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

    def _check_response(self, response: requests.Response) -> tuple[bool, str]:
        result = response.json()
        if result.get("ok"):
            return True, ""
        return False, result.get("description", "未知错误")
