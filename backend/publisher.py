"""Utilities to publish scheduled events to configured relays."""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from nostr.event import Event
from nostr.relay_manager import RelayManager

load_dotenv()

DEFAULT_RELAYS = [
    "wss://relay.damus.io",
    "wss://nostr-pub.wellorder.net",
    "wss://nos.lol",
    "wss://relay.snort.social",
    "wss://offchain.pub",
    "wss://nostr.mom",
]

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "relays.json"
DB_FILE = BASE_DIR / "scheduler.db"


def load_relays() -> list[str]:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - defensive
            print("⚠️ Error leyendo relays.json, usando valores por defecto:", exc)
    return DEFAULT_RELAYS


def publish_events() -> None:
    try:
        with sqlite3.connect(DB_FILE) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            now_iso = datetime.now(timezone.utc).isoformat()
            c.execute(
                "SELECT id, event_json FROM scheduled_events WHERE publish_at <= ? AND sent = 0",
                (now_iso,),
            )
            rows = c.fetchall()

            if not rows:
                print("No hay eventos pendientes.")
                return

            relays = load_relays()
            manager = RelayManager()
            for relay in relays:
                manager.add_relay(relay)
            manager.open_connections()
            time.sleep(1.25)

            for row in rows:
                event_id = row["id"]
                data = json.loads(row["event_json"])

                event = Event(
                    content=data["content"],
                    public_key=data["pubkey"],
                    kind=data["kind"],
                    tags=data.get("tags", []),
                    created_at=data["created_at"],
                )
                event.id = data["id"]
                event.signature = data["sig"]

                manager.publish_event(event)
                print(f"✅ Evento publicado: {event_id}")

                c.execute(
                    "UPDATE scheduled_events SET sent = 1 WHERE id = ?",
                    (event_id,),
                )

            conn.commit()
            time.sleep(1)
            manager.close_connections()
    except Exception as exc:  # pragma: no cover - defensive
        print(f"❌ Error al publicar eventos: {exc}")


if __name__ == "__main__":
    publish_events()
