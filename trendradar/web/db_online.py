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
            updated_at INTEGER NOT NULL
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
    _ensure_column("rss_source_requests", "title", "TEXT NOT NULL DEFAULT ''")

    conn.commit()

    _online_db_conn = conn
    return conn
