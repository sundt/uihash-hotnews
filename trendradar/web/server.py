"""
TrendRadar Web Viewer Server

提供基于 Web 的新闻分类查看器界面
支持定时自动获取最新数据
"""

import asyncio
import hashlib
import ipaddress
import random
import os
import secrets
import socket
import sqlite3
import sys
import time
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock, Semaphore
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote, urljoin, urlparse

from fastapi import FastAPI, Request, Query, Body, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json

# 添加项目根目录到 Python 路径
# trendradar/web/server.py -> trendradar/web -> trendradar -> hotnews (项目根目录)
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from trendradar.web.news_viewer import NewsViewerService, generate_news_id
from mcp_server.services.data_service import DataService
from mcp_server.services.cache_service import get_cache
from trendradar.crawler import DataFetcher
from trendradar.core import load_config
from trendradar.storage import convert_crawl_results_to_news_data
from trendradar.web.db_online import get_online_db_conn
from trendradar.web.rss_admin import router as _rss_admin_router
from trendradar.web.rss_usage_metrics import router as _rss_usage_router
from trendradar.web.rss_usage_metrics import rss_usage_record
from trendradar.web.rss_proxy import router as _rss_proxy_router
from trendradar.web.rss_proxy import rss_proxy_fetch_cached, rss_proxy_fetch_warmup, validate_http_url
from trendradar.web import auto_fetch_scheduler
from trendradar.web import rss_scheduler
from trendradar.web import page_rendering
from trendradar.web.misc_routes import router as _misc_router
from trendradar.web.online_routes import router as _online_router
from trendradar.web.viewer_controls_routes import router as _viewer_controls_router
from trendradar.web.fetch_metrics_routes import router as _fetch_metrics_router
from trendradar.web.system_routes import router as _system_router
from trendradar.web.user_db import (
    create_user_with_cookie_identity,
    get_user_db_conn,
    list_rss_subscriptions,
    replace_rss_subscriptions,
    resolve_user_id_by_cookie_token,
)


def _md5_hex(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def _parse_rfc822_dt(value: str) -> Optional[datetime]:
    s = (value or "").strip()
    if not s:
        return None
    try:
        from email.utils import parsedate_to_datetime

        dt = parsedate_to_datetime(s)
        if dt is None:
            return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(tz=None).replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _maybe_mint_rss_uid_cookie(request: Request) -> Tuple[Optional[int], Optional[str]]:
    tok = (request.cookies.get("rss_uid") or "").strip()
    if tok:
        uid = _resolve_anon_user_id(request)
        return uid, None

    try:
        tok = secrets.token_urlsafe(32)
        uid = create_user_with_cookie_identity(conn=_get_user_db_conn(), token=tok)
        return uid, tok
    except Exception:
        return None, None


def _enrich_rss_subscriptions(subs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items = list(subs or [])
    ids: List[str] = []
    seen = set()
    for s in items:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("source_id") or s.get("rss_source_id") or "").strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        ids.append(sid)

    if not ids:
        return items

    try:
        conn = _get_online_db_conn()
        placeholders = ",".join(["?"] * len(ids))
        cur = conn.execute(
            f"SELECT id, url FROM rss_sources WHERE id IN ({placeholders})",
            tuple(ids),
        )
        rows = cur.fetchall() or []
        id_to_url = {str(r[0] or "").strip(): str(r[1] or "").strip() for r in rows}
    except Exception:
        id_to_url = {}

    out: List[Dict[str, Any]] = []
    for s in items:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("source_id") or s.get("rss_source_id") or "").strip()
        if sid and not str(s.get("url") or "").strip():
            u = id_to_url.get(sid) or ""
            if u:
                s = {**s, "url": u}
        out.append(s)
    return out


def _normalize_rss_column_to_cat_id(column: str) -> str:
    s = (column or "").strip()
    if not s:
        s = "RSS"
    lowered = s.lower()
    buf = []
    prev_dash = False
    for ch in lowered:
        ok = ("a" <= ch <= "z") or ("0" <= ch <= "9")
        if ok:
            buf.append(ch)
            prev_dash = False
            continue
        if not prev_dash:
            buf.append("-")
            prev_dash = True
    slug = "".join(buf).strip("-")
    if not slug:
        slug = "rss"
    return f"rsscol-{slug}"


def _is_ai_rss_source_category(raw: Any) -> bool:
    s = str(raw or "").strip().lower()
    if not s:
        return False
    if "人工智能" in s:
        return True
    if "ai" in s:
        return True
    return False


def _pick_target_category_id(*, base_categories: Dict[str, Any], rss_cat_id: str) -> Optional[str]:
    if not rss_cat_id or not isinstance(rss_cat_id, str):
        return None
    if not rss_cat_id.startswith("rsscol-"):
        return None
    slug = rss_cat_id[len("rsscol-") :]
    if not slug:
        return None

    candidates = [slug, slug.replace("-", "_")]
    for c in candidates:
        if c and isinstance(base_categories, dict) and c in base_categories:
            return c

    if isinstance(base_categories, dict) and "general" in base_categories:
        return "general"

    try:
        keys = [k for k in (base_categories or {}).keys() if k and str(k) != "explore"]
        return keys[0] if keys else None
    except Exception:
        return None


