from __future__ import annotations

import hashlib
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests

from trendradar.storage.base import NewsItem

from .base import ProviderFetchContext, ProviderFetchError, ProviderFetchResult


class _AnchorParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._current_href: Optional[str] = None
        self._current_text_parts: List[str] = []
        self.links: List[Tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]):
        if tag.lower() != "a":
            return
        href = None
        for k, v in attrs:
            if k.lower() == "href" and v:
                href = v
                break
        if href:
            self._current_href = href
            self._current_text_parts = []

    def handle_data(self, data: str):
        if self._current_href is None:
            return
        s = (data or "").strip()
        if not s:
            return
        self._current_text_parts.append(s)

    def handle_endtag(self, tag: str):
        if tag.lower() != "a":
            return
        if self._current_href is None:
            return
        text = " ".join(self._current_text_parts).strip()
        href = self._current_href
        self._current_href = None
        self._current_text_parts = []
        if href and text:
            self.links.append((href, text))


def _is_http_url(url: str) -> bool:
    try:
        u = urlparse(url)
        return u.scheme in ("http", "https")
    except Exception:
        return False


def _extract_caixin_date_from_url(url: str) -> str:
    try:
        u = urlparse(url)
        path = u.path or ""
    except Exception:
        path = ""

    m = _CAIXIN_DATE_IN_URL_RE.search(path)
    if not m:
        return ""
    return m.group(1)


_CAIXIN_ARTICLE_PATH_RE = re.compile(r"/\d{4}-\d{2}-\d{2}/\d+\.html$")
_CAIXIN_DATE_IN_URL_RE = re.compile(r"/(\d{4}-\d{2}-\d{2})/")


def _looks_like_caixin_article_url(url: str) -> bool:
    if not _is_http_url(url):
        return False
    try:
        u = urlparse(url)
    except Exception:
        return False

    host = (u.netloc or "").lower()
    if not host.endswith("caixin.com"):
        return False

    path = u.path or ""
    if _CAIXIN_ARTICLE_PATH_RE.search(path):
        return True
    if "/" in path and path.endswith(".html") and re.search(r"/\d{4}-\d{2}-\d{2}/", path):
        return True
    return False


def _stable_key(title: str, url: str) -> str:
    raw = f"{title}\n{url}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


@dataclass(frozen=True)
class CaixinProvider:
    provider_id: str = "caixin"

    def fetch(
        self,
        *,
        ctx: ProviderFetchContext,
        platform_id: str,
        platform_name: str,
        platform_config: Dict[str, Any],
    ) -> ProviderFetchResult:
        started_at = time.time()
        timeout_s = int(platform_config.get("timeout_s") or 12)
        max_items = int(platform_config.get("max_items") or 30)
        user_agent = str(platform_config.get("user_agent") or "Mozilla/5.0")
        article_url_only = bool(platform_config.get("article_url_only", True))

        rss_urls = platform_config.get("rss_urls")
        if not isinstance(rss_urls, list):
            rss_urls = []
        html_urls = platform_config.get("html_urls")
        if not isinstance(html_urls, list):
            html_urls = []

        session = requests.Session()
        headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        items: List[NewsItem] = []
        content_keys: List[str] = []

        err_msgs: List[str] = []

        def add_item(title: str, url: str) -> None:
            nonlocal items, content_keys
            title = (title or "").strip()
            url = (url or "").strip()
            if not title or not url:
                return
            if not _is_http_url(url):
                return
            if article_url_only and not _looks_like_caixin_article_url(url):
                return

            date_prefix = _extract_caixin_date_from_url(url)
            if date_prefix:
                title = f"[{date_prefix}] {title}"
            key = _stable_key(title, url)
            if key in content_keys:
                return
            content_keys.append(key)
            rank = len(items) + 1
            items.append(
                NewsItem(
                    title=title,
                    source_id=platform_id,
                    source_name=platform_name,
                    rank=rank,
                    url=url,
                    mobile_url="",
                    crawl_time=ctx.now.strftime("%H:%M"),
                )
            )

        # 1) RSS-first
        for u in rss_urls:
            if len(items) >= max_items:
                break
            url = str(u or "").strip()
            if not url:
                continue
            try:
                resp = session.get(url, headers=headers, timeout=timeout_s, allow_redirects=True)
                resp.raise_for_status()
                # best effort: parse as RSS/Atom xml
                xml_bytes = resp.content
                root = ET.fromstring(xml_bytes)
                # RSS: channel/item ; Atom: entry
                for it in root.findall(".//item"):
                    if len(items) >= max_items:
                        break
                    title_el = it.find("title")
                    link_el = it.find("link")
                    title = unescape((title_el.text or "").strip()) if title_el is not None else ""
                    link = (link_el.text or "").strip() if link_el is not None else ""
                    add_item(title, link)

                for it in root.findall(".//{http://www.w3.org/2005/Atom}entry"):
                    if len(items) >= max_items:
                        break
                    title_el = it.find("{http://www.w3.org/2005/Atom}title")
                    link_el = it.find("{http://www.w3.org/2005/Atom}link")
                    title = unescape((title_el.text or "").strip()) if title_el is not None else ""
                    link = ""
                    if link_el is not None:
                        href = link_el.attrib.get("href")
                        if href:
                            link = href.strip()
                    add_item(title, link)
            except Exception as e:
                err_msgs.append(f"rss {url}: {e}")

        # 2) HTML fallback (list pages)
        for u in html_urls:
            if len(items) >= max_items:
                break
            url = str(u or "").strip()
            if not url:
                continue
            try:
                resp = session.get(url, headers=headers, timeout=timeout_s, allow_redirects=True)
                resp.raise_for_status()
                html = resp.text or ""
                parser = _AnchorParser()
                parser.feed(html)

                for href, text in parser.links:
                    if len(items) >= max_items:
                        break
                    full_url = urljoin(url, href)
                    title = unescape(re.sub(r"\s+", " ", text)).strip()
                    # heuristic: keep caixin links only
                    if "caixin.com" not in full_url:
                        continue
                    if article_url_only and not _looks_like_caixin_article_url(full_url):
                        continue
                    # heuristic: ignore navigation
                    if len(title) < 6:
                        continue
                    add_item(title, full_url)
            except Exception as e:
                err_msgs.append(f"html {url}: {e}")

        duration_ms = int((time.time() - started_at) * 1000)

        if not items:
            raise ProviderFetchError(
                "no items fetched",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=RuntimeError("; ".join(err_msgs)[:500] if err_msgs else "no sources configured"),
            )

        content_hash = hashlib.sha1("\n".join(content_keys).encode("utf-8")).hexdigest() if content_keys else ""

        metric = {
            "provider": self.provider_id,
            "platform_id": platform_id,
            "platform_name": platform_name,
            "status": "success",
            "duration_ms": duration_ms,
            "items_count": len(items),
            "error": "",
            "content_hash": content_hash,
        }

        return ProviderFetchResult(
            platform_id=platform_id,
            platform_name=platform_name,
            provider=self.provider_id,
            items=items,
            metric=metric,
        )
