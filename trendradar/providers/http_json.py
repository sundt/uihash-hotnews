from __future__ import annotations

import ipaddress
import socket
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests

from trendradar.storage.base import NewsItem

from .base import ProviderFetchContext, ProviderFetchError, ProviderFetchResult


def _now_ts() -> float:
    return time.time()


def _is_blocked_ip(ip: Any) -> bool:
    return bool(
        getattr(ip, "is_private", False)
        or getattr(ip, "is_loopback", False)
        or getattr(ip, "is_link_local", False)
        or getattr(ip, "is_multicast", False)
        or getattr(ip, "is_reserved", False)
        or getattr(ip, "is_unspecified", False)
    )


def _resolve_and_validate_host(host: str) -> None:
    h = (host or "").strip().lower()
    if not h:
        raise ValueError("Empty host")
    if h in {"localhost"}:
        raise ValueError("Blocked host")

    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        ip = None

    if ip is not None:
        if _is_blocked_ip(ip):
            raise ValueError("Blocked IP")
        return

    infos = socket.getaddrinfo(h, None)
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
        if _is_blocked_ip(ip_obj):
            raise ValueError("Blocked resolved IP")


def _validate_http_url(raw_url: str) -> str:
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
    _resolve_and_validate_host(parsed.hostname or "")
    return u


def _get_by_path(obj: Any, path: str) -> Any:
    if not path:
        return None
    cur = obj
    for part in str(path).split("."):
        if cur is None:
            return None
        part = part.strip()
        if part == "":
            continue
        if isinstance(cur, dict):
            cur = cur.get(part)
            continue
        if isinstance(cur, list):
            try:
                idx = int(part)
            except Exception:
                return None
            if idx < 0 or idx >= len(cur):
                return None
            cur = cur[idx]
            continue
        return None
    return cur


def _stringify(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (str, int, float, bool)):
        return str(v).strip()
    return str(v).strip()


_TIME_FORMATS: Tuple[str, ...] = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S%z",
)


def _parse_time_any(v: Any) -> Optional[datetime]:
    if v is None:
        return None

    # numeric timestamp
    if isinstance(v, (int, float)):
        n = int(v)
        if n <= 0:
            return None
        if n > 10**12:  # ms
            return datetime.fromtimestamp(n / 1000.0)
        if n > 10**10:  # sometimes ms-ish
            return datetime.fromtimestamp(n / 1000.0)
        return datetime.fromtimestamp(n)

    s = str(v).strip()
    if not s:
        return None

    if s.isdigit():
        try:
            n = int(s)
        except Exception:
            return None
        if n <= 0:
            return None
        if n > 10**12:
            return datetime.fromtimestamp(n / 1000.0)
        if n > 10**10:
            return datetime.fromtimestamp(n / 1000.0)
        return datetime.fromtimestamp(n)

    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            continue

    return None


_rate_state: Dict[str, float] = {}


def _rate_limit_sleep(key: str, rps: float) -> None:
    if not rps or rps <= 0:
        return
    k = str(key or "").strip() or "_"
    min_interval = 1.0 / float(rps)
    now = _now_ts()
    last = _rate_state.get(k, 0.0)
    delta = now - last
    if delta < min_interval:
        time.sleep(max(0.0, min_interval - delta))
    _rate_state[k] = _now_ts()


def _get_proxies(*, ctx: ProviderFetchContext, platform_config: Dict[str, Any]) -> Optional[Dict[str, str]]:
    proxy = platform_config.get("proxy")
    if isinstance(proxy, str) and proxy.strip():
        p = proxy.strip()
        return {"http": p, "https": p}

    use_proxy = bool(ctx.config.get("USE_PROXY", False))
    if not use_proxy:
        return None

    default_proxy = ctx.config.get("DEFAULT_PROXY")
    if not isinstance(default_proxy, str) or not default_proxy.strip():
        return None
    p = default_proxy.strip()
    return {"http": p, "https": p}


