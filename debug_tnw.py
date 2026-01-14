
import requests
import re
import json

url = "https://thenextweb.com/"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    print(f"Fetching {url}...")
    resp = requests.get(url, headers=headers, timeout=15)
    html = resp.text
    print(f"Status: {resp.status_code}")
    
    # Check for __NEXT_DATA__
    next_data_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', html)
    if next_data_match:
        print("Found __NEXT_DATA__")
        try:
            data = json.loads(next_data_match.group(1))
            # Try to find articles in props
            # This requires exploration, simple print for now
            print(f"Keys: {list(data.keys())}")
            # Identify where articles might be
            # Usually props -> pageProps -> ...
            if 'props' in data and 'pageProps' in data['props']:
                pp = data['props']['pageProps']
                print(f"pageProps keys: {list(pp.keys())}")
        except Exception as e:
            print(f"JSON parse error: {e}")
    else:
        print("No __NEXT_DATA__ found")

    # Check for time tags
    times = re.findall(r'<time[^>]*>(.*?)</time>', html)
    print(f"Found {len(times)} time tags")
    if times:
        print(times[:3])
        
    # Check for datetime attributes
    datetimes = re.findall(r'datetime="([^"]+)"', html)
    print(f"Found {len(datetimes)} datetime attributes")
    if datetimes:
        print(datetimes[:3])
        
except Exception as e:
    print(f"Error: {e}")
