
import requests
import re
import random
import time
from datetime import datetime

def fetch():
    print("开始抓取财联社数据...")
    
    # 映射配置
    target_ids = [1000, 1001, 1002]
    limit = 15
    
    all_items = []
    seen_ids = set()
    
    # 模拟真实手机 Header
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": "https://m.cls.cn/"
    }
    
    session = requests.Session()
    session.headers.update(headers)
    
    # API 备选 (移动端 API，风控通常较松)
    api_map = {
        1002: "https://m.cls.cn/nodeapi/telegraphList?rn=30",
        1000: "https://m.cls.cn/nodeapi/depthList?id=1000&rn=30", 
        1001: "https://m.cls.cn/nodeapi/depthList?id=1001&rn=30"
    }

    def parse_time(t):
        try:
            return int(t)
        except:
            return 0

    for tid in target_ids:
        api_url = api_map.get(tid)
        print(f"尝试抓取 ID {tid}: {api_url}")
        
        if api_url:
            try:
                time.sleep(random.uniform(0.5, 1.5))
                resp = session.get(api_url, timeout=8)
                print(f"ID {tid} 响应状态码: {resp.status_code}")
                
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        items = data.get("data", {}).get("roll_data") or \
                                data.get("data", {}).get("depth_list") or []
                        
                        count = 0
                        for item in items:
                            title = item.get("title", "") or item.get("brief", "") or item.get("content", "")[:60]
                            if not title: continue
                            
                            title = re.sub(r'<[^>]+>', '', title).strip()
                            aid = item.get("id")
                            if aid and aid not in seen_ids:
                                seen_ids.add(aid)
                                all_items.append({
                                    "title": title,
                                    "url": f"https://www.cls.cn/detail/{aid}",
                                    "published_at": parse_time(item.get("ctime", 0)),
                                    "_rank_score": parse_time(item.get("ctime", 0))
                                })
                                count += 1
                        print(f"ID {tid} 成功获取 {count} 条数据")
                    except Exception as e:
                        print(f"ID {tid} 解析 JSON 失败: {e} - 响应内容前100字符: {resp.text[:100]}")
                else:
                    print(f"ID {tid} 请求失败: {resp.status_code}")
            except Exception as e:
                print(f"ID {tid} 连接异常: {e}")

    # 排序
    all_items.sort(key=lambda x: x["_rank_score"], reverse=True)
    
    print(f"\n总共获取到 {len(all_items)} 条数据:")
    for i, item in enumerate(all_items[:5]): # 只显示前5条
        print(f"{i+1}. [{datetime.fromtimestamp(item['published_at'])}] {item['title']} ({item['url']})")

if __name__ == "__main__":
    fetch()
