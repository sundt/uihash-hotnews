import argparse
import csv
import hashlib
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse


def _now_ts() -> int:
    return int(datetime.now().timestamp())


def _md5_hex(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def _validate_and_normalize_url(raw_url: str) -> str:
    u = (raw_url or "").strip()
    if not u:
        raise ValueError("Missing url")
    parsed = urlparse(u)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Invalid url scheme")
    if not parsed.netloc:
        raise ValueError("Invalid url")
    if parsed.username or parsed.password:
        raise ValueError("Invalid url")

    normalized = parsed._replace(fragment="").geturl().strip()
    return normalized


def _extract_host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").strip().lower() or "-"
    except Exception:
        return "-"


def _looks_like_sqlite_db(path: Path) -> bool:
    try:
        if not path.exists():
            return True
        if path.stat().st_size < 16:
            return False
        with path.open("rb") as f:
            head = f.read(16)
        return head.startswith(b"SQLite format 3\x00")
    except Exception:
        return False


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

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

    def _ensure_column(table: str, column: str, col_def: str) -> None:
        cur = conn.execute(f"PRAGMA table_info({table})")
        cols = {str(r[1]) for r in (cur.fetchall() or [])}
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")

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

    try:
        conn.execute("UPDATE rss_sources SET added_at = created_at WHERE (added_at IS NULL OR added_at = 0) AND created_at > 0")
    except Exception:
        pass

    conn.commit()


@dataclass(frozen=True)
class FeedRow:
    name: str
    url: str
    category: str
    feed_type: str
    country: str
    language: str
    source: str
    seed_last_updated: str


def _read_csv_rows(csv_path: Path) -> Iterable[Tuple[int, Dict[str, str]]]:
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            if not isinstance(row, dict):
                continue
            normalized: Dict[str, str] = {}
            for k, v in row.items():
                kk = str(k or "").strip()
                vv = str(v or "").strip()
                if kk:
                    normalized[kk] = vv
            yield i, normalized


def _parse_feed_row(line_no: int, row: Dict[str, str]) -> FeedRow:
    name = (row.get("标题") or "").strip()
    url_raw = (row.get("订阅地址") or "").strip()
    last_updated = (row.get("最后更新") or "").strip()
    category = (row.get("分类") or "").strip()
    feed_type = (row.get("类型") or "").strip()
    country = (row.get("国家") or "").strip()
    language = (row.get("语言") or "").strip()
    source = (row.get("来源") or "").strip()

    url = _validate_and_normalize_url(url_raw)
    if not name:
        name = _extract_host(url)

    return FeedRow(
        name=name,
        url=url,
        category=category,
        feed_type=feed_type,
        country=country,
        language=language,
        source=source,
        seed_last_updated=last_updated,
    )


def _upsert_source(
    *,
    conn: sqlite3.Connection,
    feed: FeedRow,
    now: int,
    write: bool,
) -> str:
    cur = conn.execute("SELECT id FROM rss_sources WHERE url = ? LIMIT 1", (feed.url,))
    row = cur.fetchone()
    if row and str(row[0] or "").strip():
        sid = str(row[0]).strip()
        if write:
            conn.execute(
                """
                UPDATE rss_sources
                SET name = ?,
                    host = ?,
                    category = ?,
                    feed_type = ?,
                    country = ?,
                    language = ?,
                    source = ?,
                    seed_last_updated = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    feed.name,
                    _extract_host(feed.url),
                    feed.category,
                    feed.feed_type,
                    feed.country,
                    feed.language,
                    feed.source,
                    feed.seed_last_updated,
                    now,
                    sid,
                ),
            )
        return "updated"

    host = _extract_host(feed.url)
    sid = f"rsssrc-{_md5_hex(feed.url)[:12]}"

    if write:
        conn.execute(
            """
            INSERT OR IGNORE INTO rss_sources(
                id, name, url, host, category, feed_type, country, language, source, seed_last_updated,
                enabled, created_at, updated_at, added_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (
                sid,
                feed.name,
                feed.url,
                host,
                feed.category,
                feed.feed_type,
                feed.country,
                feed.language,
                feed.source,
                feed.seed_last_updated,
                now,
                now,
                now,
            ),
        )
        cur2 = conn.execute("SELECT changes()")
        changes = int((cur2.fetchone() or [0])[0] or 0)
        return "inserted" if changes > 0 else "skipped"

    return "inserted"


def run_import(*, csv_path: Path, db_path: Path, write: bool) -> Dict[str, int]:
    seen_urls: Dict[str, int] = {}
    feeds: List[FeedRow] = []

    only_sources: Optional[set] = None
    try:
        only_sources = getattr(run_import, "_only_sources", None)
    except Exception:
        only_sources = None

    invalid = 0
    duplicates = 0

    for line_no, row in _read_csv_rows(csv_path):
        try:
            feed = _parse_feed_row(line_no, row)
        except Exception:
            invalid += 1
            continue

        if only_sources is not None and feed.source not in only_sources:
            continue

        if feed.url in seen_urls:
            duplicates += 1
            continue
        seen_urls[feed.url] = line_no
        feeds.append(feed)

    existing_urls: set = set()
    conn: Optional[sqlite3.Connection] = None

    if write:
        if not _looks_like_sqlite_db(db_path):
            raise ValueError(
                f"DB file exists but is not a valid SQLite database: {db_path}. "
                "Please import into a new db path (e.g. output/online.NEW.db) and then replace online.db after verification."
            )
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        _ensure_schema(conn)
        cur = conn.execute("SELECT url FROM rss_sources")
        existing_urls = {str(r[0] or "").strip() for r in (cur.fetchall() or [])}
        existing_urls.discard("")
    else:
        if db_path.exists():
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            try:
                cur = conn.execute("SELECT url FROM rss_sources")
                existing_urls = {str(r[0] or "").strip() for r in (cur.fetchall() or [])}
                existing_urls.discard("")
            except Exception:
                existing_urls = set()
            finally:
                conn.close()
                conn = None

    now = _now_ts()
    inserted = 0
    updated = 0
    skipped = 0

    if write:
        assert conn is not None
        try:
            for feed in feeds:
                status = _upsert_source(conn=conn, feed=feed, now=now, write=True)
                if status == "inserted":
                    inserted += 1
                elif status == "updated":
                    updated += 1
                else:
                    skipped += 1
            conn.commit()
        finally:
            conn.close()
    else:
        for feed in feeds:
            if feed.url in existing_urls:
                updated += 1
            else:
                inserted += 1

    return {
        "total_rows": len(seen_urls) + duplicates + invalid,
        "unique_urls": len(seen_urls),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "duplicates": duplicates,
        "invalid": invalid,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", dest="csv_path", default="rss_feeds.csv")
    ap.add_argument("--db", dest="db_path", default="output/online.db")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--only-source", action="append", default=None)
    args = ap.parse_args()

    csv_path = Path(str(args.csv_path)).expanduser().resolve()
    db_path = Path(str(args.db_path)).expanduser().resolve()

    only_sources = None
    if isinstance(args.only_source, list) and args.only_source:
        only_sources = {str(x).strip() for x in args.only_source if str(x).strip()}
        if only_sources:
            setattr(run_import, "_only_sources", only_sources)

    stats = run_import(csv_path=csv_path, db_path=db_path, write=bool(args.write))
    mode = "WRITE" if bool(args.write) else "DRY_RUN"
    print(f"mode={mode}")
    print(f"csv={csv_path}")
    print(f"db={db_path}")
    for k in [
        "total_rows",
        "unique_urls",
        "inserted",
        "updated",
        "skipped",
        "duplicates",
        "invalid",
    ]:
        print(f"{k}={stats.get(k, 0)}")


if __name__ == "__main__":
    main()
