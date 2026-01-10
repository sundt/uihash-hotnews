import sqlite3
from pathlib import Path
from typing import Optional


_online_db_conn: Optional[sqlite3.Connection] = None


def get_online_db_conn(project_root: Path) -> sqlite3.Connection:
    global _online_db_conn

    if _online_db_conn is not None:
        return _online_db_conn

    output_dir = project_root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "online.db"

    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    conn.execute(
        "CREATE TABLE IF NOT EXISTS online_sessions (session_id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL)"
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            day TEXT NOT NULL,
            client_key TEXT NOT NULL,
            subs_count INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_usage_events_day ON rss_usage_events(day)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_usage_events_ts ON rss_usage_events(ts)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_usage_events_client ON rss_usage_events(client_key)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            host TEXT NOT NULL,
            category TEXT DEFAULT '',
            cadence TEXT NOT NULL DEFAULT 'P4',
            next_due_at INTEGER NOT NULL DEFAULT 0,
            last_attempt_at INTEGER NOT NULL DEFAULT 0,
            etag TEXT NOT NULL DEFAULT '',
            last_modified TEXT NOT NULL DEFAULT '',
            fail_count INTEGER NOT NULL DEFAULT 0,
            backoff_until INTEGER NOT NULL DEFAULT 0,
            last_error_reason TEXT NOT NULL DEFAULT '',
            enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            added_at INTEGER NOT NULL DEFAULT 0
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_source_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            host TEXT NOT NULL,
            title TEXT NOT NULL,
            note TEXT DEFAULT '',
            status TEXT NOT NULL,
            reason TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            reviewed_at INTEGER DEFAULT 0,
            source_id TEXT DEFAULT ''
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            dedup_key TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            published_at INTEGER NOT NULL DEFAULT 0,
            published_raw TEXT NOT NULL DEFAULT '',
            fetched_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(source_id, dedup_key)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_pub ON rss_entries(source_id, published_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_pub ON rss_entries(published_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_created ON rss_entries(source_id, created_at DESC)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_entry_ai_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            dedup_key TEXT NOT NULL,
            url TEXT NOT NULL,
            domain TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            action TEXT NOT NULL,
            score INTEGER NOT NULL,
            confidence REAL NOT NULL,
            reason TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            labeled_at INTEGER NOT NULL,
            error TEXT NOT NULL DEFAULT '',
            UNIQUE(source_id, dedup_key)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entry_ai_labels_labeled_at ON rss_entry_ai_labels(labeled_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entry_ai_labels_action_score ON rss_entry_ai_labels(action, score DESC)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            config_json TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 1,
            schedule_cron TEXT,
            category TEXT DEFAULT '', 
            country TEXT DEFAULT '',
            language TEXT DEFAULT '',
            last_run_at TEXT,
            last_status TEXT,
            last_error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS newsnow_platforms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT DEFAULT '',
            enabled BOOLEAN DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            last_fetch_at TEXT,
            last_status TEXT,
            last_error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS platform_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '📰',
            sort_order INTEGER DEFAULT 0,
            enabled BOOLEAN DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    def _ensure_column(table: str, column: str, col_def: str) -> None:
        try:
            cur = conn.execute(f"PRAGMA table_info({table})")
            cols = {str(r[1]) for r in (cur.fetchall() or [])}
            if column not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
        except Exception:
            return

    _ensure_column("rss_sources", "category", "TEXT DEFAULT ''")
    _ensure_column("rss_sources", "cadence", "TEXT NOT NULL DEFAULT 'P4'")
    _ensure_column("rss_sources", "next_due_at", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "last_attempt_at", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "etag", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "last_modified", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "fail_count", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "backoff_until", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "last_error_reason", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "feed_type", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "country", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "language", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "source", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "seed_last_updated", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "added_at", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "scrape_rules", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_source_requests", "title", "TEXT NOT NULL DEFAULT ''")
    
    # Custom Sources columns
    _ensure_column("custom_sources", "category", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "country", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "language", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "backoff_until", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "entries_count", "INTEGER DEFAULT 0")
    _ensure_column("custom_sources", "fail_count", "INTEGER DEFAULT 0")
    _ensure_column("custom_sources", "script_content", "TEXT DEFAULT ''")

    try:
        conn.execute("UPDATE rss_sources SET added_at = created_at WHERE (added_at IS NULL OR added_at = 0) AND created_at > 0")
    except Exception:
        pass

    conn.commit()

    _online_db_conn = conn
    return conn
