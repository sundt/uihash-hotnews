import asyncio
import os
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import Lock
from typing import Any, Dict, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from trendradar.web.db_online import get_online_db_conn
from trendradar.web.rss_proxy import rss_proxy_fetch_warmup


_project_root = None

_rss_warmup_queue: Optional[asyncio.PriorityQueue] = None
_rss_warmup_worker_task: Optional[asyncio.Task] = None
_rss_warmup_producer_task: Optional[asyncio.Task] = None
_rss_warmup_running: bool = False
_rss_warmup_global_sem: Optional[asyncio.Semaphore] = None
_rss_warmup_inflight_lock = Lock()
_rss_warmup_inflight: set = set()
_rss_warmup_budget_lock = Lock()
_rss_warmup_budget_window_start: float = 0.0
_rss_warmup_budget_count: int = 0


def _now_ts() -> int:
    return int(time.time())


def _get_online_db_conn():
    return get_online_db_conn(_project_root)


def _rss_entry_canonical_url(raw_url: str) -> str:
    u = (raw_url or "").strip()
    if not u:
        return ""
    try:
        parsed = urlparse(u)
    except Exception:
        return u

    scheme = (parsed.scheme or "").lower()
    netloc = (parsed.netloc or "").lower()
    path = parsed.path or ""

    try:
        q = []
        for k, v in parse_qsl(parsed.query or "", keep_blank_values=True):
            lk = (k or "").lower()
            if lk.startswith("utm_"):
                continue
            if lk in {"spm", "from", "src", "source", "ref", "referer", "share", "share_token"}:
                continue
            q.append((k, v))
        query = urlencode(q, doseq=True)
    except Exception:
        query = parsed.query or ""

    return urlunparse((scheme, netloc, path, "", query, ""))


def _rss_entry_dedup_key(entry: Any) -> str:
    if not isinstance(entry, dict):
        return ""
    guid = (entry.get("guid") or entry.get("id") or "").strip()
    if guid:
        return f"g:{guid}"
    link = (entry.get("link") or entry.get("url") or "").strip()
    canon = _rss_entry_canonical_url(link)
    if canon:
        return f"u:{canon}"
    if link:
        return f"l:{link}"
    title = (entry.get("title") or "").strip()
    if title:
        return f"t:{title}"
    return ""


def _rss_parse_published_ts(published_raw: str) -> int:
    s = (published_raw or "").strip()
    if not s:
        return 0
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        pass
    try:
        s2 = s.replace("Z", "+00:00")
        dt2 = datetime.fromisoformat(s2)
        if dt2.tzinfo is None:
            dt2 = dt2.replace(tzinfo=timezone.utc)
        return int(dt2.timestamp())
    except Exception:
        return 0


def _rss_entries_retention_cleanup(conn, source_id: str, now_ts: int) -> None:
    sid = (source_id or "").strip()
    if not sid:
        return
    cutoff = int(now_ts) - 90 * 24 * 60 * 60
    try:
        conn.execute(
            "DELETE FROM rss_entries WHERE (published_at > 0 AND published_at < ?) OR created_at < ?",
            (cutoff, cutoff),
        )
    except Exception:
        pass
    try:
        conn.execute(
            """
            DELETE FROM rss_entries
            WHERE source_id = ?
              AND id NOT IN (
                SELECT id FROM rss_entries
                WHERE source_id = ?
                ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                LIMIT 500
              )
            """,
            (sid, sid),
        )
    except Exception:
        pass


def rss_cadence_interval_s(cadence: str) -> int:
    c = (cadence or "").strip().upper()
    mapping = {
        "P0": 15 * 60,
        "P1": 30 * 60,
        "P2": 60 * 60,
        "P3": 2 * 60 * 60,
        "P4": 4 * 60 * 60,
        "P5": 8 * 60 * 60,
        "P6": 24 * 60 * 60,
    }
    return int(mapping.get(c, 4 * 60 * 60))


def rss_next_due_at(now_ts: int, cadence: str) -> int:
    base = rss_cadence_interval_s(cadence)
    jitter = random.uniform(0.85, 1.15)
    return int(now_ts + max(60, int(base * jitter)))


def rss_backoff_s(fail_count: int, error_reason: str) -> int:
    msg = (error_reason or "").lower()
    if "429" in msg or "rate limited" in msg:
        return 6 * 60 * 60
    if "403" in msg or "access denied" in msg or "captcha" in msg or "login" in msg:
        return 12 * 60 * 60
    step = max(0, int(fail_count) - 1)
    return int(min(24 * 60 * 60, 15 * 60 * (2**step)))


