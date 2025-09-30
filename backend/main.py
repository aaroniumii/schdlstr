from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import sqlite3

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "scheduler.db"
RELAYS_PATH = BASE_DIR / "relays.json"
UPLOAD_DIR = BASE_DIR / "uploads"

app = FastAPI()


def ensure_directories() -> None:
    """Create directories required by the application."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS scheduled_events (
                id TEXT PRIMARY KEY,
                event_json TEXT NOT NULL,
                publish_at TEXT NOT NULL,
                sent INTEGER DEFAULT 0
            )
            """
        )
        conn.commit()

    default_relays = [
        "wss://relay.damus.io",
        "wss://librerelay.aaroniumii.com",
        "wss://librewot.aaroniumii.com,
        "wss://nostr-pub.wellorder.net",
        "wss://nos.lol",
        "wss://relay.snort.social",
        "wss://offchain.pub",
        "wss://nostr.mom",
    ]
    if not RELAYS_PATH.exists():
        RELAYS_PATH.write_text(json.dumps(default_relays, indent=2), encoding="utf-8")


ensure_directories()
init_db()

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


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
                "INSERT INTO scheduled_events (id, event_json, publish_at) VALUES (?, ?, ?)",
                (event_id, json.dumps(data.event), publish_at_dt.isoformat()),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Event already scheduled") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"status": "ok", "event_id": event_id}


@app.get("/scheduled")
def get_scheduled(pubkey: str | None = None):
    query = """
        SELECT id, event_json, publish_at, sent
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
            }
        )

    return events


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    sanitized_name = Path(file.filename).name
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    final_name = f"{timestamp}_{sanitized_name}"
    destination = UPLOAD_DIR / final_name

    try:
        with destination.open("wb") as buffer:
            contents = await file.read()
            buffer.write(contents)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail="Failed to store file") from exc

    return JSONResponse({"url": f"/uploads/{final_name}"})

