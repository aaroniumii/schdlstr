from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from config import configure_logging, settings

configure_logging()

logger = logging.getLogger(__name__)

DB_PATH = settings.database_path
RELAYS_PATH = settings.relays_path

app = FastAPI()


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS scheduled_events (
                id TEXT PRIMARY KEY,
                event_json TEXT NOT NULL,
                publish_at TEXT NOT NULL,
                sent INTEGER DEFAULT 0,
                status TEXT DEFAULT 'scheduled',
                attempt_count INTEGER DEFAULT 0,
                last_error TEXT,
                last_attempt_at TEXT,
                next_attempt_at TEXT
            )
            """
        )
        existing_columns = {row[1] for row in c.execute("PRAGMA table_info(scheduled_events)")}
        column_alters = {
            "status": "ALTER TABLE scheduled_events ADD COLUMN status TEXT DEFAULT 'scheduled'",
            "attempt_count": "ALTER TABLE scheduled_events ADD COLUMN attempt_count INTEGER DEFAULT 0",
            "last_error": "ALTER TABLE scheduled_events ADD COLUMN last_error TEXT",
            "last_attempt_at": "ALTER TABLE scheduled_events ADD COLUMN last_attempt_at TEXT",
            "next_attempt_at": "ALTER TABLE scheduled_events ADD COLUMN next_attempt_at TEXT",
        }
        for column, statement in column_alters.items():
            if column not in existing_columns:
                c.execute(statement)
        conn.commit()

    default_relays = [
        "wss://relay.damus.io",
        "wss://nostr-pub.wellorder.net",
        "wss://nos.lol",
        "wss://relay.snort.social",
        "wss://offchain.pub",
        "wss://nostr.mom",
    ]
    if not RELAYS_PATH.exists():
        RELAYS_PATH.write_text(json.dumps(default_relays, indent=2), encoding="utf-8")


DB_PATH.parent.mkdir(parents=True, exist_ok=True)
RELAYS_PATH.parent.mkdir(parents=True, exist_ok=True)
init_db()


class ScheduledEvent(BaseModel):
    event: dict[str, Any]
    publish_at: str


def _parse_publish_at(publish_at: str) -> datetime:
    try:
        normalized = publish_at.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid publish_at format") from exc

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@app.post("/schedule")
def schedule_event(data: ScheduledEvent):
    publish_at_dt = _parse_publish_at(data.publish_at)
    if publish_at_dt <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="publish_at must be in the future")

    event_id = data.event.get("id")
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing event ID")

    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO scheduled_events (
                    id,
                    event_json,
                    publish_at,
                    sent,
                    status,
                    attempt_count,
                    last_error,
                    last_attempt_at,
                    next_attempt_at
                ) VALUES (?, ?, ?, 0, 'scheduled', 0, NULL, NULL, NULL)
                """,
                (event_id, json.dumps(data.event), publish_at_dt.isoformat()),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Event already scheduled") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    logger.info("Scheduled event %s for %s", event_id, publish_at_dt.isoformat())
    return {"status": "ok", "event_id": event_id}


@app.get("/scheduled")
def get_scheduled(pubkey: str | None = None):
    query = """
        SELECT id, event_json, publish_at, sent, status, attempt_count, last_error, last_attempt_at, next_attempt_at
        FROM scheduled_events
    """
    params: tuple[str, ...] = ()
    if pubkey:
        query += " WHERE json_extract(event_json, '$.pubkey') = ?"
        params = (pubkey,)
    query += " ORDER BY publish_at DESC"

    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(query, params)
            rows = c.fetchall()
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    events = []
    for row in rows:
        event_data = json.loads(row["event_json"])
        events.append(
            {
                "id": row["id"],
                "content": event_data.get("content", ""),
                "publish_at": row["publish_at"],
                "sent": bool(row["sent"]),
                "status": row["status"],
                "attempt_count": row["attempt_count"],
                "last_error": row["last_error"],
                "last_attempt_at": row["last_attempt_at"],
                "next_attempt_at": row["next_attempt_at"],
            }
        )

    return events


@app.post("/scheduled/{event_id}/retry")
def retry_event(event_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM scheduled_events WHERE id = ?", (event_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")

        c.execute(
            """
            UPDATE scheduled_events
            SET sent = 0,
                status = 'scheduled',
                attempt_count = 0,
                last_error = NULL,
                last_attempt_at = NULL,
                next_attempt_at = NULL
            WHERE id = ?
            """,
            (event_id,),
        )
        conn.commit()

    logger.info("Event %s marked for retry", event_id)
    return {"status": "queued", "event_id": event_id}

