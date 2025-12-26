import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response


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


def _get_metrics_items(request: Request) -> List[Dict[str, Any]]:
    fn = getattr(request.app.state, "fetch_metrics_get_items", None)
    if callable(fn):
        items = fn()
        return items if isinstance(items, list) else []
    return []


def _get_metrics_max(request: Request) -> int:
    v = getattr(request.app.state, "fetch_metrics_max", None)
    try:
        return int(v)
    except Exception:
        return 5000


@router.get("/api/fetch-metrics")
async def api_fetch_metrics(
    request: Request,
    limit: int = Query(200, ge=1),
    platform: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
):
    max_n = _get_metrics_max(request)
    if limit > max_n:
        limit = max_n

    items = _get_metrics_items(request)

    if provider:
        items = [m for m in items if str(m.get("provider") or "").strip() == provider]
    if platform:
        items = [m for m in items if str(m.get("platform_id") or "").strip() == platform]

    items = items[-limit:]

    summary: Dict[str, Any] = {}
    for m in items:
        pid = str(m.get("platform_id") or "").strip() or "unknown"
        ent = summary.get(pid)
        if ent is None:
            ent = {
                "platform_id": pid,
                "platform_name": m.get("platform_name") or pid,
                "provider": m.get("provider") or "",
                "success": 0,
                "cache": 0,
                "error": 0,
                "avg_duration_ms": None,
                "avg_items_count": None,
                "avg_changed_count": None,
                "last_status": None,
                "last_fetched_at": None,
                "last_changed_count": None,
                "last_content_hash": None,
            }
            summary[pid] = ent

        st = str(m.get("status") or "").strip()
        if st in ("success", "cache", "error"):
            ent[st] += 1
        else:
            ent["error"] += 1

        ent["last_status"] = st
        ent["last_fetched_at"] = m.get("fetched_at")
        ent["last_changed_count"] = m.get("changed_count")
        ent["last_content_hash"] = m.get("content_hash")

        dur = m.get("duration_ms")
        cnt = m.get("items_count")
        chg = m.get("changed_count")
        if isinstance(dur, (int, float)):
            ent.setdefault("_dur_sum", 0)
            ent.setdefault("_dur_n", 0)
            ent["_dur_sum"] += float(dur)
            ent["_dur_n"] += 1
        if isinstance(cnt, (int, float)):
            ent.setdefault("_cnt_sum", 0)
            ent.setdefault("_cnt_n", 0)
            ent["_cnt_sum"] += float(cnt)
            ent["_cnt_n"] += 1
        if isinstance(chg, (int, float)):
            ent.setdefault("_chg_sum", 0)
            ent.setdefault("_chg_n", 0)
            ent["_chg_sum"] += float(chg)
            ent["_chg_n"] += 1

    for ent in summary.values():
        dn = ent.pop("_dur_n", 0)
        ds = ent.pop("_dur_sum", 0)
        cn = ent.pop("_cnt_n", 0)
        cs = ent.pop("_cnt_sum", 0)
        hn = ent.pop("_chg_n", 0)
        hs = ent.pop("_chg_sum", 0)
        if dn:
            ent["avg_duration_ms"] = int(ds / dn)
        if cn:
            ent["avg_items_count"] = round(cs / cn, 2)
        if hn:
            ent["avg_changed_count"] = round(hs / hn, 2)

    return UnicodeJSONResponse(content={"limit": limit, "metrics": items, "summary": list(summary.values())})