def _build_rss_categories_from_subscriptions_db(
    *,
    subscriptions: List[Dict[str, Any]],
    max_subscriptions: int = 25,
    per_feed_limit: int = 30,
) -> Dict[str, Any]:
    subs = [s for s in (subscriptions or []) if isinstance(s, dict)]
    subs = subs[: max(0, int(max_subscriptions))]
    if not subs:
        return {}

    conn = _get_online_db_conn()
    categories: Dict[str, Any] = {}

    for sub in subs:
        source_id = (sub.get("source_id") or sub.get("rss_source_id") or "").strip()
        if source_id.startswith("rss-"):
            source_id = source_id[len("rss-") :].strip()
        if not source_id:
            continue

        source = _db_get_rss_source(source_id)
        if not source or not source.get("enabled"):
            continue

        column = (sub.get("column") or "").strip()
        if not column:
            if _is_ai_rss_source_category(source.get("category")):
                column = "AI资讯"
            else:
                column = "RSS"
        rss_cat_id = _normalize_rss_column_to_cat_id(column)
        cat = categories.get(rss_cat_id)
        if cat is None:
            cat = {"name": column, "icon": "📰", "platforms": {}}
            categories[rss_cat_id] = cat

        platform_id = (sub.get("platform_id") or "").strip() or f"rss-{source_id}"

        platform_name = (sub.get("feed_title") or "").strip()
        if not platform_name:
            platform_name = (source.get("name") or "").strip()
        if not platform_name:
            try:
                host = urlparse(str(source.get("url") or "")).hostname or ""
            except Exception:
                host = ""
            platform_name = host or platform_id

        platforms = cat.get("platforms")
        platform = platforms.get(platform_id)
        if platform is None:
            platform = {"id": platform_id, "name": platform_name, "news": [], "is_new": False}
            platforms[platform_id] = platform

        try:
            cur = conn.execute(
                """
                SELECT title, url, published_at, published_raw, created_at
                FROM rss_entries
                WHERE source_id = ?
                ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                LIMIT 50
                """,
                (source_id,),
            )
            rows = cur.fetchall() or []
        except Exception:
            rows = []

        for r in rows[: max(0, int(per_feed_limit))]:
            title = (r[0] or "").strip()
            link = (r[1] or "").strip()
            if not title:
                title = link
            if not link:
                continue
            stable_id = generate_news_id(platform_id, title)
            platform["news"].append(
                {
                    "title": title,
                    "display_title": title,
                    "url": link,
                    "meta": "",
                    "stable_id": stable_id,
                }
            )

    return categories


