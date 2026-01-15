#!/usr/bin/env python3
"""
Migration: Add use_scraperapi column to rss_sources and custom_sources tables
"""
import sqlite3
import sys
from pathlib import Path

def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Migrate rss_sources
    cur.execute("PRAGMA table_info(rss_sources)")
    rss_columns = [row[1] for row in cur.fetchall()]
    
    if 'use_scraperapi' not in rss_columns:
        print("Adding 'use_scraperapi' column to rss_sources table...")
        cur.execute("ALTER TABLE rss_sources ADD COLUMN use_scraperapi INTEGER NOT NULL DEFAULT 0")
    else:
        print("Column 'use_scraperapi' already exists in rss_sources table")
    
    # Migrate custom_sources
    cur.execute("PRAGMA table_info(custom_sources)")
    custom_columns = [row[1] for row in cur.fetchall()]
    
    if 'use_scraperapi' not in custom_columns:
        print("Adding 'use_scraperapi' column to custom_sources table...")
        cur.execute("ALTER TABLE custom_sources ADD COLUMN use_scraperapi INTEGER NOT NULL DEFAULT 0")
    else:
        print("Column 'use_scraperapi' already exists in custom_sources table")
    
    conn.commit()
    print("Migration completed successfully")
    conn.close()

if __name__ == "__main__":
    # Default path
    db_path = Path(__file__).parent.parent / "output" / "online.db"
    
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        sys.exit(1)
    
    migrate(str(db_path))
