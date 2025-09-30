"""Utilities to publish scheduled events to configured relays."""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable

from nostr.event import Event
from nostr.relay_manager import RelayManager

from config import configure_logging, settings

configure_logging()

logger = logging.getLogger(__name__)

DEFAULT_RELAYS = [
    "wss://relay.damus.io",
    "wss://nostr-pub.wellorder.net",
    "wss://librerelay.aaroniumii.com",
    "wss://librewot.aaroniumii.com",
    "wss://nos.lol",
    "wss://relay.snort.social",
    "wss://offchain.pub",
    "wss://nostr.mom",
]


def load_relays() -> list[str]:
    """Carga lista de relays desde archivo o usa los predeterminados."""
    relays_path = settings.relays_path
    if relays_path.exists():
        try:
            return json.loads(relays_path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - defensivo
            logger.warning("Error reading relays.json, falling back to defaults: %s", exc)
    return DEFAULT_RELAYS


def _calculate_next_retry(attempt: int) -> datetime:
    delay = settings.retry_base_seconds * (2 ** max(attempt - 1, 0))
    delay = min(delay, settings.retry_max_seconds)
    return datetime.now(timezone.utc) + timedelta(seconds=delay)


def _mark_failure(
    cursor: sqlite3.Cursor,
    event_id: str,
    attempts: int,
    error_message: str,
) -> None:
    """Marca un evento como fallido o en reintento."""
    next_attempt_at: str | None
    status: str
    if attempts >= settings.max_publish_attempts:
        status = "error"
        next_attempt_at = None
    else:
        status = "retrying"
        next_attempt_at = _calculate_next_retry(attempts).isoformat()

    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        UPDATE scheduled_events
        SET attempt_count = ?,
            status = ?,
            last_error = ?,
            last_attempt_at = ?,
            next_attempt_at = ?,
            sent = 0
        WHERE id = ?
        """,
        (attempts, status, error_message, now_iso, next_attempt_at, event_id),
    )
    logger.error(
        "Failed to publish event %s (attempt %s/%s): %s",
        event_id,
        attempts,
        settings.max_publish_attempts,
        error_message,
    )


def _mark_success(cursor: sqlite3.Cursor, event_id: str, attempts: int) -> None:
    """Marca un evento como enviado exitosamente."""
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        UPDATE scheduled_events
        SET sent = 1,
            status = 'sent',
            attempt_count = ?,
            last_error = NULL,
            last_attempt_at = ?,
            next_attempt_at = NULL
        WHERE id = ?
        """,
        (attempts, now_iso, event_id),
    )
    logger.info("Published event %s", event_id)


def _load_pending_events(cursor: sqlite3.Cursor, now_iso: str) -> Iterable[sqlite3.Row]:
    """Carga eventos pendientes listos para publicar."""
    cursor.execute(
        """
        SELECT id, event_json, attempt_count
        FROM scheduled_events
        WHERE sent = 0
          AND publish_at <= ?
          AND status IN ('scheduled', 'retrying')
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY publish_at ASC
        """,
        (now_iso, now_iso),
    )
    return cursor.fetchall()


def publish_events() -> None:
    """Intenta publicar todos los eventos pendientes en esta iteración."""
    with sqlite3.connect(settings.database_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        now_iso = datetime.now(timezone.utc).isoformat()
        rows = _load_pending_events(cursor, now_iso)

        if not rows:
            logger.info("No pending events to publish.")
            return

        relays = load_relays()
        if not relays:
            logger.warning("No relays configured; marking %s events as failed", len(rows))
            for row in rows:
                _mark_failure(cursor, row["id"], row["attempt_count"] + 1, "No relays configured")
            conn.commit()
            return

        manager = RelayManager()
        for relay in relays:
            manager.add_relay(relay)

        try:
            try:
                manager.open_connections()
            except Exception as exc:  # pragma: no cover - defensivo
                logger.exception("Unable to open relay connections: %s", exc)
                for row in rows:
                    _mark_failure(cursor, row["id"], row["attempt_count"] + 1, str(exc))
                conn.commit()
                return

            time.sleep(1.25)  # darle tiempo a la conexión

            for row in rows:
                event_id = row["id"]
                attempts = row["attempt_count"] + 1
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

                try:
                    manager.publish_event(event)
                    _mark_success(cursor, event_id, attempts)
                except Exception as exc:  # pragma: no cover - fallo de red
                    _mark_failure(cursor, event_id, attempts, str(exc))

            conn.commit()
            time.sleep(1)
        finally:
            # Cierra siempre para forzar reapertura en siguiente ciclo
            manager.close_connections()


if __name__ == "__main__":
    logger.info("Starting publisher loop...")
    try:
        while True:
            try:
                publish_events()
            except Exception as exc:
                logger.exception("Unexpected error in publisher loop: %s", exc)
            # espera antes de revisar otra vez (configurable)
            time.sleep(getattr(settings, "publisher_interval_seconds", 30))
    except KeyboardInterrupt:
        logger.info("Publisher stopped by user")
