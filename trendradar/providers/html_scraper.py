# coding=utf-8
"""
Lightweight HTML scraper using requests + BeautifulSoup.
No browser required - suitable for static HTML pages.
"""
import json
from datetime import datetime
from typing import List, Dict, Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from trendradar.storage.base import NewsItem
from trendradar.providers.base import ProviderFetchContext, ProviderFetchResult


class HtmlScraperProvider:
    """
    Lightweight HTML scraper using requests + BeautifulSoup.
    Config JSON example:
    {
      "url": "https://example.com/news",
      "scrape_rules": {
         "items": ".news-item",
         "title": "h2.title",
         "link": "a.link",
         "date": "span.date"
      },
      "headers": {
         "User-Agent": "Mozilla/5.0 ..."
      }
    }
    """
    
    @property
    def provider_id(self) -> str:
        return "html_scraper"

    def fetch(
        self,
        *,
        ctx: ProviderFetchContext,
        platform_id: str,
        platform_name: str,
        platform_config: Dict[str, Any],
    ) -> ProviderFetchResult:
        """Fetch news items from HTML page using CSS selectors."""
        
        url = platform_config.get("url")
        if not url:
            raise ValueError("URL is required in config")

        rules = platform_config.get("scrape_rules", {})
        headers = platform_config.get("headers", {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        timeout = platform_config.get("timeout", 30)

        # Fetch the page
        # Some sites have bad SSL certs, so we disable verification by default for scraper
        # In production this should be configurable, but for scraper it's usually fine
        verify_ssl = platform_config.get("verify_ssl", False)
        resp = requests.get(url, headers=headers, timeout=timeout, verify=verify_ssl)
        resp.raise_for_status()
        
        # Handle encoding
        if resp.encoding is None or resp.encoding == 'ISO-8859-1':
            resp.encoding = resp.apparent_encoding
        
        # Parse HTML
        soup = BeautifulSoup(resp.text, "html.parser")
        
        items: List[NewsItem] = []
        
        # Get item selector
        item_selector = rules.get("items")
        if not item_selector:
            return ProviderFetchResult(
                platform_id=platform_id,
                platform_name=platform_name,
                provider=self.provider_id,
                items=[],
                metric={"error": "No items selector provided"}
            )

        # Select all items
        elements = soup.select(item_selector)
        
        crawl_time = ctx.now.strftime("%H:%M")
        
        for idx, el in enumerate(elements, start=1):
            title_sel = rules.get("title")
            link_sel = rules.get("link")
            date_sel = rules.get("date")
            content_sel = rules.get("content")
            
            title = ""
            link = ""
            date_str = ""
            content = ""
            
            # Extract title
            if title_sel:
                t_el = el.select_one(title_sel)
                if t_el:
                    title = t_el.get_text(strip=True)
            else:
                # If element is an <a> tag, use its text
                if el.name == "a":
                    title = el.get_text(strip=True)
            
            # Extract link
            if link_sel:
                l_el = el.select_one(link_sel)
                if l_el:
                    link = l_el.get("href", "")
            else:
                # Fallback: if element is A
                if el.name == "a":
                    link = el.get("href", "")

            # Extract date
            if date_sel:
                d_el = el.select_one(date_sel)
                if d_el:
                    date_str = d_el.get_text(strip=True)
                    if not date_str:
                        date_str = d_el.get("datetime", "")

            # Extract content
            if content_sel:
                c_el = el.select_one(content_sel)
                if c_el:
                    content = c_el.get_text(strip=True)

            if not title or not link:
                continue
                
            # Normalize link to absolute URL
            if link and not link.startswith("http"):
                link = urljoin(url, link)

            items.append(NewsItem(
                title=title,
                url=link,
                source_id=platform_id,
                source_name=platform_name,
                rank=idx,
                crawl_time=crawl_time,
                first_time=crawl_time,
                last_time=crawl_time,
            ))
        
        return ProviderFetchResult(
            platform_id=platform_id,
            platform_name=platform_name,
            provider=self.provider_id,
            items=items,
            metric={
                "items_count": len(items),
                "url": url,
            }
        )
