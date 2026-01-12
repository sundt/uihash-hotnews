import sys
from pathlib import Path
import asyncio
import json

# Add project root to path
cpath = Path(__file__).resolve().parent
sys.path.append(str(cpath))

from hotnews.web.rss_proxy import rss_proxy_fetch_warmup

def debug_fetch():
    url = "https://wechat2rss.bestblogs.dev/feed/00a1da3493512c20aff1ea5a0d1a02537e931b36.xml"
    print(f"Fetching {url}...")
    
    try:
        data = rss_proxy_fetch_warmup(url, "", "", "")
        
        entries = data.get("data", {}).get("entries", [])
        print(f"Fetch complete. Etag: {data.get('etag')}, LastModified: {data.get('last_modified')}")
        print(f"Entries count: {len(entries)}")
        
        if entries:
            print("First entry sample:")
            print(json.dumps(entries[0], ensure_ascii=False, indent=2))
            
            # Simulate row construction
            rows = []
            for ent in entries:
                title = (ent.get("title") or "").strip()
                link = (ent.get("link") or "").strip()
                if not title: title = link
                if not link: 
                    print("Skipping entry with no link")
                    continue
                
                # Dedupe key logic simulation
                guid = (ent.get("guid") or ent.get("id") or "").strip()
                dk = ""
                if guid: dk = f"g:{guid}"
                elif link: dk = f"l:{link}"
                elif title: dk = f"t:{title}"
                
                print(f"Entry: Title='{title[:20]}...', Link='{link[:30]}...', DK='{dk}'")
                if not dk:
                    print("EMPTY DEDUP KEY!")
                    continue
                    
                rows.append((dk, link, title))
            
            print(f"\nRows prepared: {len(rows)}")
                
    except Exception as e:
        print(f"Fetch failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_fetch()
