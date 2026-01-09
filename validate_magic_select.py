import asyncio
from playwright.async_api import async_playwright
import json

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch() 
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"[Browser Console] {msg.text}"))
        
        # Use localhost and port 8090 as identified
        token = "c7c8b6c9c1c8d1a7f9e3b2a4d6f0c1e88a9f2d7b4c0e1a6d3b9c7e2f1a0d4b8"
        url = f"http://localhost:8090/admin/rss-sources?token={token}"
        print(f"[Test] Navigating to {url}")
        try:
            await page.goto(url)
        except Exception as e:
            print(f"[Error] Failed to load page: {e}")
            return
        
        # 1. Click HTML tab
        # Find button with text '🌐 HTML 源' or data-tab="custom-html"
        await page.click('button[data-tab="custom-html"]')
        print("[Test] Clicked HTML tab")
        
        # 2. Click Add HTML Source
        await page.click('text="➕ 添加 HTML 源"')
        print("[Test] Clicked Add HTML Source")
        
        # Wait for modal animation
        await page.wait_for_timeout(500)
        
        # 3. Enter URL in the Magic Get/Select section
        test_url = "https://owent.net/index.html"
        await page.fill('#edit-custom-magic-url', test_url)
        print(f"[Test] Filled URL: {test_url}")
        
        # 4. Click Magic Select
        await page.click('#btn-custom-magic-select')
        print("[Test] Clicked Magic Select button")
        
        # 5. Wait for visual selector modal to appear
        await page.wait_for_selector('#visual-selector-modal', state='visible')
        print("[Test] Visual Selector Modal is visible")
        
        # 6. Simulate manually typing selectors (simulating user interaction)
        # We don't need to interact with iframe for this test, just verify the form->json flow
        await page.fill('#vs-item-sel', '.TEST_ITEM')
        await page.fill('#vs-title-sel', '.TEST_TITLE')
        await page.fill('#vs-link-sel', '.TEST_LINK')
        await page.fill('#vs-date-sel', '.TEST_DATE')
        print("[Test] Filled visual selector inputs")

        # Debug: Check currentEditTab
        current_tab = await page.evaluate("window.currentEditTab")
        print(f"[Test] window.currentEditTab = {current_tab}")
        
        # 7. Click Apply Rules
        await page.click('button:has-text("Apply Rules")')
        print("[Test] Clicked Apply Rules")
        
        # Check for toasts
        try:
             toast = await page.wait_for_selector('.toast', state='visible', timeout=2000)
             if toast:
                 text = await toast.inner_text()
                 print(f"[Test] Toast appeared: {text}")
        except:
             print("[Test] No toast appeared immediately")
        try:
            await page.wait_for_selector('#visual-selector-modal', state='hidden', timeout=2000)
            print("[Test] Visual Selector Modal closed")
        except:
             print("[Warning] Visual Modal did not close immediately")

        # 9. Verify Config JSON content
        config_val = await page.input_value('#edit-custom-config')
        print(f"[Test] Config JSON content:\n{config_val}")
        
        try:
            config = json.loads(config_val)
            rules = config.get("scrape_rules", {})
            if (rules.get("items") == ".TEST_ITEM" and 
                rules.get("title") == ".TEST_TITLE" and 
                rules.get("link") == ".TEST_LINK"):
                print("SUCCESS: Config JSON updated correctly with visual rules!")
            else:
                print("FAILURE: Config JSON does not match expected rules.")
                print(f"Expected: items=.TEST_ITEM, title=.TEST_TITLE, link=.TEST_LINK")
                print(f"Actual: {rules}")
        except Exception as e:
            print(f"FAILURE: Invalid JSON in config field: {e}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