def _merge_rss_categories_into_news_data(*, data: Dict[str, Any], rss_categories: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return data
    base_categories = data.get("categories")
    if not isinstance(base_categories, dict) or not isinstance(rss_categories, dict) or not rss_categories:
        return data

    for rss_cat_id, rss_cat in (rss_categories or {}).items():
        if not isinstance(rss_cat, dict):
            continue
        target_id = _pick_target_category_id(base_categories=base_categories, rss_cat_id=str(rss_cat_id))
        if not target_id:
            continue

        base_cat = base_categories.get(target_id) or {}
        base_platforms = base_cat.get("platforms") if isinstance(base_cat, dict) else None
        if not isinstance(base_platforms, dict):
            base_platforms = {}

        rss_platforms = rss_cat.get("platforms") if isinstance(rss_cat, dict) else None
        if not isinstance(rss_platforms, dict) or not rss_platforms:
            continue

        base_categories[target_id] = {**base_cat, "platforms": {**rss_platforms, **base_platforms}}

    data["categories"] = {**base_categories}
    return data


def _build_ai_rss_platforms_from_sources_db(*, max_sources: int = 12, per_feed_limit: int = 20) -> Dict[str, Any]:
    conn = _get_online_db_conn()
    lim = max(0, int(max_sources))
    if lim <= 0:
        return {}

    try:
        cur = conn.execute(
            """
            SELECT id, name, url, category
            FROM rss_sources
            WHERE enabled = 1
              AND (
                category LIKE '%人工智能%'
                OR lower(category) LIKE '%ai%'
              )
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (lim,),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    platforms: Dict[str, Any] = {}
    for r in rows:
        try:
            sid = str(r[0] or "").strip()
            name = str(r[1] or "").strip()
        except Exception:
            continue
        if not sid:
            continue
        pid = f"rss-{sid}"
        if not name:
            name = pid

        try:
            cur2 = conn.execute(
                """
                SELECT title, url, published_at, published_raw, created_at
                FROM rss_entries
                WHERE source_id = ?
                ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                LIMIT 50
                """,
                (sid,),
            )
            ent_rows = cur2.fetchall() or []
        except Exception:
            ent_rows = []

        news_items: List[Dict[str, Any]] = []
        for er in ent_rows[: max(0, int(per_feed_limit))]:
            title = (er[0] or "").strip()
            link = (er[1] or "").strip()
            if not title:
                title = link
            if not link:
                continue
            news_items.append(
                {
                    "title": title,
                    "display_title": title,
                    "url": link,
                    "meta": "",
                    "stable_id": generate_news_id(pid, title),
                }
            )

        if not news_items:
            continue

        platforms[pid] = {
            "id": pid,
            "name": name,
            "news": news_items,
            "is_new": False,
        }

    return platforms


def _inject_ai_rss_sources_into_data(*, data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return data
    cats = data.get("categories")
    if not isinstance(cats, dict):
        return data

    platforms = _build_ai_rss_platforms_from_sources_db(max_sources=12, per_feed_limit=20)
    if not platforms:
        return data

    ai_cat = cats.get("ai")
    if not isinstance(ai_cat, dict):
        ai_cat = {
            "id": "ai",
            "name": "AI资讯",
            "icon": "🤖",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
        }

    existing = ai_cat.get("platforms") if isinstance(ai_cat.get("platforms"), dict) else {}
    merged = {**platforms, **existing}
    ai_cat = {**ai_cat, "platforms": merged}
    cats["ai"] = ai_cat
    data["categories"] = {**cats}
    return data


def _inject_rss_subscription_news_into_data(*, request: Request, data: Dict[str, Any]) -> Dict[str, Any]:
    user_id = _resolve_anon_user_id(request)
    if not user_id:
        return data
    try:
        subs = list_rss_subscriptions(conn=_get_user_db_conn(), user_id=user_id)
    except Exception:
        subs = []
    rss_categories = _build_rss_categories_from_subscriptions_db(subscriptions=subs)
    return _merge_rss_categories_into_news_data(data=data, rss_categories=rss_categories)


# 创建 FastAPI 应用
app = FastAPI(title="TrendRadar News Viewer", version="1.0.0")
app.state.project_root = project_root

# 启用 Gzip 压缩（响应大于 500 字节时压缩）
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(_rss_admin_router)
app.include_router(_rss_usage_router)
app.include_router(_rss_proxy_router)
app.include_router(_misc_router)
app.include_router(_online_router)
app.include_router(_viewer_controls_router)
app.include_router(_fetch_metrics_router)
app.include_router(_system_router)

# 挂载静态文件目录（带缓存控制）
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# 静态资源缓存中间件
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    
    # 为静态资源添加缓存头
    if path.startswith("/static/"):
        # CSS/JS 文件缓存 1 小时（开发期间），生产环境可设更长
        response.headers["Cache-Control"] = "public, max-age=3600"
    
    return response

_FETCH_METRICS_MAX = 5000
_fetch_metrics = deque(maxlen=_FETCH_METRICS_MAX)
_fetch_metrics_lock = Lock()

_last_platform_content_keys = {}


def _metrics_file_path() -> Path:
    return project_root / "output" / "metrics" / "fetch_metrics.jsonl"


def _append_fetch_metrics_batch(metrics):
    if not metrics:
        return

    try:
        fp = _metrics_file_path()
        fp.parent.mkdir(parents=True, exist_ok=True)
        with fp.open("a", encoding="utf-8") as f:
            for m in metrics:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")

        try:
            lines = fp.read_text(encoding="utf-8").splitlines()
        except Exception:
            lines = []
        if len(lines) > _FETCH_METRICS_MAX:
            fp.write_text("\n".join(lines[-_FETCH_METRICS_MAX:]) + "\n", encoding="utf-8")
    except Exception:
        return


def _record_fetch_metrics(metrics):
    if not metrics:
        return

    with _fetch_metrics_lock:
        for m in metrics:
            _fetch_metrics.append(m)


def _fetch_metrics_get_items_snapshot():
    with _fetch_metrics_lock:
        return list(_fetch_metrics)


app.state.fetch_metrics_get_items = _fetch_metrics_get_items_snapshot
app.state.fetch_metrics_max = _FETCH_METRICS_MAX


# 自定义 JSONResponse 类，确保中文正确显示
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

# 配置模板目录
templates_dir = Path(__file__).parent / "templates"
templates_dir.mkdir(exist_ok=True)
templates = Jinja2Templates(directory=str(templates_dir))
app.state.templates = templates

# 全局服务实例
_viewer_service: Optional[NewsViewerService] = None
_data_service: Optional[DataService] = None

_user_db_conn: Optional[sqlite3.Connection] = None


def _get_online_db_conn() -> sqlite3.Connection:
    return get_online_db_conn(project_root)


def _get_user_db_conn() -> sqlite3.Connection:
    global _user_db_conn
    if _user_db_conn is not None:
        return _user_db_conn
    _user_db_conn = get_user_db_conn(project_root)
    return _user_db_conn


def _beta_invite_token() -> str:
    return (os.environ.get("TREND_RADAR_BETA_INVITE_TOKEN") or "").strip()


def _beta_can_mint_identity(request: Request) -> bool:
    token = _beta_invite_token()
    if not token:
        return False
    got = (request.query_params.get("invite") or "").strip()
    if not got:
        got = (request.headers.get("X-Beta-Invite") or "").strip()
    return bool(got and got == token)


def _resolve_anon_user_id(request: Request) -> Optional[int]:
    tok = (request.cookies.get("rss_uid") or "").strip()
    if not tok:
        return None
    try:
        user_id = resolve_user_id_by_cookie_token(conn=_get_user_db_conn(), token=tok)
        if user_id:
            return user_id

        # Legacy compatibility: existing rss_uid cookie may have been minted
        # client-side (or under old gating) and thus not present in user.db.
        # For B1, we always allow creating a server identity.
        return create_user_with_cookie_identity(conn=_get_user_db_conn(), token=tok)
    except Exception:
        return None


def _now_ts() -> int:
    return int(time.time())


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


def _init_default_rss_sources_if_empty() -> None:
    conn = _get_online_db_conn()
    cur = conn.execute("SELECT COUNT(*) FROM rss_sources")
    row = cur.fetchone()
    if row and int(row[0]) > 0:
        return

    now = _now_ts()
    defaults = [
        {
            "name": "Sam Altman",
            "url": "http://blog.samaltman.com/posts.atom",
        }
    ]
    for d in defaults:
        url = d.get("url")
        try:
            url = validate_http_url(url)
        except Exception:
            continue
        host = (urlparse(url).hostname or "").strip().lower() or "-"
        sid = f"rsssrc-{_md5_hex(url)[:12]}"
        conn.execute(
            "INSERT OR IGNORE INTO rss_sources(id, name, url, host, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
            (sid, d.get("name") or host, url, host, now, now),
        )
    conn.commit()


def _row_to_rss_source(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row[0],
        "name": row[1],
        "url": row[2],
        "host": row[3],
        "category": row[4] if len(row) > 4 else "",
        "feed_type": row[5] if len(row) > 5 else "",
        "country": row[6] if len(row) > 6 else "",
        "language": row[7] if len(row) > 7 else "",
        "source": row[8] if len(row) > 8 else "",
        "seed_last_updated": row[9] if len(row) > 9 else "",
        "enabled": int(row[10]) == 1 if len(row) > 10 else True,
        "created_at": int(row[11]) if len(row) > 11 else 0,
        "updated_at": int(row[12]) if len(row) > 12 else 0,
    }


def _db_list_rss_sources(enabled_only: bool = True) -> List[Dict[str, Any]]:
    conn = _get_online_db_conn()
    if enabled_only:
        cur = conn.execute(
            "SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at FROM rss_sources WHERE enabled = 1 ORDER BY updated_at DESC"
        )
    else:
        cur = conn.execute(
            "SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at FROM rss_sources ORDER BY updated_at DESC"
        )
    rows = cur.fetchall() or []
    return [_row_to_rss_source(r) for r in rows]


def _db_get_rss_source(source_id: str) -> Optional[Dict[str, Any]]:
    sid = (source_id or "").strip()
    if not sid:
        return None
    conn = _get_online_db_conn()
    cur = conn.execute(
        "SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at FROM rss_sources WHERE id = ?",
        (sid,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _row_to_rss_source(row)


def _db_find_enabled_source_by_url(url: str) -> Optional[Dict[str, Any]]:
    u = (url or "").strip()
    if not u:
        return None
    conn = _get_online_db_conn()
    cur = conn.execute(
        "SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at FROM rss_sources WHERE enabled = 1 AND url = ?",
        (u,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _row_to_rss_source(row)


app.state.require_admin = _require_admin
app.state.init_default_rss_sources_if_empty = _init_default_rss_sources_if_empty
app.state.db_list_rss_sources = _db_list_rss_sources
app.state.row_to_rss_source = _row_to_rss_source
app.state.db_get_rss_source = _db_get_rss_source
app.state.db_find_enabled_source_by_url = _db_find_enabled_source_by_url


def get_services():
    """获取或初始化服务实例"""
    global _viewer_service, _data_service
    
    if _viewer_service is None:
        _data_service = DataService(project_root=str(project_root))
        _viewer_service = NewsViewerService(
            project_root=str(project_root),
            data_service=_data_service
        )
    
    return _viewer_service, _data_service


app.state.get_services = get_services


async def fetch_news_data():
    """执行一次数据获取"""
    def _run_blocking_fetch():
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔄 开始获取最新数据...")

            # 加载配置
            config = load_config(str(project_root / "config" / "config.yaml"))

            # 获取平台列表（load_config 返回的 key 是大写 PLATFORMS）
            platforms_config = config.get("PLATFORMS", [])

            # 处理列表格式：[{id: "xxx", name: "xxx"}, ...]
            if isinstance(platforms_config, list):
                platforms = {p["id"]: p["name"] for p in platforms_config if isinstance(p, dict) and "id" in p}
            else:
                # 字典格式：{id: name, ...}
                platforms = platforms_config

            platform_ids = list(platforms.keys())

            if not platform_ids:
                print("⚠️ 未配置任何平台")
                return {"success": False, "error": "未配置平台"}

            # 创建数据获取器
            crawler_config = config.get("CRAWLER", {})
            proxy_url = crawler_config.get("proxy_url") if crawler_config.get("use_proxy") else None
            api_url = crawler_config.get("api_url")
            fetcher = DataFetcher(proxy_url=proxy_url, api_url=api_url)

            # 构建平台ID和名称的元组列表
            platform_tuples = [(pid, platforms[pid]) for pid in platform_ids]

            # 批量获取数据（阻塞调用，放到线程里执行，避免卡住事件循环）
            crawl_results, id_to_name, failed_ids = fetcher.crawl_websites(platform_tuples)

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            batch_metrics = []
            for m in getattr(fetcher, "last_crawl_metrics", []) or []:
                if not isinstance(m, dict):
                    continue
                mm = dict(m)
                mm["fetched_at"] = now_str

                pid = str(mm.get("platform_id") or "").strip()
                content_keys = mm.pop("_content_keys", None)
                changed_count = None
                if pid and isinstance(content_keys, list):
                    prev = _last_platform_content_keys.get(pid)
                    if isinstance(prev, list) and prev:
                        prev_set = set(prev)
                        changed_count = sum(1 for k in content_keys if k not in prev_set)
                    else:
                        changed_count = len(content_keys)
                    _last_platform_content_keys[pid] = content_keys

                mm["changed_count"] = changed_count
                batch_metrics.append(mm)
            _record_fetch_metrics(batch_metrics)
            _append_fetch_metrics_batch(batch_metrics)

            if not crawl_results:
                print("⚠️ 未获取到任何数据")
                return {"success": False, "error": "未获取到数据"}

            # 获取当前时间
            now = datetime.now()
            crawl_time = now.strftime("%H:%M")
            crawl_date = now.strftime("%Y-%m-%d")

            # 转换并保存数据
            news_data = convert_crawl_results_to_news_data(
                crawl_results,
                id_to_name,
                failed_ids,
                crawl_time,
                crawl_date,
            )

            # 获取存储管理器并保存
            from trendradar.storage import StorageManager

            # 使用正确的存储配置初始化
            storage_config = config.get("STORAGE", {})
            storage = StorageManager(
                backend_type=storage_config.get("backend", "local"),
                data_dir=str(project_root / storage_config.get("local", {}).get("data_dir", "output")),
                enable_txt=storage_config.get("formats", {}).get("txt", False),
                enable_html=storage_config.get("formats", {}).get("html", False),
            )
            storage.save_news_data(news_data)

            try:
                from trendradar.providers.runner import build_default_registry, run_provider_ingestion_once

                print(f"[{now.strftime('%H:%M:%S')}] 🔄 运行 Provider Ingestion...")
                ok, metrics = run_provider_ingestion_once(
                    registry=build_default_registry(),
                    project_root=project_root,
                    config_path=project_root / "config" / "config.yaml",
                    now=now,
                )
                if metrics:
                    for m in metrics:
                        pid = m.get("platform_id", "?")
                        status = m.get("status", "?")
                        count = m.get("items_count", 0)
                        print(f"  - {pid}: {status} ({count} items)")
                else:
                    print("  - Provider Ingestion: 无配置或已禁用")
            except Exception as e:
                print(f"[{now.strftime('%H:%M:%S')}] ⚠️ Provider Ingestion 失败: {e}")

            global _viewer_service, _data_service
            auto_fetch_scheduler.record_last_fetch_time(datetime.now())

            # 清除缓存以加载新数据
            from mcp_server.services.cache_service import get_cache
            from trendradar.web.news_viewer import clear_categorized_news_cache

            cache = get_cache()
            cache.clear()  # 清除所有缓存
            clear_categorized_news_cache()  # 清除分类新闻缓存

            # 重置服务实例
            _viewer_service = None
            _data_service = None

            total_news = sum(len(items) for items in crawl_results.values())
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ 数据获取完成: {len(crawl_results)} 个平台, {total_news} 条新闻")

            return {"success": True, "platforms": len(crawl_results), "news_count": total_news}

        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ 数据获取失败: {e}")
            return {"success": False, "error": str(e)}

    return await asyncio.to_thread(_run_blocking_fetch)


app.state.fetch_news_data = fetch_news_data


def _get_cdn_base_url() -> str:
    return page_rendering._get_cdn_base_url(project_root)


def _read_user_config_from_cookie(request: Request) -> Optional[dict]:
    return page_rendering._read_user_config_from_cookie(request)


def _apply_user_config_to_data(data: dict, user_config: dict) -> dict:
    return page_rendering._apply_user_config_to_data(data, user_config)


async def _render_viewer_page(
    request: Request,
    filter: Optional[str],
    platforms: Optional[str],
):
    return await page_rendering.render_viewer_page(
        request,
        filter,
        platforms,
        get_services=get_services,
        templates=templates,
        project_root=project_root,
        beta_can_mint_identity=_beta_can_mint_identity,
        get_user_db_conn=_get_user_db_conn,
        create_user_with_cookie_identity=create_user_with_cookie_identity,
        merge_rss_subscription_news_into_data=_inject_rss_subscription_news_into_data,
    )


@app.get("/api/me/rss-subscriptions")
async def api_me_rss_subscriptions_get(request: Request):
    user_id, minted_tok = _maybe_mint_rss_uid_cookie(request)
    if not user_id:
        raise HTTPException(status_code=500, detail="Failed to resolve rss identity")
    subs = _enrich_rss_subscriptions(
        list_rss_subscriptions(conn=_get_user_db_conn(), user_id=user_id)
    )
    resp = UnicodeJSONResponse(content={"subscriptions": subs})
    if minted_tok:
        resp.set_cookie(key="rss_uid", value=minted_tok, httponly=True, samesite="lax", path="/")
    return resp


@app.put("/api/me/rss-subscriptions")
async def api_me_put_rss_subscriptions(request: Request):
    user_id, minted_tok = _maybe_mint_rss_uid_cookie(request)
    if not user_id:
        raise HTTPException(status_code=500, detail="Failed to resolve rss identity")

    prev_subs = []
    try:
        prev_subs = list_rss_subscriptions(conn=_get_user_db_conn(), user_id=user_id)
    except Exception:
        prev_subs = []
    try:
        body = await request.json()
    except Exception:
        body = {}
    subs = body.get("subscriptions") if isinstance(body, dict) else None
    if not isinstance(subs, list):
        raise HTTPException(status_code=400, detail="Invalid subscriptions")
    saved = _enrich_rss_subscriptions(
        replace_rss_subscriptions(conn=_get_user_db_conn(), user_id=user_id, subscriptions=subs)
    )

    try:
        prev_set = set(
            [
                str(s.get("source_id") or s.get("rss_source_id") or "").strip()
                for s in (prev_subs or [])
                if isinstance(s, dict)
            ]
        )
        new_ids = []
        for s in saved or []:
            if not isinstance(s, dict):
                continue
            sid = str(s.get("source_id") or s.get("rss_source_id") or "").strip()
            if not sid:
                continue
            if sid in prev_set:
                continue
            new_ids.append(sid)
        if new_ids:
            enqueue = getattr(request.app.state, "rss_enqueue_warmup", None)
            if callable(enqueue):
                cap = 25
                uniq = []
                seen = set()
                for sid in new_ids:
                    if sid in seen:
                        continue
                    seen.add(sid)
                    uniq.append(sid)
                for sid in uniq[:cap]:
                    try:
                        await enqueue(sid, priority=0)
                    except Exception:
                        continue
    except Exception:
        pass
    resp = UnicodeJSONResponse(content={"subscriptions": saved})
    if minted_tok:
        resp.set_cookie(key="rss_uid", value=minted_tok, httponly=True, samesite="lax", path="/")
    return resp


@app.get("/", response_class=HTMLResponse)
async def root(
    request: Request,
    filter: Optional[str] = Query(None, description="过滤模式: strict/moderate/off"),
    platforms: Optional[str] = Query(None, description="平台列表，逗号分隔"),
):
    return await _render_viewer_page(request, filter=filter, platforms=platforms)


def _redirect_to_root(request: Request) -> RedirectResponse:
    qs = request.url.query
    url = "/" + (f"?{qs}" if qs else "")
    return RedirectResponse(url=url, status_code=307)


@app.get("/index.html", response_class=HTMLResponse)
async def index_html(request: Request):
    return _redirect_to_root(request)


@app.get("/viewer", response_class=HTMLResponse)
async def viewer(
    request: Request,
    filter: Optional[str] = Query(None, description="过滤模式: strict/moderate/off"),
    platforms: Optional[str] = Query(None, description="平台列表，逗号分隔")
):
    """
    新闻分类查看器主页面
    
    Args:
        filter: 临时覆盖过滤模式
        platforms: 指定要查看的平台（逗号分隔）
    """
    return _redirect_to_root(request)


@app.get("/api/news")
async def api_news(
    request: Request,
    platforms: Optional[str] = Query(None),
    limit: int = Query(5000, ge=1, le=10000),
    filter_mode: Optional[str] = Query(None)
):
    """API: 获取分类新闻数据（JSON格式）"""
    viewer_service, _ = get_services()
    
    platform_list = None
    if platforms:
        platform_list = [p.strip() for p in platforms.split(",") if p.strip()]
    
    data = viewer_service.get_categorized_news(
        platforms=platform_list,
        limit=limit,
        apply_filter=True,
        filter_mode=filter_mode
    )

    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if isinstance(cats, dict) and "explore" not in cats:
            explore = {
                "id": "explore",
                "name": "深入探索",
                "icon": "🔎",
                "platforms": {},
                "news_count": 0,
                "filtered_count": 0,
                "is_new": False,
            }
            data["categories"] = {"explore": explore, **cats}
    except Exception:
        pass

    try:
        data = _inject_ai_rss_sources_into_data(data=data)
    except Exception:
        pass

    try:
        data = _inject_rss_subscription_news_into_data(request=request, data=data)
    except Exception:
        pass

    return UnicodeJSONResponse(content=data)


@app.get("/api/news/page")
async def api_news_page(
    platform_id: str = Query(..., description="平台 ID"),
    offset: int = Query(0, ge=0, description="起始偏移"),
    page_size: int = Query(20, ge=1, le=200, description="分页大小"),
    filter_mode: Optional[str] = Query(None),
):
    viewer_service, _ = get_services()

    pid = (platform_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="Missing platform_id")

    if pid.startswith("rss-"):
        sid = pid[len("rss-") :].strip()
        if not sid:
            raise HTTPException(status_code=400, detail="Invalid platform_id")

        conn = _get_online_db_conn()
        try:
            cur = conn.execute(
                """
                SELECT title, url, published_at, published_raw, created_at
                FROM rss_entries
                WHERE source_id = ?
                ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (sid, int(page_size) + 1, int(offset)),
            )
            rows = cur.fetchall() or []
        except Exception:
            rows = []

        has_more = len(rows) > int(page_size)
        rows = rows[: int(page_size)]
        next_offset = (int(offset) + int(page_size)) if has_more else None

        items: List[Dict[str, Any]] = []
        for r in rows:
            title = (r[0] or "").strip()
            link = (r[1] or "").strip()
            if not title:
                title = link
            if not link:
                continue
            items.append(
                {
                    "title": title,
                    "display_title": title,
                    "url": link,
                    "meta": "",
                    "stable_id": generate_news_id(pid, title),
                }
            )

        return UnicodeJSONResponse(
            content={
                "platform_id": pid,
                "offset": int(offset),
                "page_size": int(page_size),
                "next_offset": next_offset,
                "has_more": has_more,
                "items": items,
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
        )

    safe_limit = min(max(offset + page_size + 1, page_size + 1), 10000)

    data = viewer_service.get_categorized_news(
        platforms=[pid],
        limit=safe_limit,
        apply_filter=True,
        filter_mode=filter_mode,
    )

    platform = None
    categories = (data or {}).get("categories") or {}
    for cat in categories.values():
        platforms_obj = (cat or {}).get("platforms") or {}
        if pid in platforms_obj:
            platform = platforms_obj.get(pid)
            break

    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")

    news_items = platform.get("news") or []
    sliced = news_items[offset : offset + page_size]
    has_more = (offset + page_size) < len(news_items)
    next_offset = (offset + page_size) if has_more else None

    return UnicodeJSONResponse(
        content={
            "platform_id": pid,
            "offset": offset,
            "page_size": page_size,
            "next_offset": next_offset,
            "has_more": has_more,
            "items": sliced,
            "updated_at": (data or {}).get("updated_at"),
        }
    )


@app.post("/api/news/pages")
async def api_news_pages(
    request: Request,
    page_size: int = Query(20, ge=1, le=200, description="分页大小"),
    filter_mode: Optional[str] = Query(None),
):
    """API: 批量分页获取多平台新闻（每平台 offset=0）"""
    viewer_service, _ = get_services()

    try:
        body = await request.json()
    except Exception:
        body = {}

    platform_ids = None
    if isinstance(body, dict):
        platform_ids = body.get("platform_ids")

    if not isinstance(platform_ids, list) or not platform_ids:
        raise HTTPException(status_code=400, detail="Missing platform_ids")

    cleaned: List[str] = []
    for p in platform_ids:
        pid = (str(p) if p is not None else "").strip()
        if pid:
            cleaned.append(pid)

    if not cleaned:
        raise HTTPException(status_code=400, detail="Missing platform_ids")

    # Safety guard: avoid overly expensive requests
    if len(cleaned) > 120:
        raise HTTPException(status_code=400, detail="Too many platform_ids")

    safe_limit = min(max(page_size + 1, 2), 10000)

    results: Dict[str, Any] = {}
    updated_at = None

    for pid in cleaned:
        if pid.startswith("rss-"):
            sid = pid[len("rss-") :].strip()
            conn = _get_online_db_conn()
            try:
                cur = conn.execute(
                    """
                    SELECT title, url, published_at, published_raw, created_at
                    FROM rss_entries
                    WHERE source_id = ?
                    ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                    LIMIT ?
                    """,
                    (sid, int(page_size) + 1),
                )
                rows = cur.fetchall() or []
            except Exception:
                rows = []

            has_more = len(rows) > int(page_size)
            rows = rows[: int(page_size)]
            next_offset = int(page_size) if has_more else None

            items: List[Dict[str, Any]] = []
            for r in rows:
                title = (r[0] or "").strip()
                link = (r[1] or "").strip()
                if not title:
                    title = link
                if not link:
                    continue
                items.append(
                    {
                        "title": title,
                        "display_title": title,
                        "url": link,
                        "meta": "",
                        "stable_id": generate_news_id(pid, title),
                    }
                )

            if updated_at is None:
                updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            results[pid] = {
                "platform_id": pid,
                "offset": 0,
                "page_size": int(page_size),
                "next_offset": next_offset,
                "has_more": has_more,
                "items": items,
            }
            continue

        data = viewer_service.get_categorized_news(
            platforms=[pid],
            limit=safe_limit,
            apply_filter=True,
            filter_mode=filter_mode,
        )

        if updated_at is None:
            updated_at = (data or {}).get("updated_at")

        platform = None
        categories = (data or {}).get("categories") or {}
        for cat in categories.values():
            platforms_obj = (cat or {}).get("platforms") or {}
            if pid in platforms_obj:
                platform = platforms_obj.get(pid)
                break

        if not platform:
            results[pid] = {"platform_id": pid, "offset": 0, "page_size": page_size, "next_offset": None, "has_more": False, "items": []}
            continue

        news_items = platform.get("news") or []
        sliced = news_items[0:page_size]
        has_more = page_size < len(news_items)
        next_offset = page_size if has_more else None

        results[pid] = {
            "platform_id": pid,
            "offset": 0,
            "page_size": page_size,
            "next_offset": next_offset,
            "has_more": has_more,
            "items": sliced,
        }

    return UnicodeJSONResponse(content={"page_size": page_size, "platforms": results, "updated_at": updated_at})


@app.post("/api/subscriptions/rss-news")
async def api_subscriptions_rss_news(request: Request):
    mode = (request.query_params.get("mode") or "payload").strip().lower()
    read_mode = (
        request.query_params.get("read_mode")
        or os.environ.get("TREND_RADAR_RSS_NEWS_READ_MODE")
        or "db"
    ).strip().lower()
    if read_mode not in {"db", "proxy"}:
        read_mode = "db"
    try:
        body = await request.json()
    except Exception:
        body = {}

    subscriptions = None
    if mode in {"server", "auto"}:
        user_id = _resolve_anon_user_id(request)
        if user_id:
            subscriptions = list_rss_subscriptions(conn=_get_user_db_conn(), user_id=user_id)
        elif mode == "server":
            return JSONResponse(content={"detail": "Not allowlisted"}, status_code=403)

    if subscriptions is None:
        subscriptions = body.get("subscriptions") if isinstance(body, dict) else None
        if not isinstance(subscriptions, list):
            return JSONResponse(content={"detail": "Invalid subscriptions"}, status_code=400)

    rss_usage_record(project_root, request, len(subscriptions))

    if read_mode == "db":
        categories: Dict[str, Any] = {}

        conn = _get_online_db_conn()

        for sub in subscriptions:
            if not isinstance(sub, dict):
                continue

            source_id = (sub.get("source_id") or sub.get("rss_source_id") or "").strip()
            url = (sub.get("url") or "").strip()

            source = None
            if source_id:
                source = _db_get_rss_source(source_id)
                if not source or not source.get("enabled"):
                    continue
                url = (source.get("url") or "").strip()
            else:
                source = _db_find_enabled_source_by_url(url)
                if not source:
                    continue

            sid = (source.get("id") or "").strip() if isinstance(source, dict) else ""
            if not sid:
                continue

            column = (sub.get("column") or "RSS").strip() or "RSS"
            cat_id = _normalize_rss_column_to_cat_id(column)
            cat = categories.get(cat_id)
            if cat is None:
                cat = {"name": column, "icon": "📰", "platforms": {}}
                categories[cat_id] = cat

            platform_id = (sub.get("platform_id") or "").strip()
            if not platform_id:
                platform_id = f"rss-{sid}"

            platform_name = (sub.get("feed_title") or "").strip()
            if not platform_name:
                platform_name = (source.get("name") or "").strip()
            if not platform_name:
                try:
                    host = urlparse(url).hostname or ""
                except Exception:
                    host = ""
                platform_name = host or platform_id

            platforms = cat.get("platforms")
            platform = platforms.get(platform_id)
            if platform is None:
                platform = {"name": platform_name, "news": []}
                platforms[platform_id] = platform

            try:
                cur = conn.execute(
                    """
                    SELECT title, url, published_at, published_raw, created_at
                    FROM rss_entries
                    WHERE source_id = ?
                    ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                    LIMIT 50
                    """,
                    (sid,),
                )
                rows = cur.fetchall() or []
            except Exception:
                rows = []

            for r in rows[:30]:
                title = (r[0] or "").strip()
                link = (r[1] or "").strip()
                if not title:
                    title = link
                if not link:
                    continue
                stable_id = generate_news_id(platform_id, title)
                platform["news"].append(
                    {
                        "title": title,
                        "display_title": title,
                        "url": link,
                        "meta": "",
                        "stable_id": stable_id,
                    }
                )

        payload = {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "categories": categories,
        }
        return UnicodeJSONResponse(content=payload)

    sem = asyncio.Semaphore(5)

    async def _fetch_one(sub: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(sub, dict):
            return {"ok": False, "error": "Invalid subscription"}

        source_id = (sub.get("source_id") or sub.get("rss_source_id") or "").strip()
        url = (sub.get("url") or "").strip()

        source = None
        if source_id:
            source = _db_get_rss_source(source_id)
            if not source or not source.get("enabled"):
                return {"ok": False, "sub": sub, "error": "Source not found"}
            url = (source.get("url") or "").strip()
        else:
            # Backward compatibility: accept url only when it matches an enabled catalog source.
            source = _db_find_enabled_source_by_url(url)
            if not source:
                return {"ok": False, "sub": sub, "error": "URL not in RSS source catalog"}

        if not url:
            return {"ok": False, "sub": sub, "error": "Missing url"}
        async with sem:
            try:
                proxied = await asyncio.to_thread(rss_proxy_fetch_cached, url)
                return {"ok": True, "sub": sub, "proxied": proxied, "source": source}
            except Exception as e:
                return {"ok": False, "sub": sub, "error": str(e)}

    results = await asyncio.gather(*[_fetch_one(s) for s in subscriptions])

    categories: Dict[str, Any] = {}
    for r in results:
        if not r.get("ok"):
            continue
        sub = r.get("sub") or {}
        proxied = r.get("proxied") or {}
        source = r.get("source") or {}
        url = (source.get("url") or sub.get("url") or "").strip()
        column = (sub.get("column") or "RSS").strip() or "RSS"
        cat_id = _normalize_rss_column_to_cat_id(column)
        cat = categories.get(cat_id)
        if cat is None:
            cat = {"name": column, "icon": "📰", "platforms": {}}
            categories[cat_id] = cat

        platform_id = (sub.get("platform_id") or "").strip()
        if not platform_id:
            sid = (source.get("id") or "").strip()
            if sid:
                platform_id = f"rss-{sid}"
            else:
                platform_id = f"rss-{_md5_hex(url)[:8]}"

        platform_name = (sub.get("feed_title") or "").strip()
        if not platform_name:
            platform_name = (source.get("name") or "").strip()
        feed_title = ""
        data = proxied.get("data") or {}
        if isinstance(data, dict):
            feed = data.get("feed")
            if isinstance(feed, dict):
                feed_title = (feed.get("title") or "").strip()
        if not platform_name:
            platform_name = feed_title
        if not platform_name:
            try:
                host = urlparse(url).hostname or ""
            except Exception:
                host = ""
            platform_name = host or platform_id

        platforms = cat.get("platforms")
        platform = platforms.get(platform_id)
        if platform is None:
            platform = {"name": platform_name, "news": []}
            platforms[platform_id] = platform

        entries = data.get("entries") if isinstance(data, dict) else None
        if not isinstance(entries, list):
            continue

        parsed_items = []
        for ent in entries[:50]:
            if not isinstance(ent, dict):
                continue
            title = (ent.get("title") or "").strip()
            link = (ent.get("link") or "").strip()
            published = (ent.get("published") or "").strip()
            if not title:
                title = link
            if not link:
                continue
            dt = _parse_rfc822_dt(published) if published else None
            parsed_items.append((dt, title, link, published))

        parsed_items.sort(key=lambda x: (x[0] is not None, x[0] or datetime.min), reverse=True)

        for dt, title, link, published in parsed_items[:30]:
            stable_id = generate_news_id(platform_id, title)
            meta = published
            platform["news"].append(
                {
                    "title": title,
                    "display_title": title,
                    "url": link,
                    "meta": meta,
                    "stable_id": stable_id,
                }
            )

    payload = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "categories": categories,
    }
    return UnicodeJSONResponse(content=payload)


async def _warmup_cache():
    """预热缓存：在服务启动时预加载数据"""
    try:
        print("🔥 预热缓存中...")
        start_time = time.time()
        
        # 预加载新闻数据到缓存
        viewer_service, _ = get_services()
        viewer_service.get_categorized_news(
            platforms=None,
            limit=5000,
            apply_filter=True,
            filter_mode=None
        )
        
        elapsed = time.time() - start_time
        print(f"✅ 缓存预热完成 ({elapsed:.2f}s)")
    except Exception as e:
        print(f"⚠️ 缓存预热失败: {e}")


@app.on_event("startup")
async def on_startup():
    """服务器启动时的初始化"""
    # 1. 预热缓存
    await _warmup_cache()
    
    # 2. 读取配置决定是否自动启动定时任务
    try:
        import yaml
        config_path = project_root / "config" / "config.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            full_config = yaml.safe_load(f) or {}
        viewer_config = full_config.get("viewer", {}) or {}
        
        auto_fetch = viewer_config.get("auto_fetch", False)
        fetch_interval = viewer_config.get("fetch_interval_minutes", 30)
        
        if auto_fetch:
            print(f"📅 自动启动定时获取任务 (间隔: {fetch_interval} 分钟)")
            auto_fetch_scheduler.start_scheduler(lambda: fetch_news_data(), int(fetch_interval))

            # scheduler_loop 本身会立即执行一次 fetch_news_data()，避免启动时重复触发
    except Exception as e:
        print(f"⚠️ 读取配置失败，跳过自动定时任务: {e}")

    try:
        _get_online_db_conn()
        _init_default_rss_sources_if_empty()
        rss_scheduler.rss_enforce_high_freq_cap(project_root)
        rss_scheduler.rss_init_schedule_defaults(project_root)
    except Exception as e:
        print(f"⚠️ RSS init failed: {e}")

    try:
        await rss_scheduler.start(app, project_root)
    except Exception as e:
        print(f"⚠️ RSS scheduler start failed: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    try:
        auto_fetch_scheduler.stop_scheduler()
    except Exception:
        pass
    try:
        await rss_scheduler.stop()
    except Exception as e:
        print(f"⚠️ RSS scheduler stop failed: {e}")


def run_server(host: str = "0.0.0.0", port: int = 8080, auto_fetch: bool = False, interval: int = 30):
    """运行 Web 服务器"""
    import uvicorn
    
    print("=" * 60)
    print("🚀 TrendRadar News Viewer Server")
    print("=" * 60)
    print(f"📡 Server Address: http://{host}:{port}")
    print(f"🌐 Viewer URL: http://localhost:{port}/viewer")
    print(f"📊 API Docs: http://localhost:{port}/docs")
    print("-" * 60)
    print("📌 定时任务 API:")
    print(f"   POST /api/scheduler/start?interval=30  启动定时获取")
    print(f"   POST /api/scheduler/stop               停止定时获取")
    print(f"   GET  /api/scheduler/status             查看任务状态")
    print(f"   POST /api/fetch                        立即获取一次")
    print("=" * 60)
    print()
    
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="TrendRadar News Viewer Server")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址")
    parser.add_argument("--port", type=int, default=8080, help="监听端口")
    
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
