import hashlib
import os
import asyncio
import csv
import io
import json
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Body, HTTPException, Query, Request, Depends
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from trendradar.web.db_online import get_online_db_conn
from trendradar.web.rss_proxy import rss_proxy_fetch_cached
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


def _ts_to_str(ts: int) -> str:
    t = 0
    try:
        t = int(ts or 0)
    except Exception:
        t = 0
    if t <= 0:
        return ""
    try:
        return datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(t)


def _parse_http_date_to_ts(s: str) -> int:
    v = (s or "").strip()
    if not v:
        return 0
    try:
        dt = parsedate_to_datetime(v)
        return int(dt.timestamp())
    except Exception:
        return 0


def _extract_entry_ts(v: Any) -> int:
    ts = _parse_ts_loose(v)
    if ts > 0:
        return ts
    try:
        return _parse_http_date_to_ts(str(v or ""))
    except Exception:
        return 0


def _best_entries_ts(entries: Any) -> int:
    if not isinstance(entries, list):
        return 0
    best = 0
    for it in entries:
        if not isinstance(it, dict):
            continue
        ts = _extract_entry_ts(it.get("published"))
        if ts > best:
            best = ts
    return int(best)


def _db_get_source_by_url(conn, url: str) -> Optional[Dict[str, Any]]:
    try:
        cur = conn.execute(
            "SELECT name, host, category, feed_type, country, language, source, seed_last_updated, added_at FROM rss_sources WHERE url = ? LIMIT 1",
            (str(url or "").strip(),),
        )
        row = cur.fetchone()
    except Exception:
        row = None
    if not row:
        return None
    try:
        return {
            "name": str(row[0] or ""),
            "host": str(row[1] or ""),
            "category": str(row[2] or ""),
            "feed_type": str(row[3] or ""),
            "country": str(row[4] or ""),
            "language": str(row[5] or ""),
            "source": str(row[6] or ""),
            "seed_last_updated": str(row[7] or ""),
            "added_at": int(row[8] or 0),
        }
    except Exception:
        return None


def _merge_if_empty(dst: Dict[str, Any], src: Dict[str, Any], key: str) -> None:
    if key not in dst or dst.get(key) is None:
        dst[key] = src.get(key)
        return
    v = dst.get(key)
    if isinstance(v, str) and not v.strip():
        dst[key] = src.get(key)
        return
    if isinstance(v, (int, float)) and int(v) == 0:
        dst[key] = src.get(key)
        return


def _autofill_item_from_feed(url: str) -> Dict[str, Any]:
    result = rss_proxy_fetch_cached(url)
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(data, dict):
        return {}
    feed = data.get("feed") if isinstance(data.get("feed"), dict) else {}
    title = str(feed.get("title") or "").strip()
    lang = str(feed.get("language") or "").strip()
    fmt = str(data.get("format") or "").strip()
    entries = data.get("entries")

    best_ts = _best_entries_ts(entries)
    lm_ts = _parse_http_date_to_ts(str(result.get("last_modified") or ""))
    seed_ts = best_ts or lm_ts
    seed_str = _ts_to_str(seed_ts)

    return {
        "name": title,
        "feed_type": fmt,
        "seed_last_updated": seed_str,
        "host": _extract_host(url),
        "language": lang,
        "entry_titles": [
            str((it.get("title") if isinstance(it, dict) else "") or "").strip()[:200]
            for it in (entries if isinstance(entries, list) else [])
            if str((it.get("title") if isinstance(it, dict) else "") or "").strip()
        ][:10],
    }


def _detect_csv_format(csv_text: str) -> str:
    first = ""
    for line in (csv_text or "").splitlines():
        if line.strip():
            first = line.strip()
            break
    if not first:
        return "unknown"
    if "," not in first and (first.startswith("http://") or first.startswith("https://")):
        return "url_only"
    if "订阅地址" in first or "标题" in first:
        return "headered_zh"
    return "headerless_fixed"


