
import re
from datetime import datetime, timezone

def test():
    with open('tnw_feed.xml', 'r') as f:
        content = f.read()
    
    print(f"Content length: {len(content)}")
    
    items = re.findall(r'<item>(.*?)</item>', content, re.DOTALL)
    print(f"Found {len(items)} items")
    
    MONTH_MAP = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    }

    for i, item_xml in enumerate(items[:3]):
        print(f"--- Item {i} ---")
        title_match = re.search(r'<title><!\[CDATA\[(.*?)\]\]></title>', item_xml, re.DOTALL)
        if not title_match:
            title_match = re.search(r'<title>(.*?)</title>', item_xml, re.DOTALL)
        title = title_match.group(1).strip() if title_match else "NO TITLE"
        
        link_match = re.search(r'<link>(.*?)</link>', item_xml)
        link = link_match.group(1).strip() if link_match else "NO LINK"
        
        pub_date_match = re.search(r'<pubDate>(.*?)</pubDate>', item_xml)
        if pub_date_match:
            date_str = pub_date_match.group(1).strip()
            print(f"Raw Date: {date_str}")
            # Parse logic
            if ',' in date_str:
                date_str = date_str.split(',', 1)[1].strip()
            parts = date_str.split()
            # Check logic
            print(f"Parts: {parts}")
        
        print(f"Title: {title}")
        print(f"Link: {link}")

if __name__ == "__main__":
    test()
