import hashlib
import os
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from trendradar.web.db_online import get_online_db_conn


router = APIRouter()


def _now_ts() -> int:
    return int(datetime.now().timestamp())


def _require_admin(request: Request) -> str:
    token = (os.environ.get("TREND_RADAR_ADMIN_TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=403, detail="Admin not configured")

    got = (request.headers.get("X-Admin-Token") or "").strip()
    if not got:
        got = (request.query_params.get("token") or "").strip()
    if got != token:
        raise HTTPException(status_code=403, detail="Forbidden")
    return token


def rss_usage_client_key(request: Request) -> str:
    xff = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    ip = xff or (getattr(getattr(request, "client", None), "host", "") or "")
    ua = (request.headers.get("User-Agent") or "").strip()
    salt = (os.environ.get("TREND_RADAR_METRICS_SALT") or "").strip()
    raw = f"{ip}|{ua}|{salt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def rss_usage_record(project_root, request: Request, subs_count: int) -> None:
    try:
        conn = get_online_db_conn(project_root)
        ts = _now_ts()
        day = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
        ck = rss_usage_client_key(request)
        conn.execute(
            "INSERT INTO rss_usage_events(ts, day, client_key, subs_count) VALUES(?, ?, ?, ?)",
            (int(ts), day, ck, int(subs_count)),
        )
        if int(ts) % 97 == 0:
            cutoff = int(ts) - 90 * 24 * 60 * 60
            conn.execute("DELETE FROM rss_usage_events WHERE ts < ?", (int(cutoff),))
        conn.commit()
    except Exception:
        return


@router.get("/api/admin/rss-usage")
async def api_admin_rss_usage(request: Request, days: int = Query(7, ge=1, le=180)):
    _require_admin(request)
    now = _now_ts()
    start_ts = int(now - int(days) * 24 * 60 * 60)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute(
        """
        SELECT day,
               COUNT(*) as requests,
               COUNT(DISTINCT client_key) as unique_clients,
               AVG(subs_count) as avg_subs,
               MAX(subs_count) as max_subs,
               SUM(subs_count) as total_subs
        FROM rss_usage_events
        WHERE ts >= ?
        GROUP BY day
        ORDER BY day DESC
        """,
        (int(start_ts),),
    )
    rows = cur.fetchall() or []
    out = []
    for r in rows:
        out.append(
            {
                "day": str(r[0] or ""),
                "requests": int(r[1] or 0),
                "unique_clients": int(r[2] or 0),
                "avg_subs": float(r[3] or 0.0),
                "max_subs": int(r[4] or 0),
                "total_subs": int(r[5] or 0),
            }
        )
    return JSONResponse(content={"days": int(days), "items": out})
