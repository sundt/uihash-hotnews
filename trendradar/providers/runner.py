from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from trendradar.core import load_config
from trendradar.storage import StorageManager
from trendradar.storage.base import NewsData, NewsItem

from .base import ProviderFetchContext, ProviderFetchError, ProviderFetchResult
from .base import ProviderFetchContext, ProviderFetchError, ProviderFetchResult
from .registry import ProviderRegistry
from trendradar.web.db_online import get_online_db_conn



@dataclass(frozen=True)
class ProviderIngestionConfig:
    """Configuration for running provider ingestion."""

    enabled: bool
    platforms: List[Dict[str, Any]]


@dataclass(frozen=True)
class ProviderIngestionConfig:
    """Configuration for running provider ingestion."""

    enabled: bool
    platforms: List[Dict[str, Any]]


def _load_custom_sources(root: Path) -> List[Dict[str, Any]]:
    """Load custom sources from SQLite."""
    try:
        conn = get_online_db_conn(root)
        # Ensure table exists (in case schema.sql wasn't run separately, though it should be)
        # We rely on schema.sql having been applied, but we can double check or fail gracefully.
        cur = conn.execute("SELECT id, name, provider_type, config_json, enabled FROM custom_sources WHERE enabled = 1")
        rows = cur.fetchall()
        
        custom_platforms = []
        for r in rows:
            try:
                platform_id = str(r[0] or "").strip()
                name = str(r[1] or "").strip()
                provider = str(r[2] or "").strip()
                config_str = str(r[3] or "{}")
                
                if not platform_id or not provider:
                    continue
                    
                config = json.loads(config_str)
                if not isinstance(config, dict):
                    config = {}
                
                custom_platforms.append({
                    "id": platform_id,
                    "name": name,
                    "provider": provider,
                    "config": config
                })
            except Exception:
                continue
        return custom_platforms
    except Exception as e:
        print(f"Error loading custom sources: {e}")
        return []


def _parse_provider_ingestion_config(config: Dict[str, Any], project_root: Optional[Path] = None) -> ProviderIngestionConfig:
    raw = config.get("PROVIDER_INGESTION")
    
    # Defaults
    enabled_yaml = False
    platforms_yaml = []
    
    if isinstance(raw, dict):
        enabled_yaml = bool(raw.get("enabled", False))
        platforms = raw.get("platforms")
        if isinstance(platforms, list):
            platforms_yaml = platforms

    # Load custom sources from DB if project_root provided
    platforms_db = []
    if project_root:
        platforms_db = _load_custom_sources(project_root)

    # If neither (YAML enabled) nor (DB sources exist), then disabled. 
    # But usually we validly treat DB sources as enabled sources regardless of YAML master switch? 
    # Let's say YAML master switch controls YAML sources, DB sources are always enabled if they are in DB as enabled.
    
    all_platforms_raw = platforms_yaml + platforms_db
    if not all_platforms_raw:
        return ProviderIngestionConfig(enabled=False, platforms=[])

    cleaned: List[Dict[str, Any]] = []
    for it in all_platforms_raw:
        if not isinstance(it, dict):
            continue
        platform_id = str(it.get("id") or "").strip()
        platform_name = str(it.get("name") or platform_id).strip() if platform_id else ""
        provider_id = str(it.get("provider") or "").strip()
        platform_config = it.get("config")
        if not isinstance(platform_config, dict):
            platform_config = {}
        if not platform_id or not provider_id:
            continue
        cleaned.append({"id": platform_id, "name": platform_name, "provider": provider_id, "config": platform_config})

    return ProviderIngestionConfig(enabled=True, platforms=cleaned)


def _metrics_file_path(project_root: Path) -> Path:
    return project_root / "output" / "metrics" / "fetch_metrics.jsonl"


