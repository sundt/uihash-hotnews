"""
新浪科技滚动新闻抓取脚本
Custom Source Script for Sina Tech Rolling News

API: https://feed.mix.sina.com.cn/api/roll/get?pageid=372&lid=2431&k=&num=50&page=1
"""

def fetch(platform_config, ctx):
    """
    抓取新浪科技滚动新闻
    
    Args:
        platform_config: 平台配置（未使用）
        ctx: 上下文对象（未使用）
    
    Returns:
        list: 新闻列表 [{"title": "...", "url": "...", "time": "..."}]
    """
    # requests, json, re, bs4 are pre-imported global variables
    api_url = "https://feed.mix.sina.com.cn/api/roll/get"
    params = {
        "pageid": 372,
        "lid": 2431,
        "k": "",
        "num": 50,
        "page": 1
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://tech.sina.com.cn/"
    }
    
    resp = requests.get(api_url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    
    data = resp.json()
    
    # 检查响应状态
    result = data.get("result", {})
    status = result.get("status", {})
    if status.get("code") != 0:
        raise ValueError(f"API error: {status.get('msg', 'Unknown')}")
    
    news_list = []
    items = result.get("data", [])
    
    for item in items:
        title = item.get("title", "").strip()
        url = item.get("url", "").strip()
        # ctime 是 Unix 时间戳（秒）
        ctime = item.get("ctime", 0)
        
        if not title or not url:
            continue
        
        # 格式化时间
        import time as time_module
        if ctime:
            try:
                time_str = time_module.strftime("%Y-%m-%d %H:%M", time_module.localtime(int(ctime)))
            except:
                time_str = ""
        else:
            time_str = ""
        
        news_list.append({
            "title": title,
            "url": url,
            "time": time_str
        })
    
    return news_list


# 本地测试
if __name__ == "__main__":
    import requests
    import json
    
    # 模拟 Dynamic Python 环境
    result = fetch({}, None)
    print(f"获取到 {len(result)} 条新闻:\n")
    for i, news in enumerate(result[:10], 1):
        print(f"{i}. [{news['time']}] {news['title']}")
        print(f"   {news['url']}\n")