def rss_budget_allow(priority: int) -> bool:
    if priority <= 0:
        return True
    max_per_hour = 60
    try:
        max_per_hour = int(os.environ.get("TREND_RADAR_RSS_WARMUP_MAX_PER_HOUR", "60"))
    except Exception:
        max_per_hour = 60
    now = time.time()
    with _rss_warmup_budget_lock:
        global _rss_warmup_budget_window_start, _rss_warmup_budget_count
        if _rss_warmup_budget_window_start <= 0 or now - _rss_warmup_budget_window_start >= 3600:
            _rss_warmup_budget_window_start = now
            _rss_warmup_budget_count = 0
        if _rss_warmup_budget_count >= max_per_hour:
            return False
        _rss_warmup_budget_count += 1
        return True


async def rss_enqueue_warmup(source_id: str, priority: int = 10) -> Optional[asyncio.Future]:
    sid = (source_id or "").strip()
    if not sid:
        return None
    if _rss_warmup_queue is None:
        return None
    if not rss_budget_allow(priority):
        return None

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    with _rss_warmup_inflight_lock:
        if sid in _rss_warmup_inflight:
            fut.set_result({"queued": False, "source_id": sid, "reason": "already_inflight"})
            return fut
        _rss_warmup_inflight.add(sid)
    await _rss_warmup_queue.put((int(priority), float(time.time()), sid, fut))
    return fut


async def _rss_process_warmup_one(source_id: str) -> Dict[str, Any]:
    sid = (source_id or "").strip()
    now = _now_ts()
    conn = _get_online_db_conn()
    cur = conn.execute(
        "SELECT id, url, enabled, cadence, etag, last_modified, fail_count, backoff_until FROM rss_sources WHERE id = ?",
        (sid,),
    )
    row = cur.fetchone()
    if not row:
        return {"ok": False, "source_id": sid, "error": "Source not found"}
    enabled = int(row[2] or 0)
    if enabled != 1:
        return {"ok": False, "source_id": sid, "error": "Source disabled"}
    cadence = str(row[3] or "P4")
    if cadence.strip().upper() == "P7":
        return {"ok": False, "source_id": sid, "error": "Cadence disabled"}
    backoff_until = int(row[7] or 0)
    if backoff_until > 0 and backoff_until > now:
        return {"ok": False, "source_id": sid, "error": "Backoff", "backoff_until": backoff_until}
    url = (row[1] or "").strip()
    if not url:
        return {"ok": False, "source_id": sid, "error": "Missing url"}

    try:
        conn.execute(
            "UPDATE rss_sources SET last_attempt_at = ? WHERE id = ?",
            (now, sid),
        )
        conn.commit()
    except Exception:
        pass

    etag = str(row[4] or "")
    last_modified = str(row[5] or "")
    try:
        fetched = await asyncio.to_thread(rss_proxy_fetch_warmup, url, etag, last_modified)

        try:
            data = fetched.get("data") if isinstance(fetched, dict) else None
            entries = data.get("entries") if isinstance(data, dict) else None
            if isinstance(entries, list):
                created_at = now
                fetched_at = now
                rows_to_insert = []
                for ent in entries[:200]:
                    if not isinstance(ent, dict):
                        continue
                    title = (ent.get("title") or "").strip()
                    link = (ent.get("link") or "").strip()
                    published_raw = (ent.get("published") or "").strip()
                    if not title:
                        title = link
                    if not link:
                        continue
                    dk = _rss_entry_dedup_key(ent)
                    if not dk:
                        continue
                    published_at = _rss_parse_published_ts(published_raw)
                    rows_to_insert.append(
                        (sid, dk[:500], link[:2000], title[:500], int(published_at), published_raw[:500], int(fetched_at), int(created_at))
                    )
                if rows_to_insert:
                    conn.executemany(
                        "INSERT OR IGNORE INTO rss_entries(source_id, dedup_key, url, title, published_at, published_raw, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        rows_to_insert,
                    )
                _rss_entries_retention_cleanup(conn, sid, now)
                conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

        new_etag = (fetched.get("etag") or "").strip() if isinstance(fetched, dict) else ""
        new_lm = (fetched.get("last_modified") or "").strip() if isinstance(fetched, dict) else ""
        next_due = rss_next_due_at(now, cadence)
        conn.execute(
            "UPDATE rss_sources SET etag = ?, last_modified = ?, fail_count = 0, backoff_until = 0, last_error_reason = '', next_due_at = ? WHERE id = ?",
            (new_etag, new_lm, next_due, sid),
        )
        conn.commit()
        return {"ok": True, "source_id": sid, "next_due_at": next_due}
    except Exception as e:
        fail_count = int(row[6] or 0) + 1
        reason = str(e)
        backoff_sec = rss_backoff_s(fail_count, reason)
        until = now + int(backoff_sec)
        conn.execute(
            "UPDATE rss_sources SET fail_count = ?, backoff_until = ?, last_error_reason = ? WHERE id = ?",
            (fail_count, until, reason[:500], sid),
        )
        conn.commit()
        return {"ok": False, "source_id": sid, "error": reason, "backoff_until": until}


