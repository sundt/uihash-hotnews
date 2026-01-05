import hashlib
import os
import asyncio
import csv
import io
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Body, HTTPException, Query, Request, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from trendradar.web.db_online import get_online_db_conn
from trendradar.web.user_db import added_counts, get_user_db_conn, subscriber_counts


router = APIRouter()


def _ensure_admin_kv(conn) -> None:
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()
    except Exception:
        return


def _default_morning_brief_rules() -> Dict[str, Any]:
    return {
        "enabled": True,
        "drop_published_at_zero": True,
        "topic_keywords": [
            "ai",
            "llm",
            "gpt",
            "agent",
            "rag",
            "diffusion",
            "transformer",
            "multimodal",
            "openai",
            "anthropic",
            "deepmind",
            "人工智能",
            "大模型",
            "机器学习",
            "深度学习",
            "多模态",
            "微调",
            "推理",
            "训练",
            "开源",
            "模型",
            "芯片",
            "gpu",
            "cuda",
            "数据库",
            "安全",
            "云原生",
            "kubernetes",
            "容器",
            "编程",
            "系统设计",
        ],
        "depth_keywords": [
            "architecture",
            "benchmark",
            "inference",
            "training",
            "evaluation",
            "paper",
            "open-source",
            "quantization",
            "fine-tune",
            "optimization",
            "性能",
            "评测",
            "论文",
            "架构",
            "工程",
            "优化",
        ],
        "negative_hard": ["casino", "gambling", "betting"],
        "negative_soft": ["roundup", "weekly", "top 10", "listicle", "beginner"],
        "negative_exempt_domains": [],
        "source_scores": {},
        "source_decay": {"second": 0.6, "third_plus": 0.3},
        "overrides": {"force_top": [], "force_blacklist": []},
    }


def _now_ts() -> int:
    return int(datetime.now().timestamp())


def _parse_ts_loose(v: Any) -> int:
    try:
        if v is None:
            return 0
        if isinstance(v, (int, float)):
            return int(v)
        s = str(v).strip()
        if not s:
            return 0
        try:
            return int(float(s))
        except Exception:
            pass

        for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return int(datetime.strptime(s, fmt).timestamp())
            except Exception:
                continue
        return 0
    except Exception:
        return 0