def _parse_csv_text(csv_text: str) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    fmt = _detect_csv_format(csv_text)
    items: List[Dict[str, Any]] = []
    invalid: List[Dict[str, Any]] = []

    if fmt == "url_only":
        for i, line in enumerate((csv_text or "").splitlines(), start=1):
            raw = str(line or "").strip()
            if not raw:
                continue
            try:
                url = _validate_and_normalize_url(raw)
                items.append(
                    {
                        "line_no": i,
                        "name": "",
                        "url": url,
                        "seed_last_updated": "",
                        "category": "",
                        "feed_type": "",
                        "country": "",
                        "language": "",
                        "source": "",
                        "added_at": "",
                    }
                )
            except Exception as e:
                invalid.append({"line_no": i, "error": str(e)})
        return fmt, items, invalid

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
                added_at = (row.get("添加时间") or "").strip()

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
                        "added_at": added_at,
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
                if len(cols) not in (8, 9):
                    raise ValueError("Wrong column count")
                name = cols[0]
                url_raw = cols[1]
                seed_last_updated = cols[2]
                category = cols[3]
                feed_type = cols[4]
                country = cols[5]
                language = cols[6]
                source = cols[7]
                added_at = cols[8] if len(cols) >= 9 else ""
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
                        "added_at": added_at,
                    }
                )
            except Exception as e:
                invalid.append({"line_no": i, "error": str(e)})
        return fmt, items, invalid

    invalid.append({"line_no": 1, "error": "Unknown CSV format"})
    return fmt, items, invalid


