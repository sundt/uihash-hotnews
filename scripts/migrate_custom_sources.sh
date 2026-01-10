#!/bin/bash
# Migration script to add new fields to custom_sources table

DB_PATH="${1:-output/online.db}"

echo "Migrating custom_sources table..."

# Check and add backoff_until if not exists
sqlite3 "$DB_PATH" "PRAGMA table_info(custom_sources);" | grep -q "backoff_until" || \
  sqlite3 "$DB_PATH" "ALTER TABLE custom_sources ADD COLUMN backoff_until TEXT DEFAULT NULL;" 2>/dev/null
echo "✓ backoff_until field checked/added"

# Add entries_count if not exists
sqlite3 "$DB_PATH" "PRAGMA table_info(custom_sources);" | grep -q "entries_count" || \
  sqlite3 "$DB_PATH" "ALTER TABLE custom_sources ADD COLUMN entries_count INTEGER DEFAULT 0;" 2>/dev/null
echo "✓ entries_count field checked/added"

# Add fail_count if not exists
sqlite3 "$DB_PATH" "PRAGMA table_info(custom_sources);" | grep -q "fail_count" || \
  sqlite3 "$DB_PATH" "ALTER TABLE custom_sources ADD COLUMN fail_count INTEGER DEFAULT 0;" 2>/dev/null
echo "✓ fail_count field checked/added"

echo "✅ Migration complete!"
