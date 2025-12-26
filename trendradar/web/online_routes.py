import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from trendradar.web.db_online import get_online_db_conn


router = APIRouter()


def _conn_from_request(request: Request):
    return get_online_db_conn(project_root=request.app.state.project_root)


@router.post("/api/online/ping")
async def online_ping(request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return JSONResponse(content={"detail": "Missing session_id"}, status_code=400)

    now = int(time.time())
    conn = _conn_from_request(request)
    conn.execute(
        "INSERT OR REPLACE INTO online_sessions(session_id, last_seen) VALUES (?, ?)",
        (session_id, now),
    )
    conn.execute("DELETE FROM online_sessions WHERE last_seen < ?", (now - 86400,))
    conn.commit()

    return JSONResponse(content={"ok": True})


@router.get("/api/online")
async def online_stats(request: Request):
    now = int(time.time())
    conn = _conn_from_request(request)

    def count_since(seconds: int) -> int:
        cur = conn.execute(
            "SELECT COUNT(*) FROM online_sessions WHERE last_seen >= ?",
            (now - seconds,),
        )
        row = cur.fetchone()
        return int(row[0] if row else 0)

    stats: dict[str, Any] = {
        "online_1m": count_since(60),
        "online_5m": count_since(5 * 60),
        "online_15m": count_since(15 * 60),
        "server_time": now,
    }

    return JSONResponse(content=stats)