def _append_fetch_metrics_batch(project_root: Path, metrics: List[Dict[str, Any]]) -> None:
    if not metrics:
        return

    try:
        fp = _metrics_file_path(project_root)
        fp.parent.mkdir(parents=True, exist_ok=True)
        with fp.open("a", encoding="utf-8") as f:
            for m in metrics:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")

        # best-effort truncate
        try:
            lines = fp.read_text(encoding="utf-8").splitlines()
        except Exception:
            lines = []
        max_lines = 5000
        if len(lines) > max_lines:
            fp.write_text("\n".join(lines[-max_lines:]) + "\n", encoding="utf-8")
    except Exception:
        return


def run_provider_ingestion_once(
    *,
    registry: ProviderRegistry,
    project_root: str | Path,
    config_path: Optional[str | Path] = None,
    now: Optional[datetime] = None,
) -> Tuple[bool, List[Dict[str, Any]]]:
    """Run providers listed in config once and persist results via StorageManager.

    Returns:
        (success, metrics)
    """

    root = Path(project_root)
    cfg_path = Path(config_path) if config_path else (root / "config" / "config.yaml")

    config = load_config(str(cfg_path))
    config = load_config(str(cfg_path))
    ingestion_cfg = _parse_provider_ingestion_config(config, project_root=root)
    if not ingestion_cfg.enabled or not ingestion_cfg.platforms:
        return True, []

    now_dt = now or datetime.now()
    ctx = ProviderFetchContext(project_root=str(root), now=now_dt, config=config)

    # storage setup (reuse existing settings)
    storage_config = config.get("STORAGE", {}) if isinstance(config, dict) else {}
    storage = StorageManager(
        backend_type=storage_config.get("backend", "local"),
        data_dir=str(root / storage_config.get("local", {}).get("data_dir", "output")),
        enable_txt=storage_config.get("formats", {}).get("txt", False),
        enable_html=storage_config.get("formats", {}).get("html", False),
    )

    crawl_time = now_dt.strftime("%H:%M")
    crawl_date = now_dt.strftime("%Y-%m-%d")

    id_to_name: Dict[str, str] = {}
    items_by_id: Dict[str, List[NewsItem]] = {}
    failed_ids: List[str] = []
    batch_metrics: List[Dict[str, Any]] = []

    # Update database status for custom sources
    db_conn = None
    try:
        db_conn = get_online_db_conn(root)
    except Exception:
        pass

    for p in ingestion_cfg.platforms:
        platform_id = p["id"]
        platform_name = p.get("name") or platform_id
        provider_id = p["provider"]
        platform_config = p.get("config") if isinstance(p, dict) else {}
        if not isinstance(platform_config, dict):
            platform_config = {}

        started_at = time.time()
        status = "success"
        err = ""

        try:
            provider = registry.get(provider_id)
            result: ProviderFetchResult = provider.fetch(
                ctx=ctx,
                platform_id=platform_id,
                platform_name=platform_name,
                platform_config=platform_config,
            )

            normalized_items: List[NewsItem] = []
            for idx, it in enumerate(result.items, start=1):
                # Normalize to ensure platform association and crawl_time.
                normalized_items.append(
                    NewsItem(
                        title=it.title,
                        source_id=platform_id,
                        source_name=platform_name,
                        rank=int(it.rank) if it.rank else idx,
                        url=it.url or "",
                        mobile_url=it.mobile_url or "",
                        crawl_time=crawl_time,
                        ranks=it.ranks or ([int(it.rank)] if it.rank else [idx]),
                        first_time=it.first_time or crawl_time,
                        last_time=it.last_time or crawl_time,
                        count=it.count or 1,
                    )
                )

            items_by_id[platform_id] = normalized_items
            id_to_name[platform_id] = platform_name

            metric = dict(result.metric) if isinstance(result.metric, dict) else {}
            metric.setdefault("provider", provider_id)
            metric.setdefault("platform_id", platform_id)
            metric.setdefault("platform_name", platform_name)
            metric.setdefault("items_count", len(normalized_items))
            metric.setdefault("status", "success")
            metric.setdefault("error", "")

        except KeyError as e:
            status = "error"
            err = str(e)
            failed_ids.append(platform_id)
            metric = {
                "provider": provider_id,
                "platform_id": platform_id,
                "platform_name": platform_name,
                "status": status,
                "items_count": 0,
                "error": err,
            }

        except ProviderFetchError as e:
            status = "error"
            err = str(e)
            failed_ids.append(platform_id)
            metric = {
                "provider": provider_id,
                "platform_id": platform_id,
                "platform_name": platform_name,
                "status": status,
                "items_count": 0,
                "error": err,
            }

        except Exception as e:
            status = "error"
            err = str(e)
            failed_ids.append(platform_id)
            metric = {
                "provider": provider_id,
                "platform_id": platform_id,
                "platform_name": platform_name,
                "status": status,
                "items_count": 0,
                "error": err,
            }

        duration_ms = int((time.time() - started_at) * 1000)
        metric["duration_ms"] = metric.get("duration_ms") or duration_ms
        metric["fetched_at"] = now_dt.strftime("%Y-%m-%d %H:%M:%S")
        if status != "success":
            metric["status"] = "error"
            metric["error"] = err

        if status != "success":
            metric["status"] = "error"
            metric["error"] = err

        batch_metrics.append(metric)

        # Update custom_sources table if this platform is from DB (check existence)
        if db_conn:
            try:
                now_str_db = now_dt.strftime("%Y-%m-%d %H:%M:%S")
                # We update blindly; if id doesn't exist (it was from YAML), this is a no-op 
                # or we can check via "SELECT 1" but that's expensive.
                # Actually, standard update is safe.
                db_conn.execute("""
                    UPDATE custom_sources 
                    SET last_run_at = ?, last_status = ?, last_error = ?, updated_at = ?
                    WHERE id = ?
                """, (now_str_db, status, err, now_str_db, platform_id))
                db_conn.commit()
            except Exception:
                pass

    if items_by_id:
        data = NewsData(
            date=crawl_date,
            crawl_time=crawl_time,
            items=items_by_id,
            id_to_name=id_to_name,
            failed_ids=failed_ids,
        )
        storage.save_news_data(data)

    _append_fetch_metrics_batch(root, batch_metrics)

    return True, batch_metrics


