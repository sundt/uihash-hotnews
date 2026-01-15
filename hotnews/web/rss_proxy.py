import asyncio
import json
import os
import socket
import time
import ipaddress
import logging
from collections import deque
from threading import Lock, Semaphore
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import requests
import aiohttp
from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse, Response

from mcp_server.services.cache_service import get_cache
from hotnews.web.db_online import get_online_db_conn
from hotnews.web.user_db import get_user_db_conn, list_rss_subscriptions, resolve_user_id_by_cookie_token


router = APIRouter()

logger = logging.getLogger(__name__)


def _rss_http_timeout_s() -> float:
    try:
        v = float(os.environ.get("HOTNEWS_RSS_HTTP_TIMEOUT_S", "15"))
    except Exception:
        v = 15.0
    if not (v > 0):
        v = 15.0
    return float(max(1.0, min(60.0, v)))


def _rss_http_timeouts() -> Any:
    try:
        connect_raw = os.environ.get("HOTNEWS_RSS_HTTP_CONNECT_TIMEOUT_S", "").strip()
        read_raw = os.environ.get("HOTNEWS_RSS_HTTP_READ_TIMEOUT_S", "").strip()
    except Exception:
        connect_raw = ""
        read_raw = ""

    connect_s: Optional[float] = None
    read_s: Optional[float] = None
    try:
        if connect_raw:
            connect_s = float(connect_raw)
    except Exception:
        connect_s = None
    try:
        if read_raw:
            read_s = float(read_raw)
    except Exception:
        read_s = None

    if connect_s is None and read_s is None:
        legacy = _rss_http_timeout_s()
        return (legacy, legacy)

    if connect_s is None:
        connect_s = 3.0
    if read_s is None:
        read_s = 10.0

    connect_s = float(max(1.0, min(60.0, connect_s)))
    read_s = float(max(1.0, min(60.0, read_s)))
    return (connect_s, read_s)


def _rss_user_agent() -> str:
    try:
        ua = (os.environ.get("HOTNEWS_RSS_USER_AGENT", "") or "").strip()
    except Exception:
        ua = ""
    return ua or "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Hotnews/1.0"


def _rss_accept_language() -> str:
    try:
        v = (os.environ.get("HOTNEWS_RSS_ACCEPT_LANGUAGE", "") or "").strip()
    except Exception:
        v = ""
    return v or "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"


def _rss_http_max_bytes() -> int:
    raw = ""
    try:
        raw = (os.environ.get("HOTNEWS_RSS_HTTP_MAX_BYTES", "") or "").strip()
    except Exception:
        raw = ""

    v: Optional[int] = None
    if raw:
        try:
            v = int(raw)
        except Exception:
            v = None

    if v is None or v <= 0:
        v = 8 * 1024 * 1024

    return int(max(256 * 1024, min(64 * 1024 * 1024, v)))


def _rss_default_headers() -> Dict[str, str]:
    return {
        "User-Agent": _rss_user_agent(),
        "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml, application/json, */*",
        "Accept-Language": _rss_accept_language(),
    }


def _rss_http_proxies() -> Optional[Dict[str, str]]:
    """Get HTTP proxy configuration from environment variable HOTNEWS_RSS_HTTP_PROXY."""
    try:
        proxy = (os.environ.get("HOTNEWS_RSS_HTTP_PROXY", "") or "").strip()
    except Exception:
        proxy = ""
    if not proxy:
        return None
    return {"http": proxy, "https": proxy}


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


def _md5_hex(s: str) -> str:
    import hashlib

    return hashlib.md5(s.encode("utf-8")).hexdigest()


def is_blocked_ip(ip: Any) -> bool:
    return bool(
        getattr(ip, "is_private", False)
        or getattr(ip, "is_loopback", False)
        or getattr(ip, "is_link_local", False)
        or getattr(ip, "is_multicast", False)
        or getattr(ip, "is_reserved", False)
        or getattr(ip, "is_unspecified", False)
    )


def resolve_and_validate_host(host: str) -> None:
    host = (host or "").strip().lower()
    if not host:
        raise ValueError("Empty host")
    if host in {"localhost"}:
        raise ValueError("Blocked host")

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if ip is not None:
        if is_blocked_ip(ip):
            raise ValueError("Blocked IP")
        return

    infos = socket.getaddrinfo(host, None)
    if not infos:
        raise ValueError("Host resolve failed")
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if is_blocked_ip(ip_obj):
            raise ValueError("Blocked resolved IP")


def validate_http_url(raw_url: str, check_resolve: bool = True) -> str:
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
    if check_resolve:
        resolve_and_validate_host(parsed.hostname or "")
    return u


