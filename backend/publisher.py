# publisher.py
import sqlite3
import json
from datetime import datetime
from nostr.relay_manager import RelayManager
from nostr.event import Event
import time
import os
from dotenv import load_dotenv

load_dotenv()

DEFAULT_RELAYS = [
    "wss://relay.damus.io",
    "wss://nostr-pub.wellorder.net",
    "wss://nos.lol",
    "wss://relay.snort.social",
    "wss://offchain.pub",
    "wss://nostr.mom"
]

# Rutas absolutas para archivos de configuración y base de datos
BASE_DIR = os.path.dirname(__file__)
CONFIG_FILE = os.path.join(BASE_DIR, "relays.json")
DB_FILE = os.path.join(BASE_DIR, "scheduler.db")


def load_relays():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print("⚠️ Error leyendo relays.json, usando valores por defecto:", e)
    return DEFAULT_RELAYS


def publish_events():
    try:
        # Abrir conexión a la base de datos
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Comparar fecha de publicación con hora local
        now_iso = datetime.now().isoformat()
        c.execute(
            "SELECT id, event_json FROM scheduled_events WHERE publish_at <= ? AND sent = 0",
            (now_iso,)
        )
        rows = c.fetchall()
        if not rows:
            print("No hay eventos pendientes.")
            conn.close()
            return

        # Cargar relays y abrir conexiones
        relays = load_relays()
        manager = RelayManager()
        for relay in relays:
            manager.add_relay(relay)
        manager.open_connections()
        time.sleep(1.25)

        for row in rows:
            event_id = row["id"]
            data = json.loads(row["event_json"])

            # Reconstruir evento firmado
            event = Event(
                content=data["content"],
                public_key=data["pubkey"],
                kind=data["kind"],
                tags=data.get("tags", []),
                created_at=data["created_at"]
            )
            event.id = data["id"]
            event.signature = data["sig"]  # usar atributo 'signature'

            # Publicar evento
            manager.publish_event(event)
            print(f"✅ Evento publicado: {event_id}")

            # Marcar como enviado
            c.execute(
                "UPDATE scheduled_events SET sent = 1 WHERE id = ?",
                (event_id,)
            )

        conn.commit()
        conn.close()
        time.sleep(1)
        manager.close_connections()

    except Exception as e:
        print(f"❌ Error al publicar eventos: {e}")


if __name__ == "__main__":
    publish_events()