async def _rss_warmup_worker_loop() -> None:
    global _rss_warmup_running
    if _rss_warmup_queue is None:
        return
    while _rss_warmup_running:
        priority, _, sid, fut = await _rss_warmup_queue.get()
        try:
            if _rss_warmup_global_sem is None:
                res = await _rss_process_warmup_one(sid)
            else:
                async with _rss_warmup_global_sem:
                    res = await _rss_process_warmup_one(sid)
            try:
                if fut is not None and not fut.done():
                    fut.set_result(res)
            except Exception:
                pass
        finally:
            with _rss_warmup_inflight_lock:
                try:
                    _rss_warmup_inflight.discard(sid)
                except Exception:
                    pass
            try:
                _rss_warmup_queue.task_done()
            except Exception:
                pass


async def _rss_warmup_producer_loop() -> None:
    if _rss_warmup_queue is None:
        return
    while _rss_warmup_running:
        try:
            now = _now_ts()
            conn = _get_online_db_conn()
            cur = conn.execute(
                "SELECT id FROM rss_sources WHERE enabled = 1 AND cadence != 'P7' AND (next_due_at = 0 OR next_due_at <= ?) AND (backoff_until = 0 OR backoff_until <= ?) ORDER BY next_due_at ASC LIMIT 10",
                (now, now),
            )
            rows = cur.fetchall() or []
            for r in rows:
                sid = (r[0] or "").strip()
                if not sid:
                    continue
                await rss_enqueue_warmup(sid, priority=10)
        except Exception:
            pass
        await asyncio.sleep(20)


def rss_init_schedule_defaults(project_root) -> None:
    global _project_root
    _project_root = project_root
    conn = _get_online_db_conn()
    now = _now_ts()
    cur = conn.execute(
        "SELECT id, cadence, next_due_at FROM rss_sources WHERE enabled = 1 ORDER BY updated_at DESC"
    )
    rows = cur.fetchall() or []
    for r in rows:
        sid = (r[0] or "").strip()
        cadence = str(r[1] or "P4")
        next_due = int(r[2] or 0)
        if not sid:
            continue
        if next_due <= 0:
            nd = rss_next_due_at(now, cadence)
            try:
                conn.execute("UPDATE rss_sources SET next_due_at = ? WHERE id = ?", (nd, sid))
            except Exception:
                pass
    try:
        conn.commit()
    except Exception:
        pass


def rss_enforce_high_freq_cap(project_root) -> None:
    global _project_root
    _project_root = project_root
    cap = 25
    conn = _get_online_db_conn()
    cur = conn.execute(
        "SELECT id FROM rss_sources WHERE enabled = 1 AND (cadence = 'P0' OR cadence = 'P1') ORDER BY updated_at DESC"
    )
    rows = cur.fetchall() or []
    if len(rows) <= cap:
        return
    for r in rows[cap:]:
        sid = (r[0] or "").strip()
        if not sid:
            continue
        try:
            conn.execute("UPDATE rss_sources SET cadence = 'P2' WHERE id = ?", (sid,))
        except Exception:
            pass
    try:
        conn.commit()
    except Exception:
        pass


async def start(app, project_root) -> None:
    global _project_root
    global _rss_warmup_queue, _rss_warmup_worker_task, _rss_warmup_producer_task, _rss_warmup_running, _rss_warmup_global_sem

    _project_root = project_root

    app.state.rss_enqueue_warmup = rss_enqueue_warmup

    enabled = (os.environ.get("TREND_RADAR_RSS_WARMUP_ENABLED") or "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }
    if not enabled:
        return

    if _rss_warmup_queue is None:
        _rss_warmup_queue = asyncio.PriorityQueue()
    _rss_warmup_global_sem = asyncio.Semaphore(2)
    _rss_warmup_running = True

    if _rss_warmup_worker_task is None or _rss_warmup_worker_task.done():
        _rss_warmup_worker_task = asyncio.create_task(_rss_warmup_worker_loop())
    if _rss_warmup_producer_task is None or _rss_warmup_producer_task.done():
        _rss_warmup_producer_task = asyncio.create_task(_rss_warmup_producer_loop())



async def stop() -> None:
    global _rss_warmup_running

    _rss_warmup_running = False

    try:
        if _rss_warmup_worker_task is not None:
            _rss_warmup_worker_task.cancel()
    except Exception:
        pass

    try:
        if _rss_warmup_producer_task is not None:
            _rss_warmup_producer_task.cancel()
    except Exception:
        pass
