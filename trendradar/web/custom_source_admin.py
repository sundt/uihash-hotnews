# coding=utf-8
import json
import sqlite3
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from trendradar.web.db_online import get_online_db_conn
from trendradar.providers.runner import run_provider_ingestion_once, build_default_registry, ProviderRegistry

router = APIRouter(prefix="/api/custom_sources", tags=["custom_sources"])

class CustomSource(BaseModel):
    id: str
    name: str
    provider_type: str
    config_json: str
    enabled: bool
    schedule_cron: Optional[str] = None
    category: Optional[str] = ""
    country: Optional[str] = ""
    language: Optional[str] = ""

class TestSourceRequest(BaseModel):
    provider_type: str
    config_json: str

class DetectRequest(BaseModel):
    url: str

def _get_project_root(request: Request) -> Path:
    return request.app.state.project_root

def _get_conn(request: Request) -> sqlite3.Connection:
    return get_online_db_conn(_get_project_root(request))

def _require_admin(request: Request):
    if hasattr(request.app.state, "require_admin"):
        request.app.state.require_admin(request)
    else:
        # Fallback if not configured
        pass

@router.get("", response_model=List[Dict[str, Any]])
async def list_custom_sources(request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    
    # Get all custom sources with stats fields
    cur = conn.execute("""
        SELECT id, name, provider_type, config_json, enabled, schedule_cron, 
               category, country, language, last_run_at, last_status, last_error, 
               backoff_until, created_at, updated_at, entries_count, fail_count
        FROM custom_sources 
        ORDER BY updated_at DESC
    """)
    rows = cur.fetchall()
    
    results = []
    for r in rows:
        results.append({
            "id": r[0],
            "name": r[1],
            "provider_type": r[2],
            "config_json": r[3],
            "enabled": bool(r[4]),
            "schedule_cron": r[5],
            "category": r[6] or "",
            "country": r[7] or "",
            "language": r[8] or "",
            "last_run_at": r[9],
            "last_status": r[10],
            "last_error": r[11],
            "backoff_until": r[12],
            "created_at": r[13],
            "updated_at": r[14],
            "stats": {
                "entries": r[15] or 0,
                "fails": r[16] or 0,
                "last_update": r[9]  # Use last_run_at as last_update
            }
        })
    return results

@router.post("")
async def create_custom_source(source: CustomSource, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        # Validate JSON
        try:
            json.loads(source.config_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON config")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """
            INSERT INTO custom_sources (id, name, provider_type, config_json, enabled, schedule_cron, category, country, language, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (source.id, source.name, source.provider_type, source.config_json, source.enabled, source.schedule_cron, source.category, source.country, source.language, now, now)
        )
        conn.commit()
        return {"success": True}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="ID already exists")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{source_id}")
async def update_custom_source(source_id: str, source: CustomSource, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        try:
            json.loads(source.config_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON config")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """
            UPDATE custom_sources
            SET name = ?, provider_type = ?, config_json = ?, enabled = ?, schedule_cron = ?, category = ?, country = ?, language = ?, updated_at = ?
            WHERE id = ?
            """,
            (source.name, source.provider_type, source.config_json, source.enabled, source.schedule_cron, source.category, source.country, source.language, now, source_id)
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{source_id}")
async def delete_custom_source(source_id: str, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        conn.execute("DELETE FROM custom_sources WHERE id = ?", (source_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{source_id}/run")
async def run_custom_source(source_id: str, request: Request, _=Depends(_require_admin)):
    """Trigger immediate run for a source."""
    conn = _get_conn(request)
    
    # Load config from DB
    cur = conn.execute("SELECT name, config_json, provider_type, entries_count, fail_count FROM custom_sources WHERE id = ?", (source_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Source not found")
        
    source_name = row[0]
    config_json = row[1]
    provider_type = row[2]
    current_entries = row[3] or 0
    current_fails = row[4] or 0
    
    try:
        config = json.loads(config_json)
    except:
        raise HTTPException(status_code=500, detail="Invalid config JSON in DB")

    registry = build_default_registry()
    try:
        provider = registry.get(provider_type)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Provider {provider_type} not found")

    root = _get_project_root(request)
    
    from trendradar.core import load_config
    from trendradar.providers.base import ProviderFetchContext
    
    app_config = load_config(str(root / "config" / "config.yaml"))
    
    ctx = ProviderFetchContext(
        project_root=str(root),
        now=datetime.now(),
        config=app_config
    )
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        result = provider.fetch(
            ctx=ctx,
            platform_id=source_id,
            platform_name=source_name,
            platform_config=config,
        )
        
        items_count = len(result.items)
        new_entries = current_entries + items_count
        
        # Update DB status with entries_count
        conn.execute("""
            UPDATE custom_sources 
            SET last_run_at = ?, last_status = 'success', last_error = '', 
                entries_count = ?, updated_at = ?
            WHERE id = ?
        """, (now_str, new_entries, now_str, source_id))
        conn.commit()
        
        # Save to storage (news.db)
        try:
            from trendradar.storage.base import NewsData
            from trendradar.storage.local import LocalStorageBackend
            import pytz
            
            try:
                tz = pytz.timezone("Asia/Shanghai")
                now_obj = datetime.now(tz)
            except:
                now_obj = datetime.now()
                
            items_dict = {source_id: result.items}
            crawl_time_str = now_obj.strftime("%H-%M")
            
            # Ensure items have crawl_time set
            for item in result.items:
                 if not item.crawl_time:
                     item.crawl_time = crawl_time_str

            news_data = NewsData(
                date=now_obj.strftime("%Y-%m-%d"),
                crawl_time=crawl_time_str,
                items=items_dict,
                id_to_name={source_id: source_name},
                failed_ids=[]
            )
            
            storage_path = root / "output"
            storage = LocalStorageBackend(str(storage_path))
            storage.save_news_data(news_data)
        except Exception as e:
            print(f"Error saving to storage: {e}")
            traceback.print_exc()
            # Don't fail the request if storage save fails, as DB update succeeded
        
        return {"success": True, "items_count": items_count}
        
    except Exception as e:
        traceback.print_exc()
        new_fails = current_fails + 1
        
        # Update DB error with fail_count
        conn.execute("""
            UPDATE custom_sources 
            SET last_run_at = ?, last_status = 'error', last_error = ?, 
                fail_count = ?, updated_at = ?
            WHERE id = ?
        """, (now_str, str(e), new_fails, now_str, source_id))
        conn.commit()
        
        raise HTTPException(status_code=500, detail=f"Run failed: {str(e)}")

def _get_news_db_conn(project_root: Path) -> Optional[sqlite3.Connection]:
    """Get connection to today's news.db."""
    try:
        import pytz
        tz = pytz.timezone("Asia/Shanghai")
        now = datetime.now(tz)
    except Exception:
        now = datetime.now()
        
    date_str = now.strftime("%Y-%m-%d")
    db_path = project_root / "output" / date_str / "news.db"
    
    if not db_path.exists():
        return None
        
    try:
        conn = sqlite3.connect(str(db_path))
        return conn
    except Exception:
        return None


@router.get("/{source_id}/items")
async def get_custom_source_items(source_id: str, request: Request, _=Depends(_require_admin)):
    """Get latest items from a custom source."""
    conn = _get_conn(request)
    
    # Verify source exists
    cur = conn.execute("SELECT id FROM custom_sources WHERE id = ?", (source_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Source not found")
    
    items = []
    
    # Query latest items from today's news_items table
    root = _get_project_root(request)
    news_conn = _get_news_db_conn(root)
    
    if news_conn:
        try:
            # Query items from news.db
            cur = news_conn.execute("""
                SELECT title, url, last_crawl_time, first_crawl_time 
                FROM news_items 
                WHERE platform_id = ? 
                ORDER BY last_crawl_time DESC 
                LIMIT 10
            """, (source_id,))
            
            for row in cur.fetchall():
                items.append({
                    "title": row[0],
                    "url": row[1],
                    "crawl_time": row[2],
                    "first_time": row[3]
                })
        except Exception as e:
            # Table might not exist or other error
            print(f"Error querying news.db: {e}")
            pass
        finally:
            try:
                news_conn.close()
            except:
                pass
    
    return {"items": items}

@router.post("/test")
async def test_custom_source(payload: TestSourceRequest, request: Request, _=Depends(_require_admin)):
    """Dry run a provider configuration effectively."""
    try:
        config = json.loads(payload.config_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON config")

    provider_id = payload.provider_type
    
    # Construct a temporary config for the runner
    # We will use the existing runner but point it to a "test" platform config
    
    registry = build_default_registry()
    try:
        registry.get(provider_id)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Provider {provider_id} not found")

    root = _get_project_root(request)
    
    # We need to manually construct the context to run just this one
    from trendradar.core import load_config
    app_config = load_config(str(root / "config" / "config.yaml"))
    
    # Mock ingestion config just for this run
    # But wait, `run_provider_ingestion_once` reads config from file or DB.
    # We should invoke the provider directly or make `run_provider_ingestion_once` support passing config directly?
    # `run_provider_ingestion_once` loads from config inside.
    # It takes `registry` and `project_root`.
    
    # Better to invoke provider directly here to capture output immediately without side effects (like metrics)? 
    # Or just reuse the logic. Let's reuse logic by subclassing or careful call.
    # Actually, simpler to just instantiate the provider and call fetch.
    
    from trendradar.providers.base import ProviderFetchContext
    
    ctx = ProviderFetchContext(
        project_root=str(root),
        now=datetime.now(),
        config=app_config
    )
    
    try:
        provider = registry.get(provider_id)
        result = provider.fetch(
            ctx=ctx,
            platform_id="test_run",
            platform_name="Test Run",
            platform_config=config,
        )
        
        # Serialize result for preview
        items = []
        for it in result.items:
            items.append({
                "title": it.title,
                "url": it.url,
                "time": it.crawl_time
            })
            
        return {
            "success": True,
            "items_count": len(items),
            "items": items[:20], # limit preview
            "metric": result.metric
        }
        
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }

@router.post("/detect")
async def detect_custom_source(req: DetectRequest, request: Request, _=Depends(_require_admin)):
    import requests
    from urllib.parse import urlparse
    import hashlib
    
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Empty URL")

    # Helpers for guessing
    def guess_country_lang(hostname):
        if hostname.endswith(".cn"): return "CN", "zh"
        if hostname.endswith(".hk"): return "HK", "zh"
        if hostname.endswith(".tw"): return "TW", "zh"
        if hostname.endswith(".jp"): return "JP", "jp"
        if hostname.endswith(".kr"): return "KR", "ko"
        if hostname.endswith(".uk"): return "UK", "en"
        return "US", "en" # Default

    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    path = parsed.path
    
    # Generate ID: source_name_hash_prefix
    # e.g. caixin_a1b2c3
    name_slug = hostname.split('.')[0] if hostname else "custom"
    if "www." in hostname:
        name_slug = hostname.split('.')[1]
    
    # Simple hash of URL to ensure uniqueness
    url_hash = hashlib.md5(url.encode()).hexdigest()[:6]
    generated_id = f"{name_slug}_{url_hash}"

    country, lang = guess_country_lang(hostname)
    category = "News" # Default

    common_cron = "*/30 * * * *"

    try:
        # Try fetching with requests
        # Try fetching with requests
        # Retry with verify=False if SSLError
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        try:
            res = requests.get(url, headers=headers, timeout=10)
        except requests.exceptions.SSLError:
            res = requests.get(url, headers=headers, timeout=10, verify=False)

        # Handle encoding
        if res.encoding is None or res.encoding == 'ISO-8859-1':
            res.encoding = res.apparent_encoding
        content_type = res.headers.get("Content-Type", "").lower()
        
        # 1. Check if JSON
        is_json = "application/json" in content_type or url.endswith(".json")
        try:
            data = res.json()
            is_json = True
        except:
            data = None

        if is_json and data:
            # Basic guess for JSON API
            items_key = ""
            if isinstance(data, list):
                items_key = "" 
            elif isinstance(data, dict):
                # Find the first list that looks like it has news items
                for k, v in data.items():
                    if isinstance(v, list) and len(v) > 0:
                        items_key = k
                        break
            
            field_mapping = {
                "title": "title",
                "link": "url",
                "published_at": "created_at",
                "content": "content"
            }
            
            config = {
                "url": url,
                "method": "GET",
                "items_key": items_key,
                "field_mapping": field_mapping
            }
            return {
                "provider_type": "http_json",
                "config_json": json.dumps(config, indent=2, ensure_ascii=False),
                "name_suggestion": hostname or "New API Source",
                "id_suggestion": generated_id,
                "category_suggestion": category,
                "country_suggestion": country,
                "language_suggestion": lang,
                "cron_suggestion": common_cron
            }

        # 2. Otherwise HTML scraping
        from bs4 import BeautifulSoup
        
        # Helper to validate and fix selectors
        def validate_and_fix_selectors(soup, ai_rules):
            """Validate AI-generated selectors and find the most specific ones."""
            items_sel = ai_rules.get("items", "article")
            title_sel = ai_rules.get("title", "h2 a")
            link_sel = ai_rules.get("link", "a")
            
            # Test items selector
            items = soup.select(items_sel)
            if not items:
                # Try common alternatives
                for alt in ["article", "div.post", "div.entry", "li", "div.item", "div.card"]:
                    items = soup.select(alt)
                    if items:
                        items_sel = alt
                        break
            
            if items and len(items) > 0:
                # Test within first item to find best selectors
                first_item = items[0]
                
                # Find best title selector (prioritize specific class-based ones)
                title_candidates = [
                    "h1 a[class*='title']", "h2 a[class*='title']", "h3 a[class*='title']",
                    "a[class*='title']", "[class*='title'] a",
                    "h1 a", "h2 a", "h3 a", 
                    "a.headline", "a.entry-title", 
                    "h1", "h2", "h3", "a"
                ]
                
                best_title_sel = None
                for candidate in title_candidates:
                    elem = first_item.select_one(candidate)
                    if elem and elem.get_text(strip=True):
                        best_title_sel = candidate
                        break
                
                if best_title_sel:
                    title_sel = best_title_sel
                
                # Find best link selector (prioritize same as title if it has href)
                if best_title_sel:
                    # Check if title element is or contains a link
                    title_elem = first_item.select_one(best_title_sel)
                    if title_elem:
                        if title_elem.name == 'a' and title_elem.get('href'):
                            link_sel = best_title_sel
                        else:
                            link_in_title = title_elem.find('a')
                            if link_in_title and link_in_title.get('href'):
                                # Build selector for link within title
                                link_sel = best_title_sel
                
                # If link still not found, search independently
                if not link_sel or not first_item.select_one(link_sel):
                    link_candidates = [
                        "a[href*='http']", "a[href^='/']", "a[href^='./']",
                        "a", "h1 a", "h2 a", "h3 a"
                    ]
                    for candidate in link_candidates:
                        elem = first_item.select_one(candidate)
                        if elem and elem.get('href'):
                            link_sel = candidate
                            break
            
            return {
                "items": items_sel,
                "title": title_sel,
                "link": link_sel,
                "date": ai_rules.get("date", "")
            }
        
        
        # Helper to call LLM
        def call_llm_for_config(html_content: str, url: str) -> Dict[str, Any]:
             import os
             import requests
             api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
             if not api_key:
                 return {}

             model = (os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
             endpoint = (os.environ.get("TREND_RADAR_MB_AI_ENDPOINT") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
             
             prompt = f"""
You are an expert web scraper configuration generator. 
Analyze the following HTML snippet from {url} and generate a JSON configuration for scraping news articles.
The goal is to extract a list of news items with title, link, date, and content.

Important:
1. Identify the recurring HTML element that represents a single news item (e.g., <article>, <div class="post">).
2. Avoid using IDs for the "items" selector if they look unique per post (e.g. "post-123"). Use classes instead.
3. Selectors for title, link, etc. must be RELATIVE to the "items" selector.

Output strict JSON only, no markdown code blocks.
Format:
{{
  "scrape_rules": {{
      "items": "CSS selector for the article container (e.g. article, .post, .news-item)",
      "title": "CSS selector for title (relative to items container)",
      "link": "CSS selector for link (relative to items container)",
      "date": "CSS selector for date (relative to items container, optional)"
  }},
  "metadata": {{
      "category": "One of: News, Tech, Finance, Business, Other",
      "country": "Country code (e.g. CN, US, JP)",
      "language": "Language code (e.g. zh, en, ja)",
      "name": "Suggested source name"
  }}
}}

HTML Snippet (truncated, cleaned):
{html_content[:50000]}
"""
             try:
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1
                }
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                
                # Proxy handling
                proxies = {"http": None, "https": None}
                if os.environ.get("TREND_RADAR_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
                    proxies = None

                resp = requests.post(endpoint, headers=headers, json=payload, timeout=30, proxies=proxies)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    # Clean markdown code blocks if present
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0]
                    return json.loads(content.strip())
             except Exception as e:
                 print(f"LLM Call failed: {e}")
                 traceback.print_exc()
             return {}

        # Fetch page with requests
        page_content = res.text
        page_title = hostname
        
        try:
            soup = BeautifulSoup(page_content, "html.parser")
            title_tag = soup.find("title")
            if title_tag:
                page_title = title_tag.get_text(strip=True)
        except:
            pass

        # Helper to clean HTML for LLM
        def _clean_html_for_llm(html_content: str) -> str:
            try:
                soup = BeautifulSoup(html_content, "html.parser")
                # Remove scripts, styles, svg, meta, link, comments
                for tag in soup(["script", "style", "svg", "meta", "link", "noscript"]):
                    tag.decompose()
                # Remove comments
                from bs4 import Comment
                for comment in soup.find_all(text=lambda text: isinstance(text, Comment)):
                    comment.extract()
                return str(soup)
            except:
                return html_content

        # Call AI
        cleaned_html = _clean_html_for_llm(page_content)
        # Increase context size to 50k chars after cleaning, as modern LLMs can handle it
        ai_result = call_llm_for_config(cleaned_html, url)
        
        # Get and validate selectors
        scrape_rules = ai_result.get("scrape_rules", {})
        metadata = ai_result.get("metadata", {})
        
        if not scrape_rules:
             scrape_rules = {
                "items": "article",
                "title": "h2 a",
                "link": "a"
            }
        
        # Validate and fix selectors
        try:
            soup = BeautifulSoup(page_content, "html.parser")
            scrape_rules = validate_and_fix_selectors(soup, scrape_rules)
        except:
            pass
        
        final_category = metadata.get("category") or category
        final_country = metadata.get("country") or country
        final_language = metadata.get("language") or lang
        final_name = metadata.get("name") or page_title

        config = {
            "url": url,
            "scrape_rules": scrape_rules
        }
        
        return {
            "provider_type": "html_scraper",
            "config_json": json.dumps(config, indent=2, ensure_ascii=False),
            "name_suggestion": final_name,
            "id_suggestion": generated_id,
            "category_suggestion": final_category,
            "country_suggestion": final_country,
            "language_suggestion": final_language,
            "cron_suggestion": common_cron
        }

    except Exception as e:
        traceback.print_exc()
        config = {"url": url, "scrape_rules": {"items": "article", "title": "h2 a", "link": "a"}}
        return {
            "provider_type": "html_scraper",
            "config_json": json.dumps(config, indent=2, ensure_ascii=False),
            "name_suggestion": hostname or "New Source",
            "id_suggestion": generated_id,
            "category_suggestion": category,
            "country_suggestion": country,
            "language_suggestion": lang,
            "cron_suggestion": common_cron
        }
