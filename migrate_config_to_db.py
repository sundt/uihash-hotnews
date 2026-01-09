
import sys
import os
import json
import sqlite3
from pathlib import Path
import yaml

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from trendradar.web.db_online import get_online_db_conn

def migrate():
    config_path = project_root / "config" / "config.yaml"
    if not config_path.exists():
        print("Config file not found.")
        return

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    platforms = config.get("provider_ingestion", {}).get("platforms", [])
    if not platforms:
        print("No provider ingestion platforms found in config.")
        return

    conn = get_online_db_conn(project_root)
    count = 0
    
    print(f"Found {len(platforms)} platforms to migrate.")

    for p in platforms:
        pid = p.get("id")
        name = p.get("name")
        provider = p.get("provider")
        conf = p.get("config", {})
        
        if not pid or not provider:
            print(f"Skipping invalid platform: {p}")
            continue

        print(f"Migrating {pid} ({provider})...")
        
        # Check if exists
        cur = conn.execute("SELECT id FROM custom_sources WHERE id = ?", (pid,))
        if cur.fetchone():
            print(f"  - Already exists, skipping.")
            continue
            
        conf_str = json.dumps(conf, ensure_ascii=False, indent=2)
        
        try:
            conn.execute(
                "INSERT INTO custom_sources (id, name, provider_type, config_json, enabled, updated_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)",
                (pid, name, provider, conf_str)
            )
            count += 1
        except Exception as e:
            print(f"  - Error inserting {pid}: {e}")

    conn.commit()
    print(f"Migration complete. Imported {count} new sources.")

if __name__ == "__main__":
    migrate()
