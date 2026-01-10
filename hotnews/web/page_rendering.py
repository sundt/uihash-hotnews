import json
import hashlib
import os
import secrets
from datetime import datetime
from typing import Any, Callable, Dict, Optional
from urllib.parse import unquote

from fastapi import Request
from fastapi.responses import HTMLResponse


def _inject_explore_category(data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        if "explore" in cats:
            return data

        explore = {
            "id": "explore",
            "name": "深入探索",
            "icon": "🔎",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
        }
        data["categories"] = {"explore": explore, **cats}
        return data
    except Exception:
        return data


def _get_cdn_base_url(project_root) -> str:
    """获取 CDN 基础 URL"""
    try:
        import yaml

        config_path = project_root / "config" / "config.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            full_config = yaml.safe_load(f) or {}
        viewer_config = full_config.get("viewer", {}) or {}
        return (viewer_config.get("cdn_base_url") or "").strip()
    except Exception:
        return ""


def _get_asset_rev(project_root) -> str:
    forced = (os.environ.get("ASSET_REV") or "").strip()
    if forced:
        return forced

    css_path = project_root / "hotnews" / "web" / "static" / "css" / "viewer.css"
    js_path = project_root / "hotnews" / "web" / "static" / "js" / "viewer.bundle.js"

    h = hashlib.md5()
    found = False

    for p in (css_path, js_path):
        try:
            if p.exists():
                h.update(p.read_bytes())
                found = True
        except Exception:
            pass

    return h.hexdigest() if found else "0"


def _read_user_config_from_cookie(request: Request) -> Optional[dict]:
    """从 Cookie 读取用户配置"""
    try:
        cookie_value = request.cookies.get("hotnews_config")
        if not cookie_value:
            return None

        decoded = unquote(cookie_value)
        config = json.loads(decoded)

        if config.get("v") != 1:
            return None

        return config
    except Exception as e:
        print(f"Failed to read user config from cookie: {e}")
        return None


def _apply_user_config_to_data(data: dict, user_config: dict) -> dict:
    """应用用户配置到数据"""
    try:
        categories = data.get("categories", {})
        if not categories:
            return data

        custom_categories = user_config.get("custom", [])
        hidden_categories = user_config.get("hidden", [])
        category_order = user_config.get("order", [])

        result_categories = {}

        for cat_id in category_order:
            if cat_id in hidden_categories:
                continue

            custom_cat = next((c for c in custom_categories if c.get("id") == cat_id), None)

            if custom_cat:
                platforms = {}
                for platform_id in custom_cat.get("platforms", []):
                    for cat in categories.values():
                        if platform_id in cat.get("platforms", {}):
                            platforms[platform_id] = cat["platforms"][platform_id]
                            break

                if platforms:
                    result_categories[cat_id] = {
                        "name": custom_cat.get("name", cat_id),
                        "icon": "📱",
                        "platforms": platforms,
                    }
            elif cat_id in categories:
                result_categories[cat_id] = categories[cat_id]

        for cat_id, cat_data in categories.items():
            if cat_id not in result_categories and cat_id not in hidden_categories:
                result_categories[cat_id] = cat_data

        data["categories"] = result_categories
        return data

    except Exception as e:
        print(f"Failed to apply user config: {e}")
        return data


def _build_e2e_viewer_data() -> Dict[str, Any]:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def item(pid: str, title: str, url: str) -> Dict[str, Any]:
        return {
            "stable_id": f"{pid}-e2e",
            "title": title,
            "display_title": title,
            "url": url,
            "meta": "",
        }

    def platform(pid: str, name: str) -> Dict[str, Any]:
        return {
            "id": pid,
            "name": name,
            "news": [item(pid, f"{name} Item", f"https://example.com/{pid}")],
            "is_new": False,
        }

    social_plats = {
        "weibo": platform("weibo", "微博"),
        "douyin": platform("douyin", "抖音"),
        "bilibili-hot-search": platform("bilibili-hot-search", "B站"),
        "tieba": platform("tieba", "贴吧"),
        "hupu": platform("hupu", "虎扑"),
        "social-extra": platform("social-extra", "Extra"),
    }

    finance_plats = {
        "caixin": platform("caixin", "财新"),
        "wallstreetcn-hot": platform("wallstreetcn-hot", "华尔街见闻"),
        "wallstreetcn-quick": platform("wallstreetcn-quick", "华尔街见闻快讯"),
        "cls-hot": platform("cls-hot", "财联社"),
        "cls-telegraph": platform("cls-telegraph", "财联社电报"),
        "xueqiu": platform("xueqiu", "雪球"),
    }

    general_plats = {
        "toutiao": platform("toutiao", "今日头条"),
        "baidu": platform("baidu", "百度"),
    }

    data: Dict[str, Any] = {
        "updated_at": now,
        "filter_mode": "off",
        "categories": {
            "social": {
                "id": "social",
                "name": "社交娱乐",
                "icon": "🔥",
                "news_limit": 10,
                "platforms": social_plats,
                "news_count": len(social_plats),
                "filtered_count": 0,
                "is_new": False,
            },
            "finance": {
                "id": "finance",
                "name": "财经投资",
                "icon": "💰",
                "news_limit": 10,
                "platforms": finance_plats,
                "news_count": len(finance_plats),
                "filtered_count": 0,
                "is_new": False,
            },
            "general": {
                "id": "general",
                "name": "综合新闻",
                "icon": "📰",
                "news_limit": 10,
                "platforms": general_plats,
                "news_count": len(general_plats),
                "filtered_count": 0,
                "is_new": False,
            },
        },
    }
    return _inject_explore_category(data)


async def render_viewer_page(
    request: Request,
    filter: Optional[str],
    platforms: Optional[str],
    *,
    get_services: Callable[[], Any],
    templates: Any,
    project_root: Any,
    beta_can_mint_identity: Callable[[Request], bool],
    get_user_db_conn: Callable[[], Any],
    create_user_with_cookie_identity: Callable[..., Any],
    merge_rss_subscription_news_into_data: Optional[Callable[..., Dict[str, Any]]] = None,
):
    viewer_service, _ = get_services()

    platform_list = None
    if platforms:
        platform_list = [p.strip() for p in platforms.split(",") if p.strip()]

    try:
        qp = getattr(request, "query_params", None)
        e2e = str(qp.get("e2e") if qp else "").strip()
        allow_e2e = e2e == "1"

        if allow_e2e:
            data = _build_e2e_viewer_data()
        else:
            data = viewer_service.get_categorized_news(
                platforms=platform_list,
                limit=5000,
                apply_filter=True,
                filter_mode=filter,
            )

        data = _inject_explore_category(data)

        if callable(merge_rss_subscription_news_into_data):
            try:
                data = merge_rss_subscription_news_into_data(request=request, data=data)
            except Exception:
                pass

        cdn_base_url = _get_cdn_base_url(project_root)
        static_prefix = cdn_base_url if cdn_base_url else "/static"

        asset_rev = _get_asset_rev(project_root)

        resp = templates.TemplateResponse(
            "viewer.html",
            {
                "request": request,
                "data": data,
                "available_filters": ["strict", "moderate", "off"],
                "current_filter": filter or data.get("filter_mode", "moderate"),
                "static_prefix": static_prefix,
                "asset_rev": asset_rev,
            },
        )

        try:
            has_cookie = bool((request.cookies.get("rss_uid") or "").strip())
            if not has_cookie:
                tok = secrets.token_urlsafe(32)
                create_user_with_cookie_identity(conn=get_user_db_conn(), token=tok)
                resp.set_cookie(
                    key="rss_uid",
                    value=tok,
                    httponly=True,
                    samesite="lax",
                    path="/",
                )
        except Exception:
            pass

        return resp
    except Exception as e:
        return HTMLResponse(
            content=f"""
            <html>
                <head><title>错误</title></head>
                <body>
                    <h1>加载失败</h1>
                    <p>错误信息: {str(e)}</p>
                    <p>请确保已经运行过爬虫并有新闻数据。</p>
                </body>
            </html>
            """,
            status_code=500,
        )
