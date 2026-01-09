import asyncio
import json
from datetime import datetime
from typing import List, Dict, Any

from trendradar.storage.base import NewsItem
from trendradar.providers.base import BaseProvider

class PlaywrightProvider(BaseProvider):
    """
    Generic provider that uses Playwright to scrape pages based on CSS selectors.
    Config JSON example:
    {
      "url": "https://example.com/news",
      "wait_until": "networkidle",
      "scrape_rules": {
         "items": ".news-item",
         "title": "h2.title",
         "link": "a.link",
         "date": "span.date"
      }
    }
    """
    
    @property
    def provider_id(self) -> str:
        return "playwright"

    async def fetch(self, config: Dict[str, Any]) -> List[NewsItem]:
        url = config.get("url")
        if not url:
            raise ValueError("URL is required in config")

        wait_until = config.get("wait_until", "domcontentloaded")
        rules = config.get("scrape_rules", {})
        
        # We need async_playwright
        from playwright.async_api import async_playwright

        items = []
        
        async with async_playwright() as p:
            # Launch browser (headless by default)
            browser = await p.chromium.launch()
            try:
                page = await browser.new_page()
                
                # Go to URL
                await page.goto(url, wait_until=wait_until, timeout=30000)
                
                # Get item selector
                item_selector = rules.get("items")
                if not item_selector:
                    # If no item selector, maybe just dump the whole page? 
                    # For now assume item selector is required for list.
                    return []

                # Select all items
                elements = await page.query_selector_all(item_selector)
                
                for el in elements:
                    # Extract fields
                    title_sel = rules.get("title")
                    link_sel = rules.get("link")
                    date_sel = rules.get("date")
                    content_sel = rules.get("content")
                    
                    title = ""
                    link = ""
                    date_str = ""
                    content = ""
                    
                    if title_sel:
                        t_el = await el.query_selector(title_sel)
                        if t_el:
                            title = (await t_el.inner_text()).strip()
                    else:
                        # Try to get text from the element itself if no title selector?
                        # Or maybe the element IS the link/title
                        if await el.evaluate("el => el.tagName") == "A":
                             title = (await el.inner_text()).strip()
                    
                    if link_sel:
                        l_el = await el.query_selector(link_sel)
                        if l_el:
                            link = await l_el.get_attribute("href")
                    else:
                        # Fallback: if element is A
                        if await el.evaluate("el => el.tagName") == "A":
                            link = await el.get_attribute("href")

                    if date_sel:
                        d_el = await el.query_selector(date_sel)
                        if d_el:
                            date_str = (await d_el.inner_text()).strip()
                            # Optional: try attribute datetime
                            if not date_str:
                                date_str = (await d_el.get_attribute("datetime")) or ""

                    if content_sel:
                        c_el = await el.query_selector(content_sel)
                        if c_el:
                            content = (await c_el.inner_text()).strip()

                    if not title or not link:
                        continue
                        
                    # Normalize link
                    if link and not link.startswith("http"):
                        from urllib.parse import urljoin
                        link = urljoin(url, link)

                    items.append(NewsItem(
                        title=title,
                        url=link,
                        source="custom_playwright",
                        category=config.get("category", "News"),
                        crawl_time=datetime.now().isoformat(), # Default to now
                        content=content, 
                        # We might want to parse date_str to crawl_time or a new field published_at
                        # For now, sticking to NewsItem schema which uses crawl_time for display mostly.
                        # If date_str is available, we could append it to title or use it if format allows.
                         # Let's try to put it in first_time if possible or just log it.
                         # Actually NewsItem doesn't have published_at. 
                         # We can put it in title prefix or just content.
                         # But wait, we added 'content' field.
                    ))
                    
            finally:
                await browser.close()
                
        return items
