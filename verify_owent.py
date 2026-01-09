import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        try:
            print("Navigating to https://owent.net/index.html ...")
            await page.goto("https://owent.net/index.html")
            
            # Strategies from custom_source_admin.py to test
            strategies = [
                # 1. Semantic Article
                {"items": "article", "title": "h2, h3, h1, a", "link": "a", "date": "time, .date, .published", "content": ".entry-content, .post-content, .article-content, .content"},
                 # 5. Fallback (The original broad one)
                {"items": "article, .post, .item, tr, div.item", "title": "h1, h2, h3, .title, a", "link": "a", "date": "time, .date", "content": ""}
            ]

            for i, rules in enumerate(strategies):
                print(f"Testing Strategy {i+1}: {rules}")
                item_selector = rules["items"]
                elements = await page.query_selector_all(item_selector)
                print(f"  Found {len(elements)} items")
                
                if len(elements) == 0:
                    continue

                for j, el in enumerate(elements[:3]): # Check first 3
                    title = ""
                    link = ""
                    date_str = ""
                    content = ""
                    
                    title_sel = rules.get("title")
                    if title_sel:
                        t_el = await el.query_selector(title_sel)
                        if t_el:
                            title = (await t_el.inner_text()).strip()
                    
                    link_sel = rules.get("link")
                    if link_sel:
                        l_el = await el.query_selector(link_sel)
                        if l_el:
                            link = await l_el.get_attribute("href")
                            
                    date_sel = rules.get("date")
                    if date_sel:
                         d_el = await el.query_selector(date_sel)
                         if d_el:
                             date_str = (await d_el.inner_text()).strip()
                             if not date_str:
                                 date_str = (await d_el.get_attribute("datetime")) or ""

                    content_sel = rules.get("content")
                    if content_sel:
                        c_el = await el.query_selector(content_sel)
                        if c_el:
                            content = (await c_el.inner_text()).strip()
                            
                    print(f"    Item {j+1}:")
                    print(f"      Title: {title}")
                    print(f"      Link:  {link}")
                    print(f"      Date:  {date_str}")
                    print(f"      Content: {content[:50]}...")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
