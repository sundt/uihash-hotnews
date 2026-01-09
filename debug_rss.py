import requests
import sys

url = "https://qborfy.com/atom.xml"
headers = {"User-Agent": "TrendRadar/1.0"}

print(f"Fetching {url}...")
try:
    resp = requests.get(url, headers=headers, timeout=10)
    print(f"Status: {resp.status_code}")
    print(f"Content-Type: {resp.headers.get('Content-Type')}")
    print(f"Body preview: {resp.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
