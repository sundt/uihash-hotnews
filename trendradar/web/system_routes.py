import json
import os
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response

from mcp_server.services.cache_service import get_cache
from trendradar.web import auto_fetch_scheduler


router = APIRouter()


class UnicodeJSONResponse(Response):
    media_type = "application/json"

    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


def _get_fetch_news_data(request: Request) -> Callable[[], Awaitable[Any]]:
    fn = getattr(request.app.state, "fetch_news_data", None)
    if not callable(fn):
        raise RuntimeError("fetch_news_data not configured")
    return fn


@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "TrendRadar News Viewer",
        "health_schema": "2",
        "version": os.environ.get("APP_VERSION", "unknown"),
        "config_rev": os.environ.get("CONFIG_REV", "0"),
    }


@router.post("/api/scheduler/start")
async def api_start_scheduler(request: Request, interval: int = Query(30, ge=5, le=1440)):
    fn = _get_fetch_news_data(request)
    auto_fetch_scheduler.start_scheduler(lambda: fn(), interval)
    return UnicodeJSONResponse(
        content={
            "success": True,
            "message": f"定时任务已启动，间隔 {interval} 分钟",
            "interval_minutes": interval,
        }
    )


@router.post("/api/scheduler/stop")
async def api_stop_scheduler():
    auto_fetch_scheduler.stop_scheduler()
    return UnicodeJSONResponse(content={"success": True, "message": "定时任务已停止"})


@router.get("/api/scheduler/status")
async def api_scheduler_status():
    st = auto_fetch_scheduler.status()
    last_dt = st.get("last_fetch_time")
    return UnicodeJSONResponse(
        content={
            "running": bool(st.get("running")),
            "interval_minutes": int(st.get("interval_minutes") or 0),
            "last_fetch_time": last_dt.isoformat() if last_dt else None,
        }
    )


@router.post("/api/fetch")
async def api_fetch_now(request: Request):
    fn = _get_fetch_news_data(request)
    result = await fn()
    try:
        get_cache().clear()
    except Exception:
        pass
    return UnicodeJSONResponse(content=result)
