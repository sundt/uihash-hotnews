"""
速率限制模块

提供基于 IP/API Key 的请求频率限制功能。
"""

from collections import deque
from threading import Lock
from typing import Dict, Optional, Tuple
import time

from fastapi import Request
from fastapi.responses import JSONResponse

# 速率限制配置
RATE_LIMIT_REQUESTS = 100  # 每窗口最大请求数
RATE_LIMIT_WINDOW = 60  # 窗口大小（秒）

# 存储: {client_id: [timestamp1, timestamp2, ...]}
_rate_limit_storage: Dict[str, deque] = {}
_rate_limit_lock = Lock()


def _get_client_identifier(request: Request) -> str:
    """获取客户端唯一标识符（IP或API Key）"""
    # 优先使用 X-Forwarded-For（如果配置了代理）
    forwarded = request.headers.get("X-Forwarded-For", "").strip()
    if forwarded:
        # 取第一个IP（原始客户端IP）
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    # 如果有API Key，使用API Key
    api_key = request.headers.get("X-API-Key", "").strip()
    if api_key:
        return f"apikey:{api_key[:16]}"  # 只取前16字符用于标识

    return f"ip:{client_ip}"


def is_rate_limited(client_id: str) -> Tuple[bool, int]:
    """
    检查是否超过速率限制

    Args:
        client_id: 客户端标识符

    Returns:
        (是否被限制, 剩余可用请求数)
    """
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    with _rate_limit_lock:
        # 获取或创建该客户端的时间戳队列
        if client_id not in _rate_limit_storage:
            _rate_limit_storage[client_id] = deque(maxlen=RATE_LIMIT_REQUESTS + 10)

        timestamps = _rate_limit_storage[client_id]

        # 清理过期的 timestamp
        while timestamps and timestamps[0] < window_start:
            timestamps.popleft()

        # 检查是否超过限制
        remaining = RATE_LIMIT_REQUESTS - len(timestamps)
        if len(timestamps) >= RATE_LIMIT_REQUESTS:
            return True, remaining

        # 记录当前请求
        timestamps.append(now)
        return False, remaining


def check_rate_limit(request: Request, skip_paths: Optional[set] = None) -> Tuple[bool, JSONResponse]:
    """
    检查请求是否超过速率限制

    Args:
        request: FastAPI 请求对象
        skip_paths: 不需要检查速率限制的路径

    Returns:
        (是否被限制, 响应对象)
    """
    if skip_paths is None:
        skip_paths = {"/", "/health", "/healthz", "/static"}

    path = request.url.path

    # 跳过静态资源和特定路径
    if path.startswith("/static"):
        return False, None

    if path in skip_paths:
        return False, None

    client_id = _get_client_identifier(request)
    is_limited, remaining = is_rate_limited(client_id)

    if is_limited:
        response = JSONResponse(
            content={
                "error": "Rate limit exceeded",
                "message": f"请求过于频繁，请等待 {RATE_LIMIT_WINDOW} 秒后重试",
                "retry_after": RATE_LIMIT_WINDOW,
            },
            status_code=429,
        )
        response.headers["Retry-After"] = str(RATE_LIMIT_WINDOW)
        response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
        response.headers["X-RateLimit-Remaining"] = "0"
        return True, response

    return False, None


def add_rate_limit_headers(response, remaining: int) -> None:
    """为响应添加速率限制头信息"""
    response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
    response.headers["X-RateLimit-Remaining"] = str(max(0, remaining))


def reset_rate_limit_storage() -> None:
    """清空速率限制存储（主要用于测试）"""
    global _rate_limit_storage
    with _rate_limit_lock:
        _rate_limit_storage = {}


def get_rate_limit_stats() -> Dict:
    """获取速率限制统计信息"""
    with _rate_limit_lock:
        total_clients = len(_rate_limit_storage)
        total_requests = sum(len(q) for q in _rate_limit_storage.values())
        return {
            "total_clients": total_clients,
            "total_requests": total_requests,
            "window_seconds": RATE_LIMIT_WINDOW,
            "max_requests": RATE_LIMIT_REQUESTS,
        }
