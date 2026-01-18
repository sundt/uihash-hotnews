import sqlite3
import os

db_path = "hotnews/output/online.db"
# Fallback for different cwd
if not os.path.exists(db_path):
    db_path = "output/online.db"

if not os.path.exists(db_path):
    print(f"Database not found. Checked: hotnews/output/online.db and output/online.db. CWD: {os.getcwd()}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- AI Category Distribution ---")
try:
    cursor.execute("SELECT category, COUNT(*) as cnt FROM rss_entry_ai_labels GROUP BY category ORDER BY cnt DESC LIMIT 20")
    rows = cursor.fetchall()
    if not rows:
        print("No AI labels found.")
    for row in rows:
        print(f"{row[0]}: {row[1]}")
except Exception as e:
    print("Error querying categories:", e)

print("\n--- Action Distribution ---")
try:
    cursor.execute("SELECT action, COUNT(*) as cnt FROM rss_entry_ai_labels GROUP BY action ORDER BY cnt DESC")
    rows = cursor.fetchall()
    for row in rows:
        print(f"{row[0]}: {row[1]}")
except Exception as e:
    print("Error querying actions:", e)

conn.close()
