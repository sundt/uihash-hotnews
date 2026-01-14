import requests
import re
from datetime import datetime

url = "https://www.anthropic.com/news"

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"正在获取: {url}")
resp = requests.get(url, headers=headers, timeout=15)
print(f"状态码: {resp.status_code}")
print(f"内容长度: {len(resp.text)} 字符")

html = resp.text

# 保存 HTML 以便分析
with open("/tmp/anthropic_news.html", "w") as f:
    f.write(html)
print("HTML 已保存到 /tmp/anthropic_news.html")

# 尝试不同的正则模式
print("\n=== 方法1: 匹配 href 和日期 ===")
# 匹配 href="/news/xxx" 
links = re.findall(r'href="(/news/[^"]+)"', html)
print(f"找到 {len(links)} 个 /news/ 链接:")
for link in links[:5]:
    print(f"  {link}")

print("\n=== 方法2: 查找日期格式 ===")
dates = re.findall(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}', html)
print(f"找到 {len(dates)} 个日期:")
for d in dates[:5]:
    print(f"  {d}")

print("\n=== 方法3: 查找 JSON 数据 ===")
# Next.js 应用通常有 __NEXT_DATA__ 
next_data = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
if next_data:
    print("找到 __NEXT_DATA__, 长度:", len(next_data.group(1)))
    # 保存 JSON
    with open("/tmp/anthropic_next_data.json", "w") as f:
        f.write(next_data.group(1))
    print("JSON 已保存到 /tmp/anthropic_next_data.json")
else:
    print("未找到 __NEXT_DATA__")

print("\n=== 方法4: 查找 article 或 news-item 类 ===")
articles = re.findall(r'class="[^"]*(?:article|news|post|card)[^"]*"', html, re.IGNORECASE)
print(f"找到 {len(articles)} 个相关 class:")
for a in articles[:10]:
    print(f"  {a}")

print("\n=== HTML 前 2000 字符 ===")
print(html[:2000])