def build_default_registry() -> ProviderRegistry:
    """Create a default registry for provider ingestion.

    Providers are registered by feature modules (e.g. caixin, nba). This default
    registry is intentionally empty until those modules are added.
    """

    reg = ProviderRegistry()
    try:
        from .caixin import CaixinProvider

        reg.register(CaixinProvider())
    except Exception:
        # provider optional; keep registry usable even if import fails
        pass

    try:
        from .tencent_nba import TencentNbaProvider

        reg.register(TencentNbaProvider())
    except Exception:
        # provider optional; keep registry usable even if import fails
        pass

    try:
        from .playwright_provider import PlaywrightProvider
        reg.register(PlaywrightProvider())
    except Exception:
        pass

    try:
        from .http_json import HttpJsonProvider

        reg.register(HttpJsonProvider())
    except Exception:
        # provider optional; keep registry usable even if import fails
        pass

    try:
        from .html_scraper import HtmlScraperProvider
        reg.register(HtmlScraperProvider())
    except Exception:
        pass

    return reg


def _main() -> int:
    root = Path(__file__).resolve().parents[2]
    config_path = root / "config" / "config.yaml"
    registry = build_default_registry()
    ok, metrics = run_provider_ingestion_once(
        registry=registry,
        project_root=root,
        config_path=config_path,
    )
    if not metrics:
        print("[provider-ingestion] no-op (disabled or no platforms configured)")
        return 0
    errors = [m for m in metrics if (m.get("status") or "") == "error"]
    print(f"[provider-ingestion] done: total={len(metrics)} error={len(errors)}")
    return 0 if ok and not errors else 2


if __name__ == "__main__":
    raise SystemExit(_main())
