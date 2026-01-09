# coding=utf-8
"""
NewsNow Platform Admin API

Manage NewsNow platforms (Weibo, Douyin, Bilibili, etc.) through the Admin UI.
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from trendradar.web.db_online import get_online_db_conn

router = APIRouter(prefix="/api/newsnow_platforms", tags=["newsnow_platforms"])


class NewsNowPlatform(BaseModel):
    id: str
    name: str
    category: Optional[str] = ""
    enabled: bool = True
    sort_order: Optional[int] = 0


def _get_project_root(request: Request) -> Path:
    return request.app.state.project_root


def _get_conn(request: Request) -> sqlite3.Connection:
    return get_online_db_conn(_get_project_root(request))


def _require_admin(request: Request):
    if hasattr(request.app.state, "require_admin"):
        request.app.state.require_admin(request)


@router.get("", response_model=List[Dict[str, Any]])
async def list_newsnow_platforms(request: Request, _=Depends(_require_admin)):
    """List all NewsNow platforms."""
    conn = _get_conn(request)
    cur = conn.execute(
        """SELECT id, name, category, enabled, sort_order, 
                  last_fetch_at, last_status, last_error, updated_at 
           FROM newsnow_platforms 
           ORDER BY sort_order ASC, name ASC"""
    )
    rows = cur.fetchall()
    results = []
    for r in rows:
        results.append({
            "id": r[0],
            "name": r[1],
            "category": r[2] or "",
            "enabled": bool(r[3]),
            "sort_order": r[4] or 0,
            "last_fetch_at": r[5],
            "last_status": r[6],
            "last_error": r[7],
            "updated_at": r[8]
        })
    return results


@router.post("")
async def create_newsnow_platform(platform: NewsNowPlatform, request: Request, _=Depends(_require_admin)):
    """Add a new NewsNow platform."""
    conn = _get_conn(request)
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """INSERT INTO newsnow_platforms (id, name, category, enabled, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (platform.id, platform.name, platform.category, platform.enabled, platform.sort_order, now, now)
        )
        conn.commit()
        return {"success": True}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Platform ID already exists")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{platform_id}")
async def update_newsnow_platform(platform_id: str, platform: NewsNowPlatform, request: Request, _=Depends(_require_admin)):
    """Update an existing NewsNow platform."""
    conn = _get_conn(request)
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """UPDATE newsnow_platforms 
               SET name = ?, category = ?, enabled = ?, sort_order = ?, updated_at = ?
               WHERE id = ?""",
            (platform.name, platform.category, platform.enabled, platform.sort_order, now, platform_id)
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{platform_id}")
async def delete_newsnow_platform(platform_id: str, request: Request, _=Depends(_require_admin)):
    """Delete a NewsNow platform."""
    conn = _get_conn(request)
    try:
        conn.execute("DELETE FROM newsnow_platforms WHERE id = ?", (platform_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{platform_id}/toggle")
async def toggle_newsnow_platform(platform_id: str, request: Request, _=Depends(_require_admin)):
    """Toggle enabled status of a platform."""
    conn = _get_conn(request)
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """UPDATE newsnow_platforms 
               SET enabled = NOT enabled, updated_at = ?
               WHERE id = ?""",
            (now, platform_id)
        )
        conn.commit()
        
        # Return new status
        cur = conn.execute("SELECT enabled FROM newsnow_platforms WHERE id = ?", (platform_id,))
        row = cur.fetchone()
        return {"success": True, "enabled": bool(row[0]) if row else False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/migrate")
async def migrate_platforms_from_config(request: Request, _=Depends(_require_admin)):
    """Migrate platforms from config.yaml to database."""
    import yaml
    
    conn = _get_conn(request)
    root = _get_project_root(request)
    config_path = root / "config" / "config.yaml"
    
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="config.yaml not found")
    
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        platforms = config.get("platforms", [])
        if not platforms:
            return {"success": True, "migrated": 0, "message": "No platforms found in config"}
        
        # Category mapping based on ID prefixes
        category_map = {
            "toutiao": "综合新闻", "baidu": "综合新闻", "thepaper": "综合新闻",
            "ifeng": "综合新闻", "cankaoxiaoxi": "综合新闻", "zaobao": "综合新闻",
            "tencent": "综合新闻",
            "wallstreetcn": "财经投资", "cls": "财经投资", "gelonghui": "财经投资",
            "xueqiu": "财经投资", "jin10": "财经投资",
            "weibo": "社交娱乐", "douyin": "社交娱乐", "bilibili": "社交娱乐",
            "tieba": "社交娱乐", "zhihu": "社交娱乐", "hupu": "社交娱乐", "douban": "社交娱乐",
            "ithome": "科技", "juejin": "科技", "github": "科技", "hackernews": "科技",
            "v2ex": "科技", "sspai": "科技", "36kr": "科技", "producthunt": "科技", "freebuf": "科技"
        }
        
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        migrated = 0
        
        for idx, p in enumerate(platforms):
            if not isinstance(p, dict):
                continue
            pid = str(p.get("id") or "").strip()
            pname = str(p.get("name") or pid).strip()
            if not pid:
                continue
            
            # Determine category
            category = ""
            for prefix, cat in category_map.items():
                if pid.startswith(prefix):
                    category = cat
                    break
            
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO newsnow_platforms 
                       (id, name, category, enabled, sort_order, created_at, updated_at)
                       VALUES (?, ?, ?, 1, ?, ?, ?)""",
                    (pid, pname, category, idx, now, now)
                )
                migrated += 1
            except Exception:
                pass
        
        conn.commit()
        return {"success": True, "migrated": migrated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
