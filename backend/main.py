# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any
from datetime import datetime
import sqlite3
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Database init
def init_db():
    conn = sqlite3.connect("scheduler.db")
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS scheduled_events (
            id TEXT PRIMARY KEY,
            event_json TEXT NOT NULL,
            publish_at TEXT NOT NULL,
            sent INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

    # Create relays.json if not exists
    default_relays = [
        "wss://relay.damus.io",
        "wss://nostr-pub.wellorder.net",
        "wss://nos.lol",
        "wss://relay.snort.social",
        "wss://offchain.pub",
        "wss://nostr.mom"
    ]
    if not os.path.exists("relays.json"):
        with open("relays.json", "w") as f:
            json.dump(default_relays, f, indent=2)

init_db()

# Models
class ScheduledEvent(BaseModel):
    event: dict[str, Any]
    publish_at: str  # ISO 8601

# API endpoints
@app.post("/schedule")
def schedule_event(data: ScheduledEvent):
    try:
        event_id = data.event.get("id")
        if not event_id:
            raise HTTPException(status_code=400, detail="Missing event ID")

        # Store in database
        conn = sqlite3.connect("scheduler.db")
        c = conn.cursor()
        c.execute("INSERT INTO scheduled_events (id, event_json, publish_at) VALUES (?, ?, ?)",
                  (event_id, json.dumps(data.event), data.publish_at))
        conn.commit()
        conn.close()
        return {"status": "ok", "event_id": event_id}

    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Event already scheduled")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/scheduled")
def get_scheduled(pubkey: str | None = None):
    """
    Si se suministra ?pubkey=..., solo devuelve
    las notas cuyo event_json.pubkey coincide.
    """
    try:
        conn = sqlite3.connect("scheduler.db")
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        if pubkey:
            c.execute(
                """
                SELECT id, event_json, publish_at, sent
                FROM scheduled_events
                WHERE json_extract(event_json, '$.pubkey') = ?
                ORDER BY publish_at DESC
                """,
                (pubkey,)
            )
        else:
            c.execute(
                """
                SELECT id, event_json, publish_at, sent
                FROM scheduled_events
                ORDER BY publish_at DESC
                """
            )

        rows = c.fetchall()
        events = []
        for row in rows:
            event_data = json.loads(row["event_json"])
            events.append({
                "id": row["id"],
                "content": event_data.get("content", ""),
                "publish_at": row["publish_at"],
                "sent": bool(row["sent"])
            })

        conn.close()
        return events

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

