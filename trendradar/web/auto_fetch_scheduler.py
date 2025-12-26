import asyncio
from datetime import datetime
from typing import Awaitable, Callable, Optional


_scheduler_task: Optional[asyncio.Task] = None
_scheduler_running: bool = False
_last_fetch_time: Optional[datetime] = None
_fetch_interval_minutes: int = 30


def record_last_fetch_time(dt: datetime) -> None:
    global _last_fetch_time
    _last_fetch_time = dt


async def scheduler_loop(fetch_coro_factory: Callable[[], Awaitable[object]]) -> None:
    global _scheduler_running

    while _scheduler_running:
        await fetch_coro_factory()
        await asyncio.sleep(_fetch_interval_minutes * 60)


def start_scheduler(fetch_coro_factory: Callable[[], Awaitable[object]], interval_minutes: int = 30) -> None:
    global _scheduler_task, _scheduler_running, _fetch_interval_minutes

    if _scheduler_running:
        return

    _fetch_interval_minutes = interval_minutes
    _scheduler_running = True
    _scheduler_task = asyncio.create_task(scheduler_loop(fetch_coro_factory))


def stop_scheduler() -> None:
    global _scheduler_task, _scheduler_running

    _scheduler_running = False
    if _scheduler_task:
        _scheduler_task.cancel()
        _scheduler_task = None


def status() -> dict:
    return {
        "running": _scheduler_running,
        "interval_minutes": _fetch_interval_minutes,
        "last_fetch_time": _last_fetch_time,
    }