def _safe_request_json(
    *,
    url: str,
    method: str,
    params: Optional[Dict[str, Any]],
    headers: Optional[Dict[str, str]],
    timeout_s: int,
    proxies: Optional[Dict[str, str]],
    verify_ssl: bool,
    retries: int,
    max_redirects: int = 5,
) -> Tuple[Any, str]:
    current_url = url
    redirects = 0
    attempts = max(1, int(retries) + 1)
    last_err: Optional[BaseException] = None
    while True:
        current_url = _validate_http_url(current_url)

        try:
            resp = requests.request(
                method=method,
                url=current_url,
                params=params,
                headers=headers,
                timeout=timeout_s,
                allow_redirects=False,
                proxies=proxies,
                verify=verify_ssl,
            )
        except (requests.exceptions.SSLError, requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            last_err = e
            attempts -= 1
            if attempts <= 0:
                raise
            time.sleep(0.35)
            continue

        if resp.status_code in {301, 302, 303, 307, 308}:
            loc = (resp.headers.get("Location") or "").strip()
            resp.close()
            if not loc:
                raise ValueError("Redirect without location")
            redirects += 1
            if redirects > max_redirects:
                raise ValueError("Too many redirects")
            current_url = urljoin(current_url, loc)
            continue

        if resp.status_code >= 400:
            text = ""
            try:
                text = (resp.text or "")[:240]
            except Exception:
                text = ""
            resp.close()
            raise ValueError(f"Upstream error: {resp.status_code} {text}")

        try:
            payload = resp.json()
        finally:
            resp.close()

        return payload, current_url


@dataclass(frozen=True)
class HttpJsonProvider:
    provider_id: str = "http_json"

    def fetch(
        self,
        *,
        ctx: ProviderFetchContext,
        platform_id: str,
        platform_name: str,
        platform_config: Dict[str, Any],
    ) -> ProviderFetchResult:
        started_at = _now_ts()

        url = str(platform_config.get("url") or platform_config.get("base_url") or "").strip()
        if not url:
            raise ProviderFetchError(
                "missing url",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=ValueError("missing url"),
            )

        method = str(platform_config.get("method") or "GET").strip().upper()
        if method not in {"GET", "POST"}:
            raise ProviderFetchError(
                f"unsupported method: {method}",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=ValueError("unsupported method"),
            )

        params = platform_config.get("params")
        if not isinstance(params, dict):
            params = {}

        headers = platform_config.get("headers")
        if not isinstance(headers, dict):
            headers = {}
        clean_headers: Dict[str, str] = {}
        for k, v in headers.items():
            kk = str(k or "").strip()
            if not kk:
                continue
            if kk.lower() in {"host", "connection", "content-length"}:
                continue
            clean_headers[kk] = str(v or "").strip()

        timeout_s = int(platform_config.get("timeout_s") or platform_config.get("timeout") or 10)
        max_items = int(platform_config.get("max_items") or 50)
        verify_ssl = bool(platform_config.get("verify_ssl", True))
        retries = int(platform_config.get("retries") or 2)

        prefix_time = bool(platform_config.get("prefix_time", True))
        strip_title_bracket_prefix = bool(platform_config.get("strip_title_bracket_prefix", False))

        response_path = str(platform_config.get("response_path") or "").strip()
        if not response_path:
            raise ProviderFetchError(
                "missing response_path",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=ValueError("missing response_path"),
            )

        field_mapping = platform_config.get("field_mapping")
        if not isinstance(field_mapping, dict):
            field_mapping = {}

        # enforce simple rate limit
        rps = platform_config.get("rate_limit_rps")
        if rps is None:
            rps = platform_config.get("rate_limit")
        try:
            rps_f = float(rps) if rps is not None else 0.0
        except Exception:
            rps_f = 0.0

        # rate key: host + platform
        host = (urlparse(url).hostname or "").strip().lower() or "_"
        _rate_limit_sleep(f"{self.provider_id}:{host}:{platform_id}", rps_f)

        proxies = _get_proxies(ctx=ctx, platform_config=platform_config)

        try:
            payload, final_url = _safe_request_json(
                url=url,
                method=method,
                params=params,
                headers=clean_headers,
                timeout_s=timeout_s,
                proxies=proxies,
                verify_ssl=verify_ssl,
                retries=retries,
            )
        except Exception as e:
            raise ProviderFetchError(
                f"failed to fetch: {e}",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=e,
            )

        items_raw = _get_by_path(payload, response_path)
        if not isinstance(items_raw, list):
            raise ProviderFetchError(
                "response_path did not resolve to a list",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=TypeError("response_path not list"),
            )

        parsed_items: List[Tuple[Optional[datetime], NewsItem]] = []
        for it in items_raw:
            if not isinstance(it, dict):
                continue

            title_path = field_mapping.get("title") or field_mapping.get("content")
            url_path = field_mapping.get("url")
            time_path = field_mapping.get("time")
            source_path = field_mapping.get("source")
            summary_path = field_mapping.get("summary")
            tags_path = field_mapping.get("tags")

            title = _stringify(_get_by_path(it, str(title_path))) if title_path else ""
            link = _stringify(_get_by_path(it, str(url_path))) if url_path else ""

            content = ""
            # If content key is specified in field_mapping (field_mapping.get("content"))
            # But wait, original code was: title_path = field_mapping.get("title") or field_mapping.get("content")
            # This implies content was used as fallback for title?!
            # Let's separate them.
            
            # Re-read mapping logic:
            # title_path = field_mapping.get("title") or field_mapping.get("content")
            # If user mapped "content" -> "body", then title_path becomes "body" if "title" is missing.
            # We should probably respect explicit "content" mapping if we want to store content.
            
            content_path = field_mapping.get("content_text") # Use "content_text" to avoid conflict or just "content" if we change title logic

            # Let's check custom_source_admin.py or UI to see what keys are generated.
            # Usually it's "title", "link", "published_at". 
            # I will add "content" support.
            
            content_path = field_mapping.get("content")
            if content_path == title_path and field_mapping.get("title"):
                 # if content is mapped to same as title, maybe it's fine?
                 pass
            elif content_path:
                 content = _stringify(_get_by_path(it, str(content_path)))

            if strip_title_bracket_prefix:
                for _ in range(2):
                    s = (title or "").strip()
                    if not s.startswith("["):
                        break
                    end = s.find("]")
                    if end <= 0 or end > 160:
                        break
                    title = s[end + 1 :].strip()

            if not title:
                continue

            dt = _parse_time_any(_get_by_path(it, str(time_path))) if time_path else None
            src = _stringify(_get_by_path(it, str(source_path))) if source_path else ""
            summary = _stringify(_get_by_path(it, str(summary_path))) if summary_path else ""

            # If content is empty, use summary
            if not content and summary:
                content = summary

            tags_v = _get_by_path(it, str(tags_path)) if tags_path else None
            tags_s = ""
            if isinstance(tags_v, list):
                tags_s = ",".join([_stringify(x) for x in tags_v if _stringify(x)])
            else:
                tags_s = _stringify(tags_v)

            # Build a compact title/meta for display.
            meta_parts = []
            if prefix_time and dt is not None:
                meta_parts.append(dt.strftime("%m-%d %H:%M"))
            if src:
                meta_parts.append(src)
            if tags_s:
                meta_parts.append(tags_s)

            meta = " ".join([p for p in meta_parts if p])
            if summary and len(summary) <= 120:
                # keep it short
                meta = (meta + " " + summary).strip() if meta else summary

            # Put meta into title prefix when available so viewer can show something without extra fields.
            display_title = title
            if meta and not display_title.startswith("["):
                display_title = f"[{meta}] {display_title}".strip()

            parsed_items.append(
                (
                    dt,
                    NewsItem(
                        title=display_title,
                        source_id=platform_id,
                        source_name=platform_name,
                        rank=0,
                        url=link,
                        mobile_url="",
                        content=content,
                        crawl_time=ctx.now.strftime("%H:%M"),
                    ),
                )
            )

            if len(parsed_items) >= max_items:
                break

        if not parsed_items:
            raise ProviderFetchError(
                "no items fetched",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=RuntimeError("no items"),
            )

        # Sort by time desc (user confirmed). None times go last.
        parsed_items.sort(key=lambda x: x[0] or datetime.min, reverse=True)

        items: List[NewsItem] = []
        for idx, (_, it) in enumerate(parsed_items, start=1):
            it.rank = idx
            items.append(it)

        duration_ms = int((_now_ts() - started_at) * 1000)
        metric = {
            "provider": self.provider_id,
            "platform_id": platform_id,
            "platform_name": platform_name,
            "status": "success",
            "duration_ms": duration_ms,
            "items_count": len(items),
            "error": "",
            "final_url": final_url,
        }

        return ProviderFetchResult(
            platform_id=platform_id,
            platform_name=platform_name,
            provider=self.provider_id,
            items=items,
            metric=metric,
        )
