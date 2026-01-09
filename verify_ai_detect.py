import requests
import json
import os

TOKEN = "c7c8b6c9c1c8d1a7f9e3b2a4d6f0c1e88a9f2d7b4c0e1a6d3b9c7e2f1a0d4b8"
URL = "http://localhost:8090/api/custom_sources/detect"
TARGET_URL = "https://owent.net/index.html"

def test_ai_detect():
    print(f"Testing AI detection for {TARGET_URL}...")
    headers = {
        "X-Admin-Token": TOKEN,
        "Content-Type": "application/json"
    }
    payload = {"url": TARGET_URL}
    
    try:
        resp = requests.post(URL, json=payload, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f"Error: {resp.status_code}")
            print(resp.text)
            return
            
        data = resp.json()
        print("\nResponse Received:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
        # specific checks
        config = json.loads(data.get("config_json", "{}"))
        rules = config.get("scrape_rules", {})
        
        print("\nVerification Results:")
        if rules.get("items"):
            print(f"✅ Items Selector found: {rules['items']}")
        else:
            print(f"❌ Items Selector MISSING")
            
        if data.get("category_suggestion"):
             print(f"✅ Category found: {data['category_suggestion']}")
        else:
             print(f"❌ Category MISSING")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_ai_detect()
