"""One-off migration: add items.created_at/updated_at/last_used_at columns
and seed the 6 new empty pools requested in round-2 feedback. Idempotent —
safe to rerun (checks for existing columns/pools before adding)."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "prompt_manager.db"

NEW_POOLS = [
    ("headcount", "人数", 100),
    ("outfit", "服装", 101),
    ("background", "背景", 102),
    ("bodytype", "体型", 103),
    ("restraint", "拘束", 104),
    ("accessory", "小物", 105),
]


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(items)")}
    if "created_at" not in existing_cols:
        cur.execute("ALTER TABLE items ADD COLUMN created_at TEXT")
        cur.execute("UPDATE items SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
        print("added items.created_at")
    if "updated_at" not in existing_cols:
        cur.execute("ALTER TABLE items ADD COLUMN updated_at TEXT")
        cur.execute("UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")
        print("added items.updated_at")
    if "last_used_at" not in existing_cols:
        cur.execute("ALTER TABLE items ADD COLUMN last_used_at TEXT")
        print("added items.last_used_at")

    for key, display_name, sort_order in NEW_POOLS:
        cur.execute("SELECT 1 FROM pools WHERE key = ?", (key,))
        if cur.fetchone() is None:
            cur.execute(
                "INSERT INTO pools (key, display_name, sort_order) VALUES (?, ?, ?)",
                (key, display_name, sort_order),
            )
            print(f"added pool {key} ({display_name})")
        else:
            print(f"pool {key} already exists, skipped")

    conn.commit()
    conn.close()
    print("done")


if __name__ == "__main__":
    main()