def _preview_hash(csv_text: str) -> str:
    text = (csv_text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return _md5_hex(text)


def _upsert_rss_source(*, conn, item: Dict[str, Any], now: int, write: bool) -> str:
    url = str(item.get("url") or "").strip()
    cur = conn.execute("SELECT id FROM rss_sources WHERE url = ? LIMIT 1", (url,))
    row = cur.fetchone()

    raw_added_at = item.get("added_at")
    parsed_added_at = _parse_ts_loose(raw_added_at)
    if parsed_added_at <= 0:
        parsed_added_at = int(now)

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
                    added_at = CASE WHEN (added_at IS NULL OR added_at = 0) THEN ? ELSE added_at END,
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
                    int(parsed_added_at),
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
                enabled, created_at, updated_at, added_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
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
                int(parsed_added_at),
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
    try:
        conn.commit()
    except Exception:
        pass
    return JSONResponse(content={"ok": True, "source_id": source_id, "enabled": int(enabled)})


@router.post("/api/admin/rss-sources/set-enabled-bulk")
async def api_admin_rss_sources_set_enabled_bulk(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    source_ids = body.get("source_ids")
    if not isinstance(source_ids, list):
        source_ids = []

    enabled_raw = body.get("enabled")
    enabled = 1 if str(enabled_raw).strip().lower() in {"1", "true", "yes", "on"} else 0

    ids: List[str] = []
    for s in source_ids:
        sid = str(s or "").strip()
        if sid:
            ids.append(sid)
    ids = ids[:500]
    if not ids:
        return JSONResponse(content={"ok": True, "updated": 0})

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()

    placeholders = ",".join(["?"] * len(ids))
    try:
        conn.execute(
            f"UPDATE rss_sources SET enabled = ?, updated_at = ? WHERE id IN ({placeholders})",
            tuple([int(enabled), int(now)] + ids),
        )
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return JSONResponse(content={"detail": str(e)[:500]}, status_code=500)

    return JSONResponse(content={"ok": True, "enabled": int(enabled), "updated": len(ids)})


@router.post("/api/admin/rss-sources/clear-backoff")
async def api_admin_rss_sources_clear_backoff(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    source_id = str(body.get("source_id") or "").strip()
    warmup = bool(body.get("warmup") in {1, True, "1", "true", "yes"})
    if not source_id:
        return JSONResponse(content={"detail": "Missing source_id"}, status_code=400)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()
    try:
        conn.execute(
            "UPDATE rss_sources SET fail_count = 0, backoff_until = 0, last_error_reason = '', updated_at = ? WHERE id = ?",
            (int(now), source_id),
        )
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return JSONResponse(content={"detail": str(e)[:500]}, status_code=500)

    queued = False
    try:
        if warmup:
            enqueue = getattr(request.app.state, "rss_enqueue_warmup", None)
            if callable(enqueue):
                fut = await enqueue(source_id, priority=0)
                queued = fut is not None
    except Exception:
        queued = False

    return JSONResponse(content={"ok": True, "source_id": source_id, "queued": bool(queued)})


@router.post("/api/admin/rss-sources/clear-backoff-bulk")
async def api_admin_rss_sources_clear_backoff_bulk(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    source_ids = body.get("source_ids")
    if not isinstance(source_ids, list):
        source_ids = []

    ids: List[str] = []
    for s in source_ids:
        sid = str(s or "").strip()
        if sid:
            ids.append(sid)
    ids = ids[:500]
    if not ids:
        return JSONResponse(content={"ok": True, "cleared": 0})

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    now = _now_ts()
    placeholders = ",".join(["?"] * len(ids))

    try:
        conn.execute(
            f"UPDATE rss_sources SET fail_count = 0, backoff_until = 0, last_error_reason = '', updated_at = ? WHERE id IN ({placeholders})",
            tuple([int(now)] + ids),
        )
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return JSONResponse(content={"detail": str(e)[:500]}, status_code=500)

    return JSONResponse(content={"ok": True, "cleared": len(ids)})


@router.post("/api/admin/rss-sources/delete")
async def api_admin_rss_sources_delete(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    source_id = str(body.get("source_id") or "").strip()
    if not source_id:
        return JSONResponse(content={"detail": "Missing source_id"}, status_code=400)

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    cur = conn.execute("SELECT id FROM rss_sources WHERE id = ?", (source_id,))
    row = cur.fetchone()
    if not row:
        return JSONResponse(content={"detail": "Source not found"}, status_code=404)

    try:
        conn.execute("DELETE FROM rss_entries WHERE source_id = ?", (source_id,))
    except Exception:
        pass
    try:
        conn.execute("DELETE FROM rss_entry_ai_labels WHERE source_id = ?", (source_id,))
    except Exception:
        pass
    try:
        conn.execute("DELETE FROM rss_sources WHERE id = ?", (source_id,))
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return JSONResponse(content={"detail": str(e)[:500]}, status_code=500)

    removed_subs = False
    try:
        uconn = get_user_db_conn(project_root=request.app.state.project_root)
        pref = "rss-" + source_id
        uconn.execute(
            "DELETE FROM user_rss_subscriptions WHERE source_id = ? OR source_id = ?",
            (source_id, pref),
        )
        uconn.execute(
            "DELETE FROM user_rss_subscription_adds WHERE source_id = ? OR source_id = ?",
            (source_id, pref),
        )
        uconn.commit()
        removed_subs = True
    except Exception:
        removed_subs = False

    return JSONResponse(content={"ok": True, "source_id": source_id, "subscriptions_removed": bool(removed_subs)})


@router.post("/api/admin/rss-sources/delete-bulk")
async def api_admin_rss_sources_delete_bulk(request: Request, body: Dict[str, Any] = Body(None)):
    _require_admin(request)
    if not isinstance(body, dict):
        body = {}

    source_ids = body.get("source_ids")
    if not isinstance(source_ids, list):
        source_ids = []

    ids: List[str] = []
    for s in source_ids:
        sid = str(s or "").strip()
        if sid:
            ids.append(sid)
    ids = ids[:200]
    if not ids:
        return JSONResponse(content={"ok": True, "deleted": 0})

    conn = get_online_db_conn(project_root=request.app.state.project_root)
    placeholders = ",".join(["?"] * len(ids))

    try:
        conn.execute(f"DELETE FROM rss_entries WHERE source_id IN ({placeholders})", tuple(ids))
    except Exception:
        pass
    try:
        conn.execute(f"DELETE FROM rss_entry_ai_labels WHERE source_id IN ({placeholders})", tuple(ids))
    except Exception:
        pass

    try:
        conn.execute(f"DELETE FROM rss_sources WHERE id IN ({placeholders})", tuple(ids))
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return JSONResponse(content={"detail": str(e)[:500]}, status_code=500)

    subs_removed = False
    try:
        uconn = get_user_db_conn(project_root=request.app.state.project_root)
        pref_ids = ["rss-" + sid for sid in ids]
        all_ids = list(ids) + pref_ids
        p2 = ",".join(["?"] * len(all_ids))
        uconn.execute(f"DELETE FROM user_rss_subscriptions WHERE source_id IN ({p2})", tuple(all_ids))
        uconn.execute(f"DELETE FROM user_rss_subscription_adds WHERE source_id IN ({p2})", tuple(all_ids))
        uconn.commit()
        subs_removed = True
    except Exception:
        subs_removed = False

    return JSONResponse(content={"ok": True, "deleted": len(ids), "subscriptions_removed": bool(subs_removed)})


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
        "INSERT OR REPLACE INTO rss_sources(id, name, url, host, category, enabled, created_at, updated_at, added_at) VALUES (?, ?, ?, ?, COALESCE((SELECT category FROM rss_sources WHERE id = ?), ''), 1, ?, ?, COALESCE((SELECT added_at FROM rss_sources WHERE id = ?), ?))",
        (source_id, name, url, host, source_id, now, now, source_id, now),
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

    autofilled = 0
    fetched = 0
    from_db = 0
    fetch_errors: List[Dict[str, Any]] = []

    if fmt == "url_only" and unique_items:
        sem = asyncio.Semaphore(6)

        async def _fill_one(it: Dict[str, Any]) -> None:
            nonlocal autofilled, fetched, from_db
            url = str(it.get("url") or "").strip()
            if not url:
                return
            db_row = _db_get_source_by_url(conn, url)
            if isinstance(db_row, dict):
                for k in ("name", "host", "category", "feed_type", "country", "language", "source", "seed_last_updated"):
                    _merge_if_empty(it, db_row, k)
                if int(db_row.get("added_at") or 0) > 0:
                    _merge_if_empty(it, {"added_at": _ts_to_str(int(db_row.get("added_at") or 0))}, "added_at")
                from_db += 1

            if not str(it.get("name") or "").strip() or not str(it.get("seed_last_updated") or "").strip():
                async with sem:
                    try:
                        meta = await asyncio.to_thread(_autofill_item_from_feed, url)
                        if isinstance(meta, dict):
                            for k in ("name", "feed_type", "seed_last_updated", "host"):
                                _merge_if_empty(it, meta, k)
                            if isinstance(meta.get("language"), str):
                                _merge_if_empty(it, meta, "language")
                            if isinstance(meta.get("entry_titles"), list) and not isinstance(it.get("entry_titles"), list):
                                it["entry_titles"] = meta.get("entry_titles")
                            if isinstance(meta.get("entry_titles"), list) and isinstance(it.get("entry_titles"), list) and not it.get("entry_titles"):
                                it["entry_titles"] = meta.get("entry_titles")
                        fetched += 1
                    except Exception as e:
                        fetch_errors.append({"url": url, "error": str(e)[:200]})

            if not str(it.get("host") or "").strip():
                it["host"] = _extract_host(url)
            if str(it.get("name") or "").strip() or str(it.get("seed_last_updated") or "").strip() or str(it.get("feed_type") or "").strip():
                autofilled += 1

        await asyncio.gather(*[_fill_one(it) for it in unique_items])

    preview_hash = _preview_hash(csv_text)
    sample = unique_items[:10]

    autofill_csv_text = ""
    autofill_preview_hash = ""
    if fmt == "url_only" and unique_items:
        out = io.StringIO()
        w = csv.writer(out)
        for it in unique_items:
            w.writerow(
                [
                    str(it.get("name") or "").strip(),
                    str(it.get("url") or "").strip(),
                    str(it.get("seed_last_updated") or "").strip(),
                    str(it.get("category") or "").strip(),
                    str(it.get("feed_type") or "").strip(),
                    str(it.get("country") or "").strip(),
                    str(it.get("language") or "").strip(),
                    str(it.get("source") or "").strip(),
                    str(it.get("added_at") or "").strip(),
                ]
            )
        autofill_csv_text = out.getvalue()
        autofill_preview_hash = _preview_hash(autofill_csv_text)

    return JSONResponse(
        content={
            "ok": True,
            "preview_hash": preview_hash,
            "detected_format": fmt,
            "expected": {
                "url_only": ["<url_per_line>", "Preview will autofill fields and convert to headerless CSV"],
                "headerless_fixed_order": [
                    "name",
                    "url",
                    "seed_last_updated",
                    "category",
                    "feed_type",
                    "country",
                    "language",
                    "source",
                    "added_at",
                ],
                "headered_zh": ["标题", "订阅地址", "最后更新", "分类", "类型", "国家", "语言", "来源", "添加时间"],
            },
            "summary": {
                "total_rows": len(parsed) + len(invalid),
                "unique_urls": len(unique_items),
                "inserted": inserted,
                "updated": updated,
                "duplicates": len(duplicates),
                "invalid": len(invalid),
                "autofilled": int(autofilled),
                "from_db": int(from_db),
                "fetched": int(fetched),
            },
            "invalid_rows": invalid[:50],
            "duplicate_rows": duplicates[:50],
            "sample": sample,
            "fetch_errors": fetch_errors[:30],
            "autofill_csv_text": autofill_csv_text,
            "autofill_preview_hash": autofill_preview_hash,
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

    now = _now_ts()

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
        "SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at, added_at, fail_count, backoff_until, last_error_reason, last_attempt_at FROM rss_sources ORDER BY updated_at DESC"
    )
    src_rows = cur.fetchall() or []
    sources = []
    health_kpi = {
        "OK": 0,
        "FAIL": 0,
        "BACKOFF": 0,
        "NEVER_TRIED": 0,
        "OK_EMPTY": 0,
        "STALE": 0,
        "DISABLED": 0,
    }
    abnormal_states = {"FAIL", "BACKOFF", "NEVER_TRIED", "OK_EMPTY", "STALE"}
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

        added_at = 0
        try:
            added_at = int(r[13] or 0)
        except Exception:
            added_at = 0

        added_str = ""
        if added_at > 0:
            try:
                added_str = datetime.fromtimestamp(added_at).strftime("%Y-%m-%d %H:%M")
            except Exception:
                added_str = str(added_at)

        fail_count = 0
        try:
            fail_count = int(r[14] or 0)
        except Exception:
            fail_count = 0

        backoff_until = 0
        try:
            backoff_until = int(r[15] or 0)
        except Exception:
            backoff_until = 0

        last_error_reason = str(r[16] or "")

        last_attempt_at = 0
        try:
            last_attempt_at = int(r[17] or 0)
        except Exception:
            last_attempt_at = 0

        last_attempt_str = ""
        if last_attempt_at > 0:
            try:
                last_attempt_str = datetime.fromtimestamp(last_attempt_at).strftime("%Y-%m-%d %H:%M")
            except Exception:
                last_attempt_str = str(last_attempt_at)

        backoff_str = ""
        if backoff_until > 0:
            try:
                backoff_str = datetime.fromtimestamp(backoff_until).strftime("%Y-%m-%d %H:%M")
            except Exception:
                backoff_str = str(backoff_until)

        enabled = int(r[10] or 0)
        entries_count = int(entries_map.get(sid, 0) or 0)
        is_stale = bool(latest_ts > 0 and (now - latest_ts) > (30 * 24 * 3600))

        if enabled != 1:
            health_state = "DISABLED"
        elif backoff_until > now:
            health_state = "BACKOFF"
        elif fail_count > 0:
            health_state = "FAIL"
        elif last_attempt_at <= 0:
            health_state = "NEVER_TRIED"
        elif entries_count <= 0:
            health_state = "OK_EMPTY"
        elif is_stale:
            health_state = "STALE"
        else:
            health_state = "OK"

        try:
            health_kpi[health_state] = int(health_kpi.get(health_state, 0) or 0) + 1
        except Exception:
            pass

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
                "enabled": enabled,
                "created_at": int(r[11] or 0),
                "updated_at": int(r[12] or 0),
                "added_at": int(added_at),
                "added_time": added_str,
                "subscribed_count": int(subs_map.get(sid, 0) or 0),
                "added_count": int(adds_map.get(sid, 0) or 0),
                "entries_count": entries_count,
                "latest_entry_time": latest_str,
                "latest_entry_ts": int(latest_ts),
                "health_state": health_state,
                "is_abnormal": True if health_state in abnormal_states else False,
                "fail_count": int(fail_count),
                "backoff_until": int(backoff_until),
                "backoff_until_time": backoff_str,
                "last_error_reason": last_error_reason,
                "last_attempt_at": int(last_attempt_at),
                "last_attempt_time": last_attempt_str,
            }
        )

    abnormal_count = 0
    try:
        abnormal_count = int(sum(int(health_kpi.get(k, 0) or 0) for k in abnormal_states))
    except Exception:
        abnormal_count = 0

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
            "health_kpi": health_kpi,
            "health_abnormal_count": int(abnormal_count),
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
        "SELECT id, name, url, host, category, enabled, created_at, updated_at, added_at FROM rss_sources ORDER BY updated_at DESC"
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
            "rss_added_at",
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
                int(r[8] or 0),
            ]
        )

    from fastapi.responses import Response

    body = out.getvalue().encode("utf-8")
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=admin_rss_catalog_all.csv"},
    )


@router.get("/api/admin/rss-sources/{source_id}/entries")
async def api_admin_get_source_entries(request: Request, source_id: str):
    _require_admin(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    try:
        cur = conn.execute(
            "SELECT title, url, published_at, created_at FROM rss_entries WHERE source_id = ? ORDER BY published_at DESC LIMIT 10",
            (source_id,)
        )
        rows = cur.fetchall()
        entries = []
        for r in rows:
            title = r[0] or "No Title"
            url = r[1] or ""
            pub = r[2] or r[3] or 0
            entries.append({"title": title, "url": url, "time": _ts_to_str(pub)})
        return JSONResponse({"entries": entries})
    except Exception as e:
        return JSONResponse({"detail": str(e)}, status_code=500)


class UpdateSourceReq(BaseModel):
    source_id: str
    name: str | None = None
    url: str | None = None
    category: str | None = None
    feed_type: str | None = None
    country: str | None = None
    language: str | None = None
    source: str | None = None
    enabled: int | None = None
    scrape_rules: str | None = None


@router.post("/api/admin/rss-sources/update")
async def api_admin_update_source(request: Request, req: UpdateSourceReq):
    _require_admin(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    
    # 1. Check if exists
    cur = conn.execute("SELECT id, url FROM rss_sources WHERE id = ?", (req.source_id,))
    row = cur.fetchone()
    if not row:
        return JSONResponse({"detail": "Source not found"}, status_code=404)
    
    # 2. Build Update SQL
    fields = []
    values = []
    
    if req.name is not None:
        fields.append("name = ?")
        values.append(req.name.strip())
    
    if req.url is not None:
        new_url = req.url.strip()
        if new_url and new_url != row[1]:
            # Check for duplicate URL
            cur = conn.execute("SELECT id FROM rss_sources WHERE url = ? AND id != ?", (new_url, req.source_id))
            if cur.fetchone():
                 return JSONResponse({"detail": f"URL already exists: {new_url}"}, status_code=400)
            fields.append("url = ?")
            values.append(new_url)
            # Update host if url changes
            try:
                from urllib.parse import urlparse
                host = urlparse(new_url).netloc
                fields.append("host = ?")
                values.append(host)
            except:
                pass

    if req.category is not None:
        fields.append("category = ?")
        values.append(req.category.strip())

    if req.feed_type is not None:
        fields.append("feed_type = ?")
        values.append(req.feed_type.strip())
        
    if req.country is not None:
        fields.append("country = ?")
        values.append(req.country.strip())

    if req.language is not None:
        fields.append("language = ?")
        values.append(req.language.strip())
        
    if req.source is not None:
        fields.append("source = ?")
        values.append(req.source.strip())
        
    if req.scrape_rules is not None:
        fields.append("scrape_rules = ?")
        values.append(req.scrape_rules.strip())
        
    if req.enabled is not None:
        fields.append("enabled = ?")
        values.append(1 if req.enabled else 0)

    if not fields:
        return JSONResponse({"ok": True, "msg": "No changes"})

    fields.append("updated_at = ?")
    values.append(_now_ts())
    
    values.append(req.source_id)
    
    sql = f"UPDATE rss_sources SET {', '.join(fields)} WHERE id = ?"
    try:
        conn.execute(sql, tuple(values))
        conn.commit()
        return JSONResponse({"ok": True, "source_id": req.source_id})
    except Exception as e:
        return JSONResponse({"detail": str(e)}, status_code=500)

@router.get("/api/admin/tool/fetch-html")
async def api_admin_tool_fetch_html(request: Request, url: str):
    _require_admin(request)
    if not url:
         return JSONResponse({"detail": "Missing url"}, status_code=400)
    
    try:
        import requests
        headers = {
            "User-Agent": "TrendRadar/1.0 (VisualSelector)",
        }
        import traceback
        resp = requests.get(url, headers=headers, timeout=15, verify=False)
        resp.raise_for_status()
        
        # Post-process HTML
        html = resp.text
        
        # 1. Inject <base> for relative links
        # Simple heuristic: insert after <head>
        base_tag = f'<base href="{url}">'
        if "<head>" in html:
            html = html.replace("<head>", f"<head>{base_tag}", 1)
        elif "<HEAD>" in html:
             html = html.replace("<HEAD>", f"<HEAD>{base_tag}", 1)
        else:
             # Fallback
             html = f"{base_tag}{html}"

        # 2. Disable Scripts (Basic Regex)
        import re
        html = re.sub(r'<script.*?>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        # Also remove external scripts
        html = re.sub(r'<script.*?>', '', html, flags=re.IGNORECASE)
        
        # 3. Inject Click Listener Script? 
        # Actually better to do this in the iframe on load from the parent, 
        # OR inject a small script here that communicates with parent.
        # Let's inject a script that handles text selection blocking and highlighting.
        
        injector_script = """
        <style>
            .trendradar-highlight {
                outline: 2px solid #ef4444 !important;
                background-color: rgba(239, 68, 68, 0.1) !important;
                cursor: crosshair !important;
            }
        </style>
        <script>
            function getCssSelector(el) {
                if (!(el instanceof Element)) return;
                var path = [];
                while (el.nodeType === Node.ELEMENT_NODE) {
                    var selector = el.nodeName.toLowerCase();
                    if (el.id) {
                        selector += '#' + el.id;
                        path.unshift(selector);
                        break;
                    } else {
                        var sib = el, nth = 1;
                        while (sib = sib.previousElementSibling) {
                            if (sib.nodeName.toLowerCase() == selector)
                                nth++;
                        }
                        if (nth != 1)
                            selector += ":nth-of-type("+nth+")";
                        // Prefer class if available and meaningful
                        if (el.classList.length > 0 && !el.classList.contains('trendradar-highlight')) {
                            // cleanup highlighting classes
                            let cls = Array.from(el.classList).filter(c => c !== 'trendradar-highlight').join('.');
                            if (cls) selector = el.nodeName.toLowerCase() + "." + cls;
                        }
                    }
                    path.unshift(selector);
                    el = el.parentNode;
                    if (el.nodeName.toLowerCase() === 'html') break;
                }
                return path.join(" > ");
            }

            document.addEventListener('mouseover', function(e) {
                e.stopPropagation();
                // Remove existing
                document.querySelectorAll('.trendradar-highlight').forEach(el => el.classList.remove('trendradar-highlight'));
                // Add new
                e.target.classList.add('trendradar-highlight');
            }, true);
            
            document.addEventListener('mouseout', function(e) {
                e.stopPropagation();
                e.target.classList.remove('trendradar-highlight');
            }, true);
            
            document.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const target = e.target;
                const selector = getCssSelector(target);
                // Send info to parent
                window.parent.postMessage({
                    type: 'TRENDRADAR_ELEMENT_SELECTED',
                    tagName: target.tagName,
                    id: target.id,
                    selector: selector,
                    innerText: target.innerText.substring(0, 50)
                }, '*');
            }, true);
        </script>
        """
        
        if "</body>" in html:
            html = html.replace("</body>", f"{injector_script}</body>", 1)
        else:
            html += injector_script
            
        return Response(content=html, media_type="text/html")

    except Exception as e:
        print(f"Error fetching {url}: {e}")
        traceback.print_exc()
        error_html = f"""
        <html>
        <body style="font-family: system-ui, -apple-system, sans-serif; padding: 2rem; text-align: center; color: #374151;">
            <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 2rem; max-width: 600px; margin: 0 auto;">
                <h3 style="color: #dc2626; margin-top: 0;">Failed to Load Page</h3>
                <p style="margin-bottom: 1rem;"><strong>URL:</strong> {url}</p>
                <div style="background: white; padding: 1rem; border-radius: 4px; border: 1px solid #e5e7eb; font-family: monospace; text-align: left; overflow-x: auto; font-size: 13px;">
                    {str(e)}
                </div>
                <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #6b7280;">
                    Tip: Ensure the URL leads to a valid HTML page, not an XML feed or API endpoint.
                </p>
            </div>
        </body>
        </html>
        """
        return Response(content=error_html, media_type="text/html", status_code=500)