def _md5_hex(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def _validate_and_normalize_url(raw_url: str) -> str:
    u = (raw_url or "").strip()
    if not u:
        raise ValueError("Missing url")
    parsed = urlparse(u)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Invalid url scheme")
    if not parsed.netloc:
        raise ValueError("Invalid url")
    if parsed.username or parsed.password:
        raise ValueError("Invalid url")
    normalized = parsed._replace(fragment="").geturl().strip()
    return normalized


def _extract_host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").strip().lower() or "-"
    except Exception:
        return "-"


def _detect_csv_format(csv_text: str) -> str:
    first = ""
    for line in (csv_text or "").splitlines():
        if line.strip():
            first = line.strip()
            break
    if not first:
        return "unknown"
    if "订阅地址" in first or "标题" in first:
        return "headered_zh"
    return "headerless_fixed"


def _parse_csv_text(csv_text: str) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    fmt = _detect_csv_format(csv_text)
    items: List[Dict[str, Any]] = []
    invalid: List[Dict[str, Any]] = []

    if fmt == "headered_zh":
        f = io.StringIO(csv_text or "")
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            if not isinstance(row, dict):
                continue
            try:
                name = (row.get("标题") or "").strip()
                url_raw = (row.get("订阅地址") or "").strip()
                seed_last_updated = (row.get("最后更新") or "").strip()
                category = (row.get("分类") or "").strip()
                feed_type = (row.get("类型") or "").strip()
                country = (row.get("国家") or "").strip()
                language = (row.get("语言") or "").strip()
                source = (row.get("来源") or "").strip()

                url = _validate_and_normalize_url(url_raw)
                if not name:
                    name = _extract_host(url)
                items.append(
                    {
                        "line_no": i,
                        "name": name,
                        "url": url,
                        "seed_last_updated": seed_last_updated,
                        "category": category,
                        "feed_type": feed_type,
                        "country": country,
                        "language": language,
                        "source": source,
                    }
                )
            except Exception as e:
                invalid.append({"line_no": i, "error": str(e)})
        return fmt, items, invalid

    if fmt == "headerless_fixed":
        f = io.StringIO(csv_text or "")
        reader = csv.reader(f)
        for i, row in enumerate(reader, start=1):
            if not isinstance(row, list):
                continue
            if not any((str(x or "").strip() for x in row)):
                continue
            try:
                cols = [str(x or "").strip() for x in row]
                if len(cols) != 8:
                    raise ValueError("Wrong column count")
                name = cols[0]
                url_raw = cols[1]
                seed_last_updated = cols[2]
                category = cols[3]
                feed_type = cols[4]
                country = cols[5]
                language = cols[6]
                source = cols[7]
                url = _validate_and_normalize_url(url_raw)
                if not name:
                    name = _extract_host(url)
                items.append(
                    {
                        "line_no": i,
                        "name": name,
                        "url": url,
                        "seed_last_updated": seed_last_updated,
                        "category": category,
                        "feed_type": feed_type,
                        "country": country,
                        "language": language,
                        "source": source,
                    }
                )
            except Exception as e:
                invalid.append({"line_no": i, "error": str(e)})
        return fmt, items, invalid

    invalid.append({"line_no": 1, "error": "Unknown CSV format"})
    return fmt, items, invalid


def _preview_hash(csv_text: str) -> str:
    return _md5_hex((csv_text or "").strip())


def _upsert_rss_source(*, conn, item: Dict[str, Any], now: int, write: bool) -> str:
    url = str(item.get("url") or "").strip()
    cur = conn.execute("SELECT id FROM rss_sources WHERE url = ? LIMIT 1", (url,))
    row = cur.fetchone()
    if row and str(row[0] or "").strip():
        sid = str(row[0]).strip()
        if write:
            conn.execute(
                """
                UPDATE rss_sources
                SET name = ?,
                    host = ?,
                    category = ?,
                    feed_type = ?,
                    country = ?,
                    language = ?,
                    source = ?,
                    seed_last_updated = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    str(item.get("name") or "").strip() or _extract_host(url),
                    _extract_host(url),
                    str(item.get("category") or "").strip(),
                    str(item.get("feed_type") or "").strip(),
                    str(item.get("country") or "").strip(),
                    str(item.get("language") or "").strip(),
                    str(item.get("source") or "").strip(),
                    str(item.get("seed_last_updated") or "").strip(),
                    int(now),
                    sid,
                ),
            )
        return "updated"

    host = _extract_host(url)
    sid = f"rsssrc-{_md5_hex(url)[:12]}"
    if write:
        conn.execute(
            """
            INSERT OR IGNORE INTO rss_sources(
                id, name, url, host, category, feed_type, country, language, source, seed_last_updated,
                enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                sid,
                str(item.get("name") or "").strip() or host,
                url,
                host,
                str(item.get("category") or "").strip(),
                str(item.get("feed_type") or "").strip(),
                str(item.get("country") or "").strip(),
                str(item.get("language") or "").strip(),
                str(item.get("source") or "").strip(),
                str(item.get("seed_last_updated") or "").strip(),
                int(now),
                int(now),
            ),
        )
        cur2 = conn.execute("SELECT changes()")
        changes = int((cur2.fetchone() or [0])[0] or 0)
        return "inserted" if changes > 0 else "skipped"
    return "inserted"


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


def _templates(request: Request):
    t = getattr(request.app.state, "templates", None)
    if t is None:
        raise HTTPException(status_code=500, detail="Templates not configured")
    return t


def _call_init_default_sources(request: Request) -> None:
    fn = getattr(request.app.state, "init_default_rss_sources_if_empty", None)
    if callable(fn):
        try:
            fn()
        except Exception:
            pass


@router.get("/api/admin/morning-brief/rules")
async def api_admin_morning_brief_get_rules(request: Request):
    _require_admin(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    _ensure_admin_kv(conn)
    try:
        cur = conn.execute("SELECT value, updated_at FROM admin_kv WHERE key = ? LIMIT 1", ("morning_brief_rules_v1",))
        row = cur.fetchone()
    except Exception:
        row = None

    raw = ""
    updated_at = 0
    if row:
        raw = str(row[0] or "")
        try:
            updated_at = int(row[1] or 0)
        except Exception:
            updated_at = 0

    rules: Dict[str, Any] = _default_morning_brief_rules()
    if raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                rules = {**rules, **parsed}
        except Exception:
            pass

    return JSONResponse(content={"ok": True, "key": "morning_brief_rules_v1", "rules": rules, "updated_at": int(updated_at)})


@router.post("/api/admin/morning-brief/rules")
async def api_admin_morning_brief_set_rules(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    rules = body.get("rules")
    if isinstance(rules, str):
        try:
            rules = json.loads(rules)
        except Exception:
            return JSONResponse(content={"detail": "Invalid rules JSON"}, status_code=400)

    if not isinstance(rules, dict):
        return JSONResponse(content={"detail": "Missing rules"}, status_code=400)

    try:
        raw = json.dumps(rules, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        return JSONResponse(content={"detail": "Rules not JSON serializable"}, status_code=400)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    _ensure_admin_kv(conn)
    now = _now_ts()
    conn.execute(
        "INSERT OR REPLACE INTO admin_kv(key, value, updated_at) VALUES (?, ?, ?)",
        ("morning_brief_rules_v1", raw, int(now)),
    )
    conn.commit()
    return JSONResponse(content={"ok": True, "key": "morning_brief_rules_v1", "updated_at": int(now)})


@router.get("/api/admin/morning-brief/ai-stats")
async def api_admin_morning_brief_ai_stats(request: Request):
    _require_admin(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)

    try:
        cur = conn.execute("SELECT COUNT(*) FROM rss_entries")
        total_entries = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        total_entries = -1

    try:
        cur = conn.execute("SELECT COUNT(*) FROM rss_entry_ai_labels")
        labeled_entries = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        labeled_entries = -1

    try:
        cur = conn.execute("SELECT COUNT(*) FROM rss_entry_ai_labels WHERE action='include'")
        included_entries = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        included_entries = -1

    try:
        cur = conn.execute("SELECT MAX(labeled_at) FROM rss_entry_ai_labels")
        last_labeled_at = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        last_labeled_at = 0

    backlog_unlabeled = None
    try:
        cur = conn.execute(
            """
            SELECT COUNT(*)
            FROM rss_entries e
            LEFT JOIN rss_entry_ai_labels l
              ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
            WHERE l.id IS NULL
            """
        )
        backlog_unlabeled = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        backlog_unlabeled = None

    include_ratio = None
    try:
        if labeled_entries and labeled_entries > 0 and included_entries is not None and included_entries >= 0:
            include_ratio = float(included_entries) / float(labeled_entries)
    except Exception:
        include_ratio = None

    return JSONResponse(
        content={
            "ok": True,
            "total_entries": total_entries,
            "labeled_entries": labeled_entries,
            "included_entries": included_entries,
            "include_ratio": include_ratio,
            "backlog_unlabeled": backlog_unlabeled,
            "last_labeled_at": last_labeled_at,
            "ai_enabled": (os.environ.get("TREND_RADAR_MB_AI_ENABLED") or "0"),
            "model": (os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus"),
        }
    )


@router.post("/api/admin/morning-brief/ai-run")
async def api_admin_morning_brief_ai_run(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    batch_size = body.get("batch_size")
    force = body.get("force")

    bs = 20
    try:
        bs = int(batch_size or 20)
    except Exception:
        bs = 20
    bs = max(1, min(50, bs))

    f = False
    try:
        f = bool(force)
    except Exception:
        f = False

    runner = getattr(request.app.state, "mb_ai_run_once", None)
    if not callable(runner):
        return JSONResponse(content={"ok": False, "detail": "mb_ai_runner_not_available"}, status_code=400)

    try:
        result = await runner(batch_size=bs, force=f)
        return JSONResponse(content={"ok": True, "result": result})
    except Exception as e:
        return JSONResponse(content={"ok": False, "error": str(e)[:500]}, status_code=500)


@router.get("/api/rss-sources/warmup")
async def api_rss_sources_warmup_help():
    return JSONResponse(
        content={
            "detail": "Use POST /api/rss-sources/warmup with JSON body {source_ids: [...], priority: 'high'|'normal'|int}.",
            "example": {
                "method": "POST",
                "url": "/api/rss-sources/warmup?wait_ms=800",
                "json": {"source_ids": ["<source_id>"], "priority": "high"},
            },
        }
    )


@router.post("/api/rss-sources/warmup")
async def api_rss_sources_warmup(request: Request, wait_ms: int = Query(0)):
    try:
        body = await request.json()
    except Exception:
        body = {}

    source_ids = body.get("source_ids") if isinstance(body, dict) else None
    if not isinstance(source_ids, list):
        source_ids = []

    priority_raw = body.get("priority") if isinstance(body, dict) else None
    priority = 10
    if isinstance(priority_raw, int):
        priority = int(priority_raw)
    elif isinstance(priority_raw, str):
        p = priority_raw.strip().lower()
        if p in {"high", "p0", "0"}:
            priority = 0
        elif p in {"low", "p4", "10"}:
            priority = 10
        elif p.isdigit():
            priority = int(p)

    ids: List[str] = []
    for s in source_ids:
        sid = (str(s or "")).strip()
        if sid:
            ids.append(sid)

    cap = 25
    ids = ids[:cap]

    enqueue = getattr(request.app.state, "rss_enqueue_warmup", None)
    if not callable(enqueue):
        return JSONResponse(content={"queued": 0, "results": [], "detail": "warmup not available"})

    futures = []
    for sid in ids:
        try:
            fut = await enqueue(sid, priority=priority)
            if fut is not None:
                futures.append((sid, fut))
        except Exception:
            continue

    results = []
    if wait_ms and wait_ms > 0 and futures:
        timeout_s = min(3.0, max(0.0, float(wait_ms) / 1000.0))
        done, pending = await asyncio.wait(
            [f for _, f in futures],
            timeout=timeout_s,
        )
        done_set = set(done)
        for sid, fut in futures:
            if fut in done_set:
                try:
                    results.append(fut.result())
                except Exception as e:
                    results.append({"ok": False, "source_id": sid, "error": str(e)})
            else:
                results.append({"queued": True, "source_id": sid})

        try:
            for p in pending:
                p.cancel()
        except Exception:
            pass
    else:
        for sid, _ in futures:
            results.append({"queued": True, "source_id": sid})

    return JSONResponse(content={"queued": len(futures), "results": results})


@router.get("/api/admin/rss-source-requests")
async def api_admin_list_rss_source_requests(request: Request, status: str = Query("pending")):
    _require_admin(request)
    st = (status or "").strip().lower() or "pending"
    if st not in {"pending", "approved", "rejected", "all"}:
        st = "pending"

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    if st == "all":
        cur = conn.execute(
            "SELECT id, url, host, title, note, status, reason, created_at, reviewed_at, source_id FROM rss_source_requests ORDER BY id DESC LIMIT 200"
        )
    else:
        cur = conn.execute(
            "SELECT id, url, host, title, note, status, reason, created_at, reviewed_at, source_id FROM rss_source_requests WHERE status = ? ORDER BY id DESC LIMIT 200",
            (st,),
        )
    rows = cur.fetchall() or []
    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "id": int(r[0]),
                "url": r[1],
                "host": r[2],
                "title": r[3] or "",
                "note": r[4] or "",
                "status": r[5],
                "reason": r[6] or "",
                "created_at": int(r[7]),
                "reviewed_at": int(r[8] or 0),
                "source_id": r[9] or "",
            }
        )
    return JSONResponse(content={"requests": items})


@router.post("/api/admin/rss-sources/set-enabled")
async def api_admin_rss_sources_set_enabled(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    source_id = str(body.get("source_id") or "").strip()
    enabled_raw = body.get("enabled")
    enabled = 1 if str(enabled_raw).strip().lower() in {"1", "true", "yes", "on"} else 0

    if not source_id:
        return JSONResponse(content={"detail": "Missing source_id"}, status_code=400)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute("SELECT id FROM rss_sources WHERE id = ?", (source_id,))
    row = cur.fetchone()
    if not row:
        return JSONResponse(content={"detail": "Source not found"}, status_code=404)

    now = _now_ts()
    conn.execute(
        "UPDATE rss_sources SET enabled = ?, updated_at = ? WHERE id = ?",
        (int(enabled), int(now), source_id),
    )
    conn.commit()
    return JSONResponse(content={"ok": True, "source_id": source_id, "enabled": int(enabled)})


@router.post("/api/admin/rss-sources/bulk-disable")
async def api_admin_rss_sources_bulk_disable(request: Request):
    _require_admin(request)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()

    try:
        cur = conn.execute("SELECT COUNT(*) FROM rss_sources WHERE enabled = 1")
        to_disable = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        to_disable = 0

    conn.execute(
        "UPDATE rss_sources SET enabled = 0, updated_at = ? WHERE enabled = 1",
        (int(now),),
    )
    conn.commit()

    return JSONResponse(content={"ok": True, "disabled": int(to_disable)})


@router.post("/api/admin/rss-sources/bulk-enable")
async def api_admin_rss_sources_bulk_enable(request: Request):
    _require_admin(request)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()

    try:
        cur = conn.execute("SELECT COUNT(*) FROM rss_sources WHERE enabled = 0")
        to_enable = int((cur.fetchone() or [0])[0] or 0)
    except Exception:
        to_enable = 0

    conn.execute(
        "UPDATE rss_sources SET enabled = 1, updated_at = ? WHERE enabled = 0",
        (int(now),),
    )
    conn.commit()

    return JSONResponse(content={"ok": True, "enabled": int(to_enable)})


@router.post("/api/admin/rss-sources/bulk-disable-by-urls")
async def api_admin_rss_sources_bulk_disable_by_urls(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)

    if not isinstance(body, dict):
        body = {}
    urls_raw = body.get("urls")
    if not isinstance(urls_raw, list):
        return JSONResponse(content={"detail": "Invalid urls"}, status_code=400)

    uniq: List[str] = []
    seen = set()
    invalid: List[str] = []
    for u in urls_raw:
        try:
            normalized = _validate_and_normalize_url(str(u or ""))
        except Exception:
            s = str(u or "").strip()
            if s:
                invalid.append(s)
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        uniq.append(normalized)

    if not uniq:
        return JSONResponse(content={"ok": True, "matched": 0, "disabled": 0, "not_found": [], "invalid": invalid})

    cap = 500
    uniq = uniq[:cap]

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()

    placeholders = ",".join(["?"] * len(uniq))
    cur = conn.execute(
        f"SELECT id, url, enabled FROM rss_sources WHERE url IN ({placeholders})",
        tuple(uniq),
    )
    rows = cur.fetchall() or []

    found_urls = set()
    ids_to_disable: List[str] = []
    for r in rows:
        try:
            sid = str(r[0] or "").strip()
            url = str(r[1] or "").strip()
            enabled = int(r[2] or 0)
        except Exception:
            continue
        if not sid or not url:
            continue
        found_urls.add(url)
        if enabled == 1:
            ids_to_disable.append(sid)

    not_found = [u for u in uniq if u not in found_urls]

    disabled = 0
    if ids_to_disable:
        id_ph = ",".join(["?"] * len(ids_to_disable))
        conn.execute(
            f"UPDATE rss_sources SET enabled = 0, updated_at = ? WHERE id IN ({id_ph})",
            tuple([int(now)] + ids_to_disable),
        )
        conn.commit()
        disabled = len(ids_to_disable)

    return JSONResponse(
        content={
            "ok": True,
            "matched": int(len(found_urls)),
            "disabled": int(disabled),
            "not_found": not_found,
            "invalid": invalid,
            "capped": int(cap),
        }
    )


@router.post("/api/admin/rss-source-requests/{request_id}/approve")
async def api_admin_approve_rss_source_request(
    request_id: int, request: Request, body: Dict[str, Any] = Body(None)
):
    _require_admin(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute(
        "SELECT id, url, host, title, status FROM rss_source_requests WHERE id = ?",
        (int(request_id),),
    )
    row = cur.fetchone()
    if not row:
        return JSONResponse(content={"detail": "Request not found"}, status_code=404)
    if str(row[4]) != "pending":
        return JSONResponse(content={"detail": "Request not pending"}, status_code=400)

    url = str(row[1] or "")
    host = str(row[2] or "")
    req_title = str(row[3] or "").strip()
    name = ""
    if isinstance(body, dict):
        name = (body.get("name") or "").strip()
    if not name:
        name = req_title or host or "RSS"

    now = _now_ts()
    source_id = f"rsssrc-{_md5_hex(url)[:12]}"
    conn.execute(
        "INSERT OR REPLACE INTO rss_sources(id, name, url, host, category, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, COALESCE((SELECT category FROM rss_sources WHERE id = ?), ''), 1, ?, ?)",
        (source_id, name, url, host, source_id, now, now),
    )
    conn.execute(
        "UPDATE rss_source_requests SET status='approved', reason='', reviewed_at=?, source_id=? WHERE id=?",
        (now, source_id, int(request_id)),
    )
    conn.commit()

    enqueue = getattr(request.app.state, "rss_enqueue_warmup", None)
    if callable(enqueue):
        try:
            await enqueue(source_id, priority=0)
        except Exception:
            pass

    return JSONResponse(content={"ok": True, "source_id": source_id})


@router.post("/api/admin/rss-source-requests/{request_id}/reject")
async def api_admin_reject_rss_source_request(
    request_id: int, request: Request, body: Dict[str, Any] = Body(None)
):
    _require_admin(request)
    reason = ""
    if isinstance(body, dict):
        reason = (body.get("reason") or "").strip()
    if not reason:
        reason = "Rejected"

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute(
        "SELECT id, status FROM rss_source_requests WHERE id = ?",
        (int(request_id),),
    )
    row = cur.fetchone()
    if not row:
        return JSONResponse(content={"detail": "Request not found"}, status_code=404)
    if str(row[1]) != "pending":
        return JSONResponse(content={"detail": "Request not pending"}, status_code=400)

    now = _now_ts()
    conn.execute(
        "UPDATE rss_source_requests SET status='rejected', reason=?, reviewed_at=? WHERE id=?",
        (reason, now, int(request_id)),
    )
    conn.commit()
    return JSONResponse(content={"ok": True})


@router.post("/api/admin/rss-source-requests/{request_id}/reopen")
async def api_admin_reopen_rss_source_request(request_id: int, request: Request):
    _require_admin(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute(
        "SELECT id, status FROM rss_source_requests WHERE id = ?",
        (int(request_id),),
    )
    row = cur.fetchone()
    if not row:
        return JSONResponse(content={"detail": "Request not found"}, status_code=404)
    if str(row[1]) != "rejected":
        return JSONResponse(content={"detail": "Request not rejected"}, status_code=400)

    conn.execute(
        "UPDATE rss_source_requests SET status='pending', reason='', reviewed_at=0 WHERE id=?",
        (int(request_id),),
    )
    conn.commit()
    return JSONResponse(content={"ok": True})


@router.post("/api/admin/rss-sources/import-csv/preview")
async def api_admin_rss_sources_import_csv_preview(request: Request):
    _require_admin(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    csv_text = (body.get("csv_text") if isinstance(body, dict) else "") or ""
    csv_text = str(csv_text)
    if not csv_text.strip():
        return JSONResponse(content={"detail": "Missing csv_text"}, status_code=400)

    fmt, parsed, invalid = _parse_csv_text(csv_text)

    cap = 1000
    if len(parsed) > cap:
        parsed = parsed[:cap]

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute("SELECT url FROM rss_sources")
    existing_urls = {str(r[0] or "").strip() for r in (cur.fetchall() or [])}
    existing_urls.discard("")

    seen: Dict[str, int] = {}
    duplicates: List[Dict[str, Any]] = []
    unique_items: List[Dict[str, Any]] = []
    for it in parsed:
        url = str(it.get("url") or "").strip()
        if not url:
            continue
        if url in seen:
            duplicates.append({"line_no": int(it.get("line_no") or 0), "url": url, "first_line_no": seen[url]})
            continue
        seen[url] = int(it.get("line_no") or 0)
        unique_items.append(it)

    inserted = 0
    updated = 0
    for it in unique_items:
        url = str(it.get("url") or "").strip()
        if url in existing_urls:
            updated += 1
            it["action"] = "update"
        else:
            inserted += 1
            it["action"] = "insert"

    preview_hash = _preview_hash(csv_text)
    sample = unique_items[:10]
    return JSONResponse(
        content={
            "ok": True,
            "preview_hash": preview_hash,
            "detected_format": fmt,
            "expected": {
                "headerless_fixed_order": [
                    "name",
                    "url",
                    "seed_last_updated",
                    "category",
                    "feed_type",
                    "country",
                    "language",
                    "source",
                ],
                "headered_zh": ["标题", "订阅地址", "最后更新", "分类", "类型", "国家", "语言", "来源"],
            },
            "summary": {
                "total_rows": len(parsed) + len(invalid),
                "unique_urls": len(unique_items),
                "inserted": inserted,
                "updated": updated,
                "duplicates": len(duplicates),
                "invalid": len(invalid),
            },
            "invalid_rows": invalid[:50],
            "duplicate_rows": duplicates[:50],
            "sample": sample,
        }
    )


@router.post("/api/admin/rss-sources/import-csv/commit")
async def api_admin_rss_sources_import_csv_commit(request: Request):
    _require_admin(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    csv_text = (body.get("csv_text") if isinstance(body, dict) else "") or ""
    preview_hash = (body.get("preview_hash") if isinstance(body, dict) else "") or ""
    csv_text = str(csv_text)
    preview_hash = str(preview_hash)
    if not csv_text.strip():
        return JSONResponse(content={"detail": "Missing csv_text"}, status_code=400)
    if not preview_hash.strip():
        return JSONResponse(content={"detail": "Missing preview_hash"}, status_code=400)

    got_hash = _preview_hash(csv_text)
    if got_hash != preview_hash.strip():
        return JSONResponse(content={"detail": "preview_hash mismatch"}, status_code=400)

    fmt, parsed, invalid = _parse_csv_text(csv_text)
    if invalid:
        return JSONResponse(
            content={"detail": "invalid rows", "detected_format": fmt, "invalid_rows": invalid[:50]},
            status_code=400,
        )

    cap = 1000
    if len(parsed) > cap:
        parsed = parsed[:cap]

    seen: Dict[str, int] = {}
    duplicates = 0
    unique_items: List[Dict[str, Any]] = []
    for it in parsed:
        url = str(it.get("url") or "").strip()
        if not url:
            continue
        if url in seen:
            duplicates += 1
            continue
        seen[url] = int(it.get("line_no") or 0)
        unique_items.append(it)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()
    inserted = 0
    updated = 0
    skipped = 0
    for it in unique_items:
        status = _upsert_rss_source(conn=conn, item=it, now=now, write=True)
        if status == "inserted":
            inserted += 1
        elif status == "updated":
            updated += 1
        else:
            skipped += 1
    conn.commit()
    return JSONResponse(
        content={
            "ok": True,
            "detected_format": fmt,
            "summary": {
                "total_rows": len(parsed),
                "unique_urls": len(unique_items),
                "inserted": inserted,
                "updated": updated,
                "skipped": skipped,
                "duplicates": duplicates,
            },
        }
    )


@router.get("/admin/rss-sources", response_class=HTMLResponse)
async def admin_rss_sources_page(request: Request):
    _require_admin(request)
    _call_init_default_sources(request)

    conn = get_online_db_conn(project_root=request.app.state.project_root)

    uconn = None
    try:
        uconn = get_user_db_conn(project_root=request.app.state.project_root)
    except Exception:
        uconn = None

    if uconn is None:
        subs_map = {}
        adds_map = {}
    else:
        try:
            subs_map = subscriber_counts(conn=uconn)
        except Exception:
            subs_map = {}

        try:
            uconn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_rss_subscription_adds (
                    user_id INTEGER NOT NULL,
                    source_id TEXT NOT NULL,
                    first_added_at INTEGER NOT NULL,
                    PRIMARY KEY(user_id, source_id)
                )
                """
            )
            uconn.execute(
                """
                INSERT OR IGNORE INTO user_rss_subscription_adds(user_id, source_id, first_added_at)
                SELECT user_id, source_id, MIN(created_at)
                FROM user_rss_subscriptions
                GROUP BY user_id, source_id
                """
            )
            uconn.commit()
        except Exception:
            pass

        try:
            adds_map = added_counts(conn=uconn)
        except Exception:
            adds_map = {}

    try:
        cur = conn.execute("SELECT source_id, COUNT(*) as c FROM rss_entries GROUP BY source_id")
        rows = cur.fetchall() or []
        entries_map = {str(r[0] or "").strip(): int(r[1] or 0) for r in rows if str(r[0] or "").strip()}
    except Exception:
        entries_map = {}

    try:
        cur = conn.execute(
            """
            SELECT source_id,
                   MAX(CASE WHEN published_at > 0 THEN published_at ELSE created_at END) AS t
            FROM rss_entries
            GROUP BY source_id
            """
        )
        rows = cur.fetchall() or []
        latest_map = {str(r[0] or "").strip(): int(r[1] or 0) for r in rows if str(r[0] or "").strip()}
    except Exception:
        latest_map = {}

    cur = conn.execute(
        "SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at FROM rss_sources ORDER BY updated_at DESC"
    )
    src_rows = cur.fetchall() or []
    sources = []
    for r in src_rows:
        sid = str(r[0] or "").strip()
        latest_ts = int(latest_map.get(sid, 0) or 0)
        latest_str = ""
        if latest_ts > 0:
            try:
                latest_str = datetime.fromtimestamp(latest_ts).strftime("%Y-%m-%d %H:%M")
            except Exception:
                latest_str = str(latest_ts)

        last_updated_ts = _parse_ts_loose(r[9])
        if last_updated_ts <= 0:
            try:
                last_updated_ts = int(r[12] or 0)
            except Exception:
                last_updated_ts = 0
        last_updated_str = ""
        if last_updated_ts > 0:
            try:
                last_updated_str = datetime.fromtimestamp(last_updated_ts).strftime("%Y-%m-%d %H:%M")
            except Exception:
                last_updated_str = str(last_updated_ts)
        sources.append(
            {
                "id": sid,
                "name": str(r[1] or ""),
                "url": str(r[2] or ""),
                "host": str(r[3] or ""),
                "category": str(r[4] or ""),
                "feed_type": str(r[5] or ""),
                "country": str(r[6] or ""),
                "language": str(r[7] or ""),
                "source": str(r[8] or ""),
                "seed_last_updated": _parse_ts_loose(r[9]),
                "last_updated_time": last_updated_str,
                "enabled": int(r[10] or 0),
                "created_at": int(r[11] or 0),
                "updated_at": int(r[12] or 0),
                "subscribed_count": int(subs_map.get(sid, 0) or 0),
                "added_count": int(adds_map.get(sid, 0) or 0),
                "entries_count": int(entries_map.get(sid, 0) or 0),
                "latest_entry_time": latest_str,
            }
        )

    cur = conn.execute(
        "SELECT id, url, host, title, note, status, reason, created_at FROM rss_source_requests WHERE status='pending' ORDER BY id DESC LIMIT 200"
    )
    rows = cur.fetchall() or []
    pending = []
    for r in rows:
        pending.append(
            {
                "id": int(r[0]),
                "url": r[1],
                "host": r[2],
                "title": r[3] or "",
                "note": r[4] or "",
                "status": r[5],
                "reason": r[6] or "",
                "created_at": int(r[7]),
            }
        )

    cur = conn.execute(
        "SELECT id, url, host, title, note, status, reason, created_at, reviewed_at FROM rss_source_requests WHERE status='rejected' ORDER BY id DESC LIMIT 200"
    )
    rows = cur.fetchall() or []
    rejected = []
    for r in rows:
        rejected.append(
            {
                "id": int(r[0]),
                "url": r[1],
                "host": r[2],
                "title": r[3] or "",
                "note": r[4] or "",
                "status": r[5],
                "reason": r[6] or "",
                "created_at": int(r[7]),
                "reviewed_at": int(r[8] or 0),
            }
        )

    token = (request.query_params.get("token") or "").strip()
    return _templates(request).TemplateResponse(
        "admin_rss_sources.html",
        {
            "request": request,
            "sources": sources,
            "pending": pending,
            "rejected": rejected,
            "token": token,
        },
    )


@router.get("/api/admin/rss-sources/export")
async def api_admin_rss_sources_export(request: Request):
    _require_admin(request)
    _call_init_default_sources(request)

    conn = get_online_db_conn(project_root=request.app.state.project_root)

    try:
        uconn = get_user_db_conn(project_root=request.app.state.project_root)
        subs_map = subscriber_counts(conn=uconn)
        adds_map = added_counts(conn=uconn)
    except Exception:
        subs_map = {}
        adds_map = {}

    try:
        cur = conn.execute("SELECT source_id, COUNT(*) as c FROM rss_entries GROUP BY source_id")
        rows = cur.fetchall() or []
        entries_map = {str(r[0] or "").strip(): int(r[1] or 0) for r in rows if str(r[0] or "").strip()}
    except Exception:
        entries_map = {}

    try:
        cur = conn.execute(
            """
            SELECT source_id,
                   MAX(CASE WHEN published_at > 0 THEN published_at ELSE created_at END) AS t
            FROM rss_entries
            GROUP BY source_id
            """
        )
        rows = cur.fetchall() or []
        latest_map = {str(r[0] or "").strip(): int(r[1] or 0) for r in rows if str(r[0] or "").strip()}
    except Exception:
        latest_map = {}

    cur = conn.execute(
        "SELECT id, name, url, host, category, enabled, created_at, updated_at FROM rss_sources ORDER BY updated_at DESC"
    )
    src_rows = cur.fetchall() or []

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(
        [
            "id",
            "name",
            "url",
            "host",
            "category",
            "enabled",
            "subscribed_count",
            "added_count",
            "entries_count",
            "latest_entry_time",
            "created_at",
            "updated_at",
        ]
    )
    for r in src_rows:
        sid = str(r[0] or "").strip()
        latest_ts = int(latest_map.get(sid, 0) or 0)
        latest_str = ""
        if latest_ts > 0:
            try:
                latest_str = datetime.fromtimestamp(latest_ts).strftime("%Y-%m-%d %H:%M")
            except Exception:
                latest_str = str(latest_ts)
        w.writerow(
            [
                sid,
                str(r[1] or ""),
                str(r[2] or ""),
                str(r[3] or ""),
                str(r[4] or ""),
                int(r[5] or 0),
                int(subs_map.get(sid, 0) or 0),
                int(adds_map.get(sid, 0) or 0),
                int(entries_map.get(sid, 0) or 0),
                latest_str,
                int(r[6] or 0),
                int(r[7] or 0),
            ]
        )

    from fastapi.responses import Response

    body = out.getvalue().encode("utf-8")
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=admin_rss_catalog_all.csv"},
    )
