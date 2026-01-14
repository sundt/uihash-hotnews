#!/usr/bin/env python3
"""
Migration: Add use_scraperapi column to rss_sources table
"""
import sqlite3
import sys
from pathlib import Path

def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Check if column already exists
    cur.execute("PRAGMA table_info(rss_sources)")
    columns = [row[1] for row in cur.fetchall()]
    
    if 'use_scraperapi' in columns:
        print("Column 'use_scraperapi' already exists in rss_sources table")
        return
    
    print("Adding 'use_scraperapi' column to rss_sources table...")
    cur.execute("ALTER TABLE rss_sources ADD COLUMN use_scraperapi INTEGER NOT NULL DEFAULT 0")
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