def _strip_xml_tag(tag: str) -> str:
    if not tag:
        return ""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def parse_feed_content(content_type: str, body: bytes) -> Dict[str, Any]:
    ct = (content_type or "").lower()
    text = body.decode("utf-8", errors="replace")
    if "json" in ct:
        payload = json.loads(text)
        if isinstance(payload, dict) and isinstance(payload.get("items"), list):
            feed_title = str(payload.get("title") or "")
            feed_lang = str(payload.get("language") or "")
            entries = []
            for it in payload.get("items") or []:
                if not isinstance(it, dict):
                    continue
                url = it.get("url") or it.get("external_url")
                title = it.get("title") or url
                published = it.get("date_published") or it.get("date_modified")
                entries.append({"title": title, "link": url, "published": published})
            return {"format": "json", "feed": {"title": feed_title, "language": feed_lang}, "entries": entries}
        return {"format": "json", "payload": payload}

    import xml.etree.ElementTree as ET

    root = ET.fromstring(body)
    root_tag = _strip_xml_tag(root.tag).lower()

    if root_tag == "rss":
        channel = None
        for child in root:
            if _strip_xml_tag(child.tag).lower() == "channel":
                channel = child
                break
        if channel is None:
            return {"format": "xml", "feed": {"title": ""}, "entries": []}

        feed_title = ""
        feed_lang = ""
        for child in channel:
            if _strip_xml_tag(child.tag).lower() == "title":
                feed_title = (child.text or "").strip()
                break
        for child in channel:
            if _strip_xml_tag(child.tag).lower() in {"language", "dc:language"}:
                feed_lang = (child.text or "").strip()
                if feed_lang:
                    break

        entries = []
        for item in channel:
            if _strip_xml_tag(item.tag).lower() != "item":
                continue
            title = ""
            link = ""
            pub = ""
            for c in item:
                t = _strip_xml_tag(c.tag).lower()
                if t == "title":
                    title = (c.text or "").strip()
                elif t == "link":
                    link = (c.text or "").strip() or (c.attrib.get("href") or "").strip()
                elif t in {"pubdate", "published", "updated", "date"}:
                    pub = (c.text or "").strip()
            if not title:
                title = link
            entries.append({"title": title, "link": link, "published": pub})
        return {"format": "rss", "feed": {"title": feed_title, "language": feed_lang}, "entries": entries}

    if root_tag == "feed":
        feed_title = ""
        feed_lang = ""
        try:
            feed_lang = (root.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") or root.attrib.get("lang") or "").strip()
        except Exception:
            feed_lang = ""
        for child in root:
            if _strip_xml_tag(child.tag).lower() == "title":
                feed_title = (child.text or "").strip()
                break
        for child in root:
            if _strip_xml_tag(child.tag).lower() == "language":
                v = (child.text or "").strip()
                if v:
                    feed_lang = v
                    break

        entries = []
        for ent in root:
            if _strip_xml_tag(ent.tag).lower() != "entry":
                continue
            title = ""
            link = ""
            pub = ""
            for c in ent:
                t = _strip_xml_tag(c.tag).lower()
                if t == "title":
                    title = (c.text or "").strip()
                elif t == "link":
                    rel = (c.attrib.get("rel") or "").strip().lower()
                    href = (c.attrib.get("href") or "").strip()
                    if href and (not link) and (not rel or rel == "alternate"):
                        link = href
                elif t in {"published", "updated"}:
                    pub = (c.text or "").strip()
            if not title:
                title = link
            entries.append({"title": title, "link": link, "published": pub})
        return {"format": "atom", "feed": {"title": feed_title, "language": feed_lang}, "entries": entries}

    return {"format": "xml", "feed": {"title": ""}, "entries": []}


def parse_html_content(body: bytes, rules: str) -> Dict[str, Any]:
    """Parse HTML content using CSS selectors defined in rules JSON."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        raise ValueError("bs4 not installed")

    rule_dict = {}
    try:
        rule_dict = json.loads(rules)
    except Exception:
        pass
    
    if not isinstance(rule_dict, dict):
        raise ValueError("Invalid scrape_rules json")

    item_sel = rule_dict.get("item")
    title_sel = rule_dict.get("title")
    link_sel = rule_dict.get("link")
    date_sel = rule_dict.get("date")  # Optional

    if not item_sel or not title_sel or not link_sel:
        raise ValueError("Missing required selectors: item, title, link")

    text = body.decode("utf-8", errors="replace")
    soup = BeautifulSoup(text, "html.parser")
    
    entries = []
    items = soup.select(item_sel)
    for it in items:
        try:
            # Title
            t_el = it.select_one(title_sel)
            if not t_el:
                continue
            title = t_el.get_text(strip=True)
            
            # Link
            l_el = it.select_one(link_sel)
            if not l_el:
                continue
            link = l_el.get("href")
            if not link:
                continue
            
            # Date (Optional)
            pub = ""
            if date_sel:
                d_el = it.select_one(date_sel)
                if d_el:
                    pub = d_el.get_text(strip=True) or d_el.get("datetime") or ""

            entries.append({"title": title, "link": link, "published": pub})
        except Exception:
            continue

    return {
        "format": "html",
        "feed": {"title": "Scraped Feed", "language": ""},
        "entries": entries
    }


def _extract_first_n_entries_from_truncated_xml(body: bytes, limit: int) -> Optional[bytes]:
    """Best-effort: salvage a valid minimal RSS/Atom XML from a truncated upstream response.

    This is used only when upstream response exceeds our max_bytes cap.
    It attempts to extract the first N <entry> (Atom) or <item> (RSS) blocks and
    wrap them with a minimal closing tail to make it well-formed for XML parsing.
    """

    if not body or limit <= 0:
        return None

    b = body
    stripped = b.lstrip()
    if not stripped.startswith(b"<"):
        return None

    lower = stripped[:4096].lower()
    is_atom = b"<feed" in lower
    is_rss = b"<rss" in lower

    if not (is_atom or is_rss):
        return None

    if is_atom:
        open_tag = b"<entry"
        close_tag = b"</entry>"
        end_tail = b"</feed>"
    else:
        open_tag = b"<item"
        close_tag = b"</item>"
        end_tail = b"</channel></rss>"

    start = stripped.find(open_tag)
    if start < 0:
        return None

    prefix = stripped[:start]
    items: List[bytes] = []
    pos = start
    for _ in range(int(limit)):
        o = stripped.find(open_tag, pos)
        if o < 0:
            break
        c = stripped.find(close_tag, o)
        if c < 0:
            break
        c_end = c + len(close_tag)
        items.append(stripped[o:c_end])
        pos = c_end

    if not items:
        return None

    # Ensure we have a minimal tail to close the document.
    # If the truncated body already contains the full tail, keep it.
    tail_pos = stripped.rfind(end_tail)
    if tail_pos >= 0:
        tail = stripped[tail_pos:]
    else:
        tail = end_tail

    return prefix + b"".join(items) + tail


_rss_host_limit_lock = Lock()
_rss_host_semaphores: Dict[str, Any] = {}
_rss_host_recent: Dict[str, deque] = {}


def get_rss_host_semaphore(host: str):
    h = (host or "").strip().lower() or "_"
    with _rss_host_limit_lock:
        sem = _rss_host_semaphores.get(h)
        if sem is None:
            max_conc = 1
            try:
                max_conc = int(os.environ.get("HOTNEWS_RSS_HOST_CONCURRENCY", "1"))
            except Exception:
                max_conc = 1
            sem = Semaphore(max_conc)
            _rss_host_semaphores[h] = sem
        return sem


_rss_host_async_lock = asyncio.Lock()
_rss_host_async_semaphores: Dict[str, asyncio.Semaphore] = {}


async def get_rss_host_async_semaphore(host: str) -> asyncio.Semaphore:
    h = (host or "").strip().lower() or "_"
    async with _rss_host_async_lock:
        sem = _rss_host_async_semaphores.get(h)
        if sem is None:
            max_conc = 1
            try:
                max_conc = int(os.environ.get("HOTNEWS_RSS_HOST_CONCURRENCY", "1"))
            except Exception:
                max_conc = 1
            sem = asyncio.Semaphore(max_conc)
            _rss_host_async_semaphores[h] = sem
        return sem


def rss_host_rate_limit_sleep(host: str) -> None:
    h = (host or "").strip().lower() or "_"
    max_per_10s = 5
    try:
        max_per_10s = int(os.environ.get("HOTNEWS_RSS_HOST_RATE_10S", "5"))
    except Exception:
        max_per_10s = 5

    now = time.time()
    with _rss_host_limit_lock:
        dq = _rss_host_recent.get(h)
        if dq is None:
            dq = deque(maxlen=max_per_10s * 3)
            _rss_host_recent[h] = dq
        while dq and now - dq[0] > 10:
            dq.popleft()
        if len(dq) >= max_per_10s:
            sleep_s = max(0.0, 10 - (now - dq[0]))
        else:
            sleep_s = 0.0
        dq.append(now)
    if sleep_s > 0:
        time.sleep(min(2.0, sleep_s))


def rss_proxy_fetch_cached(url: str) -> Dict[str, Any]:
    cache = get_cache()
    key = f"rssproxy:{_md5_hex(url)}"
    cached = cache.get(key, ttl=300)
    if isinstance(cached, dict):
        return cached

    parsed0 = urlparse(url)
    host0 = (parsed0.hostname or "").strip().lower()

    sem = get_rss_host_semaphore(host0)
    sem.acquire()
    try:
        current_url = url
        redirects = 0
        attempts = 0
        while True:
            current_url = validate_http_url(current_url)
            rss_host_rate_limit_sleep(host0)

            headers = _rss_default_headers()

            retry_after_s = None
            resp = None
            try:
                timeout = _rss_http_timeouts()
                resp = requests.get(
                    current_url,
                    headers=headers,
                    timeout=timeout,
                    allow_redirects=False,
                    stream=True,
                    proxies=_rss_http_proxies(),
                )

                if resp.status_code in {301, 302, 303, 307, 308}:
                    loc = (resp.headers.get("Location") or "").strip()
                    if not loc:
                        raise ValueError("Redirect without location")
                    redirects += 1
                    if redirects > 5:
                        raise ValueError("Too many redirects")
                    current_url = urljoin(current_url, loc)
                    continue

                if resp.status_code == 429:
                    logger.warning(
                        "RSS upstream may be blocked or rate limited (status=429). 可能触发了反爬或访问频率限制. url=%s",
                        current_url,
                    )
                    ra = (resp.headers.get("Retry-After") or "").strip()
                    try:
                        retry_after_s = int(ra)
                    except Exception:
                        retry_after_s = None
                    raise ValueError("Upstream rate limited")

                if resp.status_code == 403:
                    logger.warning(
                        "RSS upstream may be blocked or rate limited (status=403). 可能触发了反爬或访问频率限制. url=%s",
                        current_url,
                    )

                if resp.status_code >= 500:
                    if resp.status_code == 503:
                        logger.warning(
                            "RSS upstream may be blocked or rate limited (status=503). 可能触发了反爬或访问频率限制. url=%s",
                            current_url,
                        )
                    raise ValueError(f"Upstream error: {resp.status_code}")

                if resp.status_code >= 400:
                    raise ValueError(f"Upstream error: {resp.status_code}")

                content_type = (resp.headers.get("Content-Type") or "").split(";", 1)[0].strip()
                max_bytes = _rss_http_max_bytes()
                try:
                    resp.raw.decode_content = True
                except Exception:
                    pass
                data = resp.raw.read(max_bytes + 1)
                if len(data) > max_bytes:
                    # Best-effort fallback for huge feeds:
                    # Attempt to salvage a minimal valid feed from the truncated bytes.
                    truncated = data[:max_bytes]
                    parsed = None
                    for lim in (40, 20):
                        try:
                            maybe = _extract_first_n_entries_from_truncated_xml(truncated, lim)
                            if not maybe:
                                continue
                            parsed = parse_feed_content(content_type, maybe)
                            if isinstance(parsed, dict) and isinstance(parsed.get("entries"), list):
                                parsed["entries"] = (parsed.get("entries") or [])[:lim]
                            break
                        except Exception:
                            parsed = None
                            continue
                    if parsed is None:
                        raise ValueError("Response too large")

                    result = {
                        "url": url,
                        "final_url": current_url,
                        "content_type": content_type,
                        "data": parsed,
                        "etag": (resp.headers.get("ETag") or "").strip(),
                        "last_modified": (resp.headers.get("Last-Modified") or "").strip(),
                    }
                    cache.set(key, result)
                    return result

                stripped = data.lstrip()
                if stripped.startswith(b"<"):
                    head = stripped[:512].lower()
                    is_html = (b"<html" in head) or (b"<!doctype html" in head)
                    if is_html:
                        snippet = stripped[:240].decode("utf-8", errors="replace")
                        raise ValueError(f"Upstream returned HTML, not a feed: {snippet[:240]}")

                try:
                    parsed = parse_feed_content(content_type, data)
                except Exception as e:
                    if stripped[:2] == b"\x1f\x8b":
                        raise ValueError(
                            "Upstream returned gzip-compressed bytes that could not be decoded"
                        ) from e
                    raise

                result = {
                    "url": url,
                    "final_url": current_url,
                    "content_type": content_type,
                    "data": parsed,
                    "etag": (resp.headers.get("ETag") or "").strip(),
                    "last_modified": (resp.headers.get("Last-Modified") or "").strip(),
                }
                cache.set(key, result)
                return result
            except (requests.Timeout, requests.ConnectionError) as e:
                attempts += 1
                if attempts >= 3:
                    raise ValueError("Upstream timeout") from e
                time.sleep(min(4.0, 0.5 * (2 ** (attempts - 1))))
                continue
            except ValueError as e:
                msg = str(e)
                retryable = (
                    ("rate limited" in msg.lower())
                    or ("upstream error: 5" in msg.lower())
                    or ("upstream timeout" in msg.lower())
                )
                if retryable:
                    attempts += 1
                    if attempts >= 3:
                        raise
                    if retry_after_s is not None and retry_after_s > 0:
                        time.sleep(min(6.0, float(retry_after_s)))
                    else:
                        time.sleep(min(4.0, 0.5 * (2 ** (attempts - 1))))
                    continue
                raise
            finally:
                try:
                    if resp is not None:
                        resp.close()
                except Exception:
                    pass
    finally:
        try:
            sem.release()
        except Exception:
            pass


def _resolve_anon_user_id_from_request(request: Request) -> Optional[int]:
    try:
        tok = (request.cookies.get("rss_uid") or "").strip()
        if not tok:
            return None
        conn = get_user_db_conn(project_root=request.app.state.project_root)
        return resolve_user_id_by_cookie_token(conn=conn, token=tok)
    except Exception:
        return None


def _parse_exclude_source_ids(raw: str) -> List[str]:
    s = (raw or "").strip()
    if not s:
        return []
    out: List[str] = []
    seen = set()
    for part in s.split(","):
        sid = (part or "").strip()
        if not sid:
            continue
        if sid in seen:
            continue
        seen.add(sid)
        out.append(sid)
    return out


def _now_ts() -> int:
    return int(time.time())


def rss_proxy_cache_get_any_ttl(url: str, ttl: int) -> Optional[Dict[str, Any]]:
    cache = get_cache()
    key = f"rssproxy:{_md5_hex(url)}"
    cached = cache.get(key, ttl=ttl)
    return cached if isinstance(cached, dict) else None


def rss_proxy_fetch_warmup(url: str, etag: str = "", last_modified: str = "", scrape_rules: str = "", use_scraperapi: bool = False) -> Dict[str, Any]:
    cache = get_cache()
    key = f"rssproxy:{_md5_hex(url)}"

    parsed0 = urlparse(url)
    host0 = (parsed0.hostname or "").strip().lower()

    sem = get_rss_host_semaphore(host0)
    sem.acquire()
    try:
        current_url = url
        redirects = 0
        attempts = 0
        cur_etag = (etag or "").strip()
        cur_lm = (last_modified or "").strip()
        while True:
            current_url = validate_http_url(current_url, check_resolve=not use_scraperapi)
            rss_host_rate_limit_sleep(host0)

            headers = _rss_default_headers()
            if cur_etag:
                headers["If-None-Match"] = cur_etag
            if cur_lm:
                headers["If-Modified-Since"] = cur_lm

            retry_after_s = None
            resp = None
            try:
                timeout = _rss_http_timeouts()
                
                # Use ScraperAPI if enabled and API key is available
                request_url = current_url
                if use_scraperapi:
                    scraper_api_key = os.environ.get("SCRAPERAPI_KEY", "").strip()
                    if scraper_api_key:
                        # Route through ScraperAPI
                        request_url = f"http://api.scraperapi.com?api_key={scraper_api_key}&url={current_url}"
                        logger.info(f"Using ScraperAPI for RSS feed: {current_url}")
                
                resp = requests.get(
                    request_url,
                    headers=headers,
                    timeout=timeout,
                    allow_redirects=False,
                    stream=True,
                    proxies=_rss_http_proxies(),
                )

                if resp.status_code in {301, 302, 303, 307, 308}:
                    loc = (resp.headers.get("Location") or "").strip()
                    if not loc:
                        raise ValueError("Redirect without location")
                    redirects += 1
                    if redirects > 5:
                        raise ValueError("Too many redirects")
                    current_url = urljoin(current_url, loc)
                    continue

                if resp.status_code == 304:
                    cached_any = rss_proxy_cache_get_any_ttl(url, ttl=10**9)
                    if cached_any is not None:
                        cached_any = dict(cached_any)
                        cached_any["etag"] = (resp.headers.get("ETag") or cur_etag or "").strip()
                        cached_any["last_modified"] = (
                            resp.headers.get("Last-Modified") or cur_lm or ""
                        ).strip()
                        cache.set(key, cached_any)
                        return cached_any
                    cur_etag = ""
                    cur_lm = ""
                    continue

                if resp.status_code == 429:
                    logger.warning(
                        "RSS upstream may be blocked or rate limited (status=429). 可能触发了反爬或访问频率限制. url=%s",
                        current_url,
                    )
                    ra = (resp.headers.get("Retry-After") or "").strip()
                    try:
                        retry_after_s = int(ra)
                    except Exception:
                        retry_after_s = None
                    raise ValueError("Upstream rate limited")

                if resp.status_code == 403:
                    logger.warning(
                        "RSS upstream may be blocked or rate limited (status=403). 可能触发了反爬或访问频率限制. url=%s",
                        current_url,
                    )

                if resp.status_code >= 500:
                    if resp.status_code == 503:
                        logger.warning(
                            "RSS upstream may be blocked or rate limited (status=503). 可能触发了反爬或访问频率限制. url=%s",
                            current_url,
                        )
                    raise ValueError(f"Upstream error: {resp.status_code}")

                if resp.status_code >= 400:
                    raise ValueError(f"Upstream error: {resp.status_code}")

                content_type = (resp.headers.get("Content-Type") or "").split(";", 1)[0].strip()
                max_bytes = _rss_http_max_bytes()
                try:
                    resp.raw.decode_content = True
                except Exception:
                    pass
                data = resp.raw.read(max_bytes + 1)
                if len(data) > max_bytes:
                    raise ValueError("Response too large")

                stripped = data.lstrip()
                if stripped.startswith(b"<"):
                    head = stripped[:512].lower()
                    is_html = (b"<html" in head) or (b"<!doctype html" in head)
                    if is_html:
                        if scrape_rules:
                            try:
                                parsed = parse_html_content(data, scrape_rules)
                                result = {
                                    "url": url,
                                    "final_url": current_url,
                                    "content_type": content_type,
                                    "data": parsed,
                                    "etag": (resp.headers.get("ETag") or "").strip(),
                                    "last_modified": (resp.headers.get("Last-Modified") or "").strip(),
                                }
                                cache.set(key, result)
                                return result
                            except Exception as e:
                                pass
                        
                        snippet = stripped[:240].decode("utf-8", errors="replace")
                        raise ValueError(f"Upstream returned HTML, not a feed: {snippet[:240]}")

                try:
                    parsed = parse_feed_content(content_type, data)
                except Exception as e:
                    if stripped[:2] == b"\x1f\x8b":
                        raise ValueError(
                            "Upstream returned gzip-compressed bytes that could not be decoded"
                        ) from e
                    raise

                result = {
                    "url": url,
                    "final_url": current_url,
                    "content_type": content_type,
                    "data": parsed,
                    "etag": (resp.headers.get("ETag") or "").strip(),
                    "last_modified": (resp.headers.get("Last-Modified") or "").strip(),
                }
                cache.set(key, result)
                return result
            except (requests.Timeout, requests.ConnectionError) as e:
                attempts += 1
                if attempts >= 3:
                    raise ValueError("Upstream timeout") from e
                time.sleep(min(4.0, 0.5 * (2 ** (attempts - 1))))
                continue
            except ValueError as e:
                msg = str(e)
                retryable = (
                    ("rate limited" in msg.lower())
                    or ("upstream error: 5" in msg.lower())
                    or ("upstream timeout" in msg.lower())
                )
                if retryable:
                    attempts += 1
                    if attempts >= 3:
                        raise
                    if retry_after_s is not None and retry_after_s > 0:
                        time.sleep(min(6.0, float(retry_after_s)))
                    else:
                        time.sleep(min(4.0, 0.5 * (2 ** (attempts - 1))))
                    continue
                raise
            finally:
                try:
                    if resp is not None:
                        resp.close()
                except Exception:
                    pass
    finally:
        try:
            sem.release()
        except Exception:
            pass


@router.get("/api/proxy/fetch")
async def api_proxy_fetch(request: Request, url: str = Query(...)):
    allowed = None
    fn = getattr(request.app.state, "db_find_enabled_source_by_url", None)
    if callable(fn):
        allowed = fn(url)
    if allowed is None:
        ra = getattr(request.app.state, "require_admin", None)
        if callable(ra):
            ra(request)

    try:
        result = await asyncio.to_thread(rss_proxy_fetch_cached, url)
        return UnicodeJSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=400)


async def rss_proxy_fetch_warmup_async(
    url: str,
    etag: str = "",
    last_modified: str = "",
    scrape_rules: str = "",
    use_scraperapi: bool = False,
) -> Dict[str, Any]:
    """Async version of rss_proxy_fetch_warmup using aiohttp."""
    # Note: Cache operations are currently sync, but they are fast enough for now.
    # We mainly want to unblock the network I/O.
    cache = get_cache()
    key = f"rssproxy:{_md5_hex(url)}"

    parsed0 = urlparse(url)
    host0 = (parsed0.hostname or "").strip().lower()

    sem = await get_rss_host_async_semaphore(host0)
    await sem.acquire()
    try:
        current_url = url
        redirects = 0
        attempts = 0
        cur_etag = (etag or "").strip()
        cur_lm = (last_modified or "").strip()
        
        while True:
            # CPU-bound URL validation
            try:
                current_url = validate_http_url(current_url, check_resolve=not use_scraperapi)
            except Exception:
                raise

            headers = _rss_default_headers()
            if cur_etag:
                headers["If-None-Match"] = cur_etag
            if cur_lm:
                headers["If-Modified-Since"] = cur_lm

            retry_after_s = None
            
            # Determine timeout
            connect_timeout = 15.0
            read_timeout = 30.0
            total_timeout = 45.0
            try:
                t_val = _rss_http_timeouts()
                if isinstance(t_val, tuple):
                    connect_timeout, read_timeout = t_val
                    total_timeout = connect_timeout + read_timeout
                else:
                    total_timeout = float(t_val)
                    connect_timeout = min(15.0, total_timeout)
                    read_timeout = total_timeout
            except Exception:
                pass
            
            timeout = aiohttp.ClientTimeout(
                total=total_timeout,
                connect=connect_timeout,
                sock_read=read_timeout
            )
            
            # Prepare URL
            request_url = current_url
            if use_scraperapi:
                scraper_api_key = os.environ.get("SCRAPERAPI_KEY", "").strip()
                if scraper_api_key:
                    request_url = f"http://api.scraperapi.com?api_key={scraper_api_key}&url={current_url}"
                    logger.info(f"Using ScraperAPI for RSS feed (async): {current_url}")

            proxy = None
            proxies = _rss_http_proxies()
            if proxies:
                scheme = urlparse(request_url).scheme
                proxy = proxies.get(scheme) or proxies.get("http")

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        request_url,
                        headers=headers,
                        timeout=timeout,
                        allow_redirects=False,
                        proxy=proxy
                    ) as resp:
                        
                        # Handle Redirects
                        if resp.status in {301, 302, 303, 307, 308}:
                            loc = (resp.headers.get("Location") or "").strip()
                            if not loc:
                                raise ValueError("Redirect without location")
                            redirects += 1
                            if redirects > 5:
                                raise ValueError("Too many redirects")
                            current_url = urljoin(current_url, loc)
                            continue

                        # Handle 304 Not Modified
                        if resp.status == 304:
                            cached_any = rss_proxy_cache_get_any_ttl(url, ttl=10**9)
                            if cached_any is not None:
                                cached_any = dict(cached_any)
                                cached_any["etag"] = (resp.headers.get("ETag") or cur_etag or "").strip()
                                cached_any["last_modified"] = (
                                    resp.headers.get("Last-Modified") or cur_lm or ""
                                ).strip()
                                cache.set(key, cached_any)
                                return cached_any
                            cur_etag = ""
                            cur_lm = ""
                            continue

                        # Handle Rate Limits
                        if resp.status == 429:
                            logger.warning("RSS upstream 429. url=%s", current_url)
                            ra = (resp.headers.get("Retry-After") or "").strip()
                            try:
                                retry_after_s = int(ra)
                            except Exception:
                                retry_after_s = None
                            raise ValueError("Upstream rate limited")
                        
                        if resp.status == 403:
                            logger.warning("RSS upstream 403. url=%s", current_url)

                        if resp.status >= 500:
                            if resp.status == 503:
                                logger.warning("RSS upstream 503. url=%s", current_url)
                            raise ValueError(f"Upstream error: {resp.status}")

                        if resp.status >= 400:
                            raise ValueError(f"Upstream error: {resp.status}")

                        # Read Content
                        content_type = (resp.headers.get("Content-Type") or "").split(";", 1)[0].strip()
                        max_bytes = _rss_http_max_bytes()
                        
                        try:
                            # Use aiohttp's default read which reads full body
                            data = await resp.read()
                        except Exception as e:
                            raise ValueError(f"Read error: {e}")

                        if len(data) > max_bytes:
                             pass 
                             
                        if len(data) > max_bytes:
                             data = data[:max_bytes]

                        stripped = data.lstrip()
                        if stripped.startswith(b"<"):
                            head = stripped[:512].lower()
                            is_html = (b"<html" in head) or (b"<!doctype html" in head)
                            if is_html:
                                if scrape_rules:
                                    try:
                                        parsed = await asyncio.to_thread(parse_html_content, data, scrape_rules)
                                        result = {
                                            "url": url,
                                            "final_url": current_url,
                                            "content_type": content_type,
                                            "data": parsed,
                                            "etag": (resp.headers.get("ETag") or "").strip(),
                                            "last_modified": (resp.headers.get("Last-Modified") or "").strip(),
                                        }
                                        cache.set(key, result)
                                        return result
                                    except Exception:
                                        pass
                                
                                snippet = stripped[:240].decode("utf-8", errors="replace")
                                raise ValueError(f"Upstream returned HTML, not a feed: {snippet[:240]}")

                        try:
                            # Feed parsing is CPU bound, offload to thread with timeout to prevent hangs
                            parsed = await asyncio.wait_for(
                                asyncio.to_thread(parse_feed_content, content_type, data),
                                timeout=20.0
                            )
                        except asyncio.TimeoutError:
                            raise ValueError("Feed parsing timeout")
                        except Exception as e:
                            if stripped[:2] == b"\x1f\x8b":
                                raise ValueError("Upstream returned gzip-compressed bytes") from e
                            raise ValueError(f"Feed parse error: {e}") from e

                        result = {
                            "url": url,
                            "final_url": current_url,
                            "content_type": content_type,
                            "data": parsed,
                            "etag": (resp.headers.get("ETag") or "").strip(),
                            "last_modified": (resp.headers.get("Last-Modified") or "").strip(),
                        }
                        cache.set(key, result)
                        return result
            
            except (asyncio.TimeoutError, aiohttp.ClientError, socket.gaierror) as e:
                attempts += 1
                if attempts >= 3:
                    raise ValueError(f"Upstream timeout/error: {e}") from e
                
                sleep_s = min(4.0, 0.5 * (2 ** (attempts - 1)))
                await asyncio.sleep(sleep_s)
                continue
                
            except ValueError as e:
                msg = str(e)
                retryable = (
                    ("rate limited" in msg.lower())
                    or ("upstream error: 5" in msg.lower())
                    or ("upstream timeout" in msg.lower())
                )
                if retryable:
                    attempts += 1
                    if attempts >= 3:
                        raise
                    
                    sleep_s = min(4.0, 0.5 * (2 ** (attempts - 1)))
                    if retry_after_s is not None and retry_after_s > 0:
                        sleep_s = min(6.0, float(retry_after_s))
                    
                    await asyncio.sleep(sleep_s)
                    continue
                raise

    finally:
        sem.release()


@router.get("/api/rss-sources/explore-cards")
async def api_rss_sources_explore_cards(
    request: Request,
    cards: int = Query(4, ge=1, le=10),
    entries_per_card: int = Query(20, ge=1, le=50),
    exclude_source_ids: str = Query(""),
):
    try:
        init_fn = getattr(request.app.state, "init_default_rss_sources_if_empty", None)
        if callable(init_fn):
            init_fn()

        exclude = set(_parse_exclude_source_ids(exclude_source_ids))

        uid = _resolve_anon_user_id_from_request(request)
        if uid:
            try:
                subs = list_rss_subscriptions(conn=get_user_db_conn(project_root=request.app.state.project_root), user_id=uid)
                for s in subs:
                    sid = str((s or {}).get("source_id") or "").strip()
                    if sid:
                        exclude.add(sid)
            except Exception:
                pass

        conn = get_online_db_conn(project_root=request.app.state.project_root)

        where = ["s.enabled = 1"]
        args: List[Any] = []
        if exclude:
            placeholders = ",".join(["?"] * len(exclude))
            where.append(f"s.id NOT IN ({placeholders})")
            args.extend(list(exclude))
        where_sql = " AND ".join(where)

        limit_cards = max(1, int(cards))
        limit_entries = max(1, int(entries_per_card))

        cur = conn.execute(
            f"""
            SELECT s.id, s.name, s.url, s.updated_at,
                   MAX(CASE WHEN e.published_at > 0 THEN e.published_at ELSE e.created_at END) AS last_ts
            FROM rss_sources s
            JOIN rss_entries e ON e.source_id = s.id
            WHERE {where_sql}
            GROUP BY s.id
            ORDER BY last_ts DESC, s.updated_at DESC
            LIMIT ?
            """,
            tuple(args + [limit_cards * 8]),
        )
        src_rows = cur.fetchall() or []

        cards_out: List[Dict[str, Any]] = []
        for r in src_rows:
            if len(cards_out) >= limit_cards:
                break
            sid = str(r[0] or "").strip()
            if not sid:
                continue
            name = str(r[1] or "").strip() or sid
            url = str(r[2] or "").strip()

            try:
                cur2 = conn.execute(
                    """
                    SELECT title, url, published_at, created_at
                    FROM rss_entries
                    WHERE source_id = ?
                    ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC, id DESC
                    LIMIT ?
                    """,
                    (sid, limit_entries),
                )
                entry_rows = cur2.fetchall() or []
            except Exception:
                entry_rows = []

            entries: List[Dict[str, Any]] = []
            for er in entry_rows:
                title = str(er[0] or "").strip()
                link = str(er[1] or "").strip()
                if not link:
                    continue
                if not title:
                    title = link
                published_at = int(er[2] or 0)
                created_at = int(er[3] or 0)
                ts = published_at if published_at > 0 else created_at
                entries.append({"title": title, "link": link, "ts": ts})

            if not entries:
                continue

            cards_out.append(
                {
                    "source_id": sid,
                    "url": url,
                    "platform_name": name,
                    "feed_title": name,
                    "entries_count": len(entries),
                    "entries": entries,
                }
            )

        return UnicodeJSONResponse(
            content={
                "cards": cards_out,
                "cards_requested": limit_cards,
                "cards_returned": len(cards_out),
                "incomplete": len(cards_out) < limit_cards,
            }
        )
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=500)


@router.get("/api/rss-sources")
async def api_rss_sources(request: Request):
    try:
        init_fn = getattr(request.app.state, "init_default_rss_sources_if_empty", None)
        if callable(init_fn):
            init_fn()
        list_fn = getattr(request.app.state, "db_list_rss_sources", None)
        items = list_fn(enabled_only=True) if callable(list_fn) else []
        return UnicodeJSONResponse(content={"sources": items})
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=500)


@router.get("/api/rss-source-categories")
async def api_rss_source_categories(request: Request):
    try:
        init_fn = getattr(request.app.state, "init_default_rss_sources_if_empty", None)
        if callable(init_fn):
            init_fn()
        conn = get_online_db_conn(project_root=request.app.state.project_root)
        cur = conn.execute(
            "SELECT category, COUNT(*) FROM rss_sources WHERE enabled = 1 GROUP BY category ORDER BY COUNT(*) DESC"
        )
        rows = cur.fetchall() or []
        items = []
        total = 0
        for r in rows:
            cat = str(r[0] or "").strip()
            cnt = int(r[1] or 0)
            total += cnt
            if cat:
                items.append({"id": cat, "name": cat, "count": cnt})
        items.insert(0, {"id": "", "name": "全部", "count": total})
        return UnicodeJSONResponse(content={"categories": items})
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=500)


@router.get("/api/rss-sources/search")
async def api_rss_sources_search(
    request: Request,
    q: str = Query(""),
    category: str = Query(""),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=100000),
):
    try:
        init_fn = getattr(request.app.state, "init_default_rss_sources_if_empty", None)
        if callable(init_fn):
            init_fn()
        conn = get_online_db_conn(project_root=request.app.state.project_root)
        qv = (q or "").strip()
        cat = (category or "").strip()

        where = ["enabled = 1"]
        args: List[Any] = []
        if cat:
            where.append("category = ?")
            args.append(cat)
        if qv:
            where.append("(name LIKE ? OR url LIKE ? OR host LIKE ?)")
            like = f"%{qv}%"
            args.extend([like, like, like])

        where_sql = " AND ".join(where)
        cur = conn.execute(f"SELECT COUNT(*) FROM rss_sources WHERE {where_sql}", tuple(args))
        row = cur.fetchone()
        total = int(row[0] if row else 0)

        args2 = list(args)
        args2.extend([int(limit), int(offset)])
        cur = conn.execute(
            f"SELECT id, name, url, host, category, feed_type, country, language, source, seed_last_updated, enabled, created_at, updated_at, added_at FROM rss_sources WHERE {where_sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            tuple(args2),
        )
        rows = cur.fetchall() or []
        row_to = getattr(request.app.state, "row_to_rss_source", None)
        if callable(row_to):
            sources = [row_to(r) for r in rows]
        else:
            sources = []
        next_offset = offset + len(sources)
        has_more = next_offset < total
        return UnicodeJSONResponse(
            content={
                "sources": sources,
                "total": total,
                "limit": limit,
                "offset": offset,
                "next_offset": next_offset if has_more else None,
            }
        )
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=500)


@router.get("/api/rss-sources/preview")
async def api_rss_sources_preview(request: Request, source_id: str = Query(...)):
    get_fn = getattr(request.app.state, "db_get_rss_source", None)
    src = get_fn(source_id) if callable(get_fn) else None
    if not src or not src.get("enabled"):
        return JSONResponse(content={"detail": "Source not found"}, status_code=404)
    try:
        result = await asyncio.to_thread(rss_proxy_fetch_cached, src.get("url") or "")
        return UnicodeJSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=400)


@router.post("/api/rss-source-requests")
async def api_rss_source_requests(request: Request, body: Dict[str, Any] = Body(...)):
    url = (body.get("url") or "").strip() if isinstance(body, dict) else ""
    title = (body.get("title") or "").strip() if isinstance(body, dict) else ""
    note = (body.get("note") or "").strip() if isinstance(body, dict) else ""
    if not url:
        return JSONResponse(content={"detail": "Missing url"}, status_code=400)
    if not title:
        return JSONResponse(content={"detail": "Missing title"}, status_code=400)
    if not note:
        return JSONResponse(content={"detail": "Missing note"}, status_code=400)

    try:
        url = validate_http_url(url)
    except Exception as e:
        return JSONResponse(content={"detail": str(e)}, status_code=400)

    host = (urlparse(url).hostname or "").strip().lower() or "-"
    conn = get_online_db_conn(project_root=request.app.state.project_root)

    fn = getattr(request.app.state, "db_find_enabled_source_by_url", None)
    existing = fn(url) if callable(fn) else None
    if existing is not None:
        return UnicodeJSONResponse(content={"status": "approved", "source": existing})

    cur = conn.execute(
        "SELECT id, status, reason FROM rss_source_requests WHERE url = ? ORDER BY id DESC LIMIT 1",
        (url,),
    )
    row = cur.fetchone()
    if row and str(row[1] or "") in {"pending", "rejected"}:
        return UnicodeJSONResponse(
            content={
                "request_id": int(row[0]),
                "status": str(row[1]),
                "reason": str(row[2] or ""),
            }
        )

    now = _now_ts()
    cur = conn.execute(
        "INSERT INTO rss_source_requests(url, host, title, note, status, reason, created_at, reviewed_at, source_id) VALUES (?, ?, ?, ?, 'pending', '', ?, 0, '')",
        (url, host, title, note, now),
    )
    conn.commit()
    return UnicodeJSONResponse(content={"request_id": int(cur.lastrowid), "status": "pending"})
