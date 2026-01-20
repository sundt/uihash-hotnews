import hashlib
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


_user_db_conn: Optional[sqlite3.Connection] = None


def _now_ts() -> int:
    return int(time.time())


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _user_db_path(project_root: Path) -> Path:
    output_dir = project_root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / "user.db"


def get_user_db_conn(project_root: Path) -> sqlite3.Connection:
    global _user_db_conn

    if _user_db_conn is not None:
        try:
            _user_db_conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_rss_subscription_adds (
                    user_id INTEGER NOT NULL,
                    source_id TEXT NOT NULL,
                    first_added_at INTEGER NOT NULL,
                    PRIMARY KEY(user_id, source_id)
                )
                """
            )
            _user_db_conn.commit()
        except Exception:
            pass
        return _user_db_conn

    db_path = _user_db_path(project_root)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            identity_type TEXT NOT NULL,
            identity_key TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL,
            revoked_at INTEGER NOT NULL DEFAULT 0,
            UNIQUE(identity_type, identity_key)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_rss_subscriptions (
            user_id INTEGER NOT NULL,
            source_id TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            column TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, source_id)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_rss_subscription_adds (
            user_id INTEGER NOT NULL,
            source_id TEXT NOT NULL,
            first_added_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, source_id)
        )
        """
    )

    # User sessions for authenticated users
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            device_info TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            last_active_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)")

    # OAuth and multi-auth methods
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_auth_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            auth_type TEXT NOT NULL,
            auth_id TEXT NOT NULL,
            auth_data TEXT DEFAULT '{}',
            created_at INTEGER NOT NULL,
            last_used_at INTEGER NOT NULL,
            UNIQUE(auth_type, auth_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_auth_methods_user ON user_auth_methods(user_id)")

    # User tag preferences for personalization
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_tag_preferences (
            user_id INTEGER NOT NULL,
            tag_id TEXT NOT NULL,
            click_count INTEGER DEFAULT 0,
            view_time_seconds INTEGER DEFAULT 0,
            last_interaction_at INTEGER,
            preference_score REAL DEFAULT 0.0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, tag_id)
        )
        """
    )

    # User explicit tag settings (follow/mute)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_tag_settings (
            user_id INTEGER NOT NULL,
            tag_id TEXT NOT NULL,
            preference TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, tag_id)
        )
        """
    )

    # Extend users table with auth columns
    def _ensure_column(table: str, column: str, col_def: str) -> None:
        try:
            cur = conn.execute(f"PRAGMA table_info({table})")
            cols = {str(r[1]) for r in (cur.fetchall() or [])}
            if column not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
        except Exception:
            pass

    _ensure_column("users", "email", "TEXT DEFAULT ''")
    _ensure_column("users", "email_verified", "INTEGER DEFAULT 0")
    _ensure_column("users", "password_hash", "TEXT DEFAULT ''")
    _ensure_column("users", "nickname", "TEXT DEFAULT ''")
    _ensure_column("users", "avatar_url", "TEXT DEFAULT ''")
    _ensure_column("users", "status", "TEXT DEFAULT 'active'")

    # Extend news_clicks for preference tracking
    _ensure_column("news_clicks", "tags_json", "TEXT DEFAULT '[]'") if False else None  # news_clicks is in online.db
    
    # User custom keywords for personalized content matching
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keyword TEXT NOT NULL,
            keyword_type TEXT DEFAULT 'exact',
            case_sensitive INTEGER DEFAULT 0,
            match_whole_word INTEGER DEFAULT 0,
            priority INTEGER DEFAULT 0,
            is_exclude INTEGER DEFAULT 0,
            auto_expand INTEGER DEFAULT 1,
            match_count INTEGER DEFAULT 0,
            last_matched_at INTEGER,
            related_tags TEXT DEFAULT '[]',
            enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(user_id, keyword)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_keywords_user ON user_keywords(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_keywords_enabled ON user_keywords(user_id, enabled)")
    
    # ========== WeChat MP (公众号) Tables ==========
    
    # 微信公众号认证信息（每个用户一份）
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wechat_mp_auth (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            cookie_encrypted TEXT NOT NULL,
            token TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            expires_at INTEGER,
            status TEXT DEFAULT 'valid',
            last_error TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_mp_auth_user ON wechat_mp_auth(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_mp_auth_status ON wechat_mp_auth(status)")
    
    # 用户订阅的公众号
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wechat_mp_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            fakeid TEXT NOT NULL,
            nickname TEXT NOT NULL,
            round_head_img TEXT,
            signature TEXT,
            subscribed_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, fakeid)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_mp_subs_user ON wechat_mp_subscriptions(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_mp_subs_fakeid ON wechat_mp_subscriptions(fakeid)")
    
    conn.commit()
    _user_db_conn = conn
    return conn


def resolve_user_id_by_cookie_token(
    *, conn: sqlite3.Connection, token: str, identity_type: str = "anon_cookie"
) -> Optional[int]:
    tok = (token or "").strip()
    if not tok:
        return None
    key = _sha256_hex(tok)
    cur = conn.execute(
        "SELECT user_id, revoked_at FROM user_identities WHERE identity_type = ? AND identity_key = ?",
        (identity_type, key),
    )
    row = cur.fetchone()
    if not row:
        return None
    user_id = int(row[0] or 0)
    revoked_at = int(row[1] or 0)
    if user_id <= 0 or revoked_at > 0:
        return None

    now = _now_ts()
    try:
        conn.execute(
            "UPDATE user_identities SET last_seen_at = ? WHERE identity_type = ? AND identity_key = ?",
            (now, identity_type, key),
        )
        conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now, user_id))
        conn.commit()
    except Exception:
        pass

    return user_id


def create_user_with_cookie_identity(
    *, conn: sqlite3.Connection, token: str, identity_type: str = "anon_cookie"
) -> int:
    tok = (token or "").strip()
    if not tok:
        raise ValueError("Missing token")

    key = _sha256_hex(tok)
    now = _now_ts()

    cur = conn.execute(
        "SELECT user_id, revoked_at FROM user_identities WHERE identity_type = ? AND identity_key = ?",
        (identity_type, key),
    )
    row = cur.fetchone()
    if row:
        user_id = int(row[0] or 0)
        revoked_at = int(row[1] or 0)
        if user_id > 0 and revoked_at <= 0:
            return user_id

    conn.execute("INSERT INTO users(created_at, last_seen_at) VALUES(?, ?)", (now, now))
    user_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    conn.execute(
        "INSERT OR REPLACE INTO user_identities(user_id, identity_type, identity_key, created_at, last_seen_at, revoked_at) VALUES(?, ?, ?, ?, ?, 0)",
        (user_id, identity_type, key, now, now),
    )
    conn.commit()
    return user_id


def list_rss_subscriptions(*, conn: sqlite3.Connection, user_id: int) -> List[Dict[str, Any]]:
    cur = conn.execute(
        "SELECT source_id, display_name, column FROM user_rss_subscriptions WHERE user_id = ? ORDER BY updated_at DESC",
        (int(user_id),),
    )
    rows = cur.fetchall() or []
    out: List[Dict[str, Any]] = []
    for r in rows:
        sid = str(r[0] or "").strip()
        if sid.startswith("rss-"):
            sid = sid[len("rss-") :].strip()
        out.append(
            {
                "source_id": sid,
                "feed_title": str(r[1] or "").strip(),
                "column": str(r[2] or "").strip() or "RSS",
                "platform_id": "",
            }
        )
    return [x for x in out if x.get("source_id")]


def replace_rss_subscriptions(
    *,
    conn: sqlite3.Connection,
    user_id: int,
    subscriptions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    now = _now_ts()

    try:
        cur = conn.execute(
            "SELECT source_id FROM user_rss_subscriptions WHERE user_id = ?",
            (int(user_id),),
        )
        old_rows = cur.fetchall() or []
        old_set = set()
        for r in old_rows:
            sid0 = str(r[0] or "").strip()
            if not sid0:
                continue
            if sid0.startswith("rss-"):
                sid0 = sid0[len("rss-") :].strip()
            if sid0:
                old_set.add(sid0)
    except Exception:
        old_set = set()

    normalized: List[Tuple[str, str, str]] = []
    for s in subscriptions or []:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("source_id") or s.get("rss_source_id") or "").strip()
        if not sid:
            continue
        if sid.startswith("rss-"):
            sid = sid[len("rss-") :].strip()
        if not sid:
            continue
        display_name = str(s.get("feed_title") or s.get("display_name") or "").strip()
        column = str(s.get("column") or "RSS").strip() or "RSS"
        normalized.append((sid, display_name, column))

    seen = set()
    uniq: List[Tuple[str, str, str]] = []
    for sid, dn, col in normalized:
        if sid in seen:
            continue
        seen.add(sid)
        uniq.append((sid, dn, col))

    try:
        new_set = {sid for sid, _, _ in uniq if sid}
        newly_added = [sid for sid in new_set if sid not in old_set]
        for sid in newly_added:
            conn.execute(
                "INSERT OR IGNORE INTO user_rss_subscription_adds(user_id, source_id, first_added_at) VALUES(?, ?, ?)",
                (int(user_id), str(sid), int(now)),
            )
    except Exception:
        pass

    conn.execute("DELETE FROM user_rss_subscriptions WHERE user_id = ?", (int(user_id),))
    for sid, dn, col in uniq:
        conn.execute(
            "INSERT INTO user_rss_subscriptions(user_id, source_id, display_name, column, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)",
            (int(user_id), sid, dn, col, now, now),
        )
    conn.commit()

    return list_rss_subscriptions(conn=conn, user_id=user_id)


def subscriber_counts(*, conn: sqlite3.Connection) -> Dict[str, int]:
    cur = conn.execute(
        "SELECT source_id, COUNT(*) as c FROM user_rss_subscriptions GROUP BY source_id"
    )
    rows = cur.fetchall() or []
    out: Dict[str, int] = {}
    for r in rows:
        sid = str(r[0] or "").strip()
        if not sid:
            continue
        if sid.startswith("rss-"):
            sid = sid[len("rss-") :].strip()
        if not sid:
            continue
        out[sid] = out.get(sid, 0) + int(r[1] or 0)
    return out


def added_counts(*, conn: sqlite3.Connection) -> Dict[str, int]:
    cur = conn.execute(
        "SELECT source_id, COUNT(*) as c FROM user_rss_subscription_adds GROUP BY source_id"
    )
    rows = cur.fetchall() or []
    out: Dict[str, int] = {}
    for r in rows:
        sid = str(r[0] or "").strip()
        if not sid:
            continue
        if sid.startswith("rss-"):
            sid = sid[len("rss-") :].strip()
        if not sid:
            continue
        out[sid] = out.get(sid, 0) + int(r[1] or 0)
    return out
