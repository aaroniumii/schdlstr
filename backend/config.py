"""Configuration helpers for the schdlstr backend and worker."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pydantic_settings import BaseSettings
from pydantic import field_validator


BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """Application settings sourced from environment variables."""

    database_path: Path = BASE_DIR / "scheduler.db"
    relays_path: Path = BASE_DIR / "relays.json"
    max_publish_attempts: int = 5
    retry_base_seconds: int = 30
    retry_max_seconds: int = 1800
    log_level: str = "INFO"

    class Config:
        env_prefix = "SCHDLSTR_"
        env_file = BASE_DIR.parent / ".env"
        env_file_encoding = "utf-8"

    @field_validator("database_path", "relays_path", mode="before")
    def _ensure_path(cls, value: Any) -> Path:  # type: ignore[override]
        if isinstance(value, Path):
            return value
        return Path(str(value))

    @field_validator("log_level")
    def _validate_log_level(cls, value: str) -> str:  # type: ignore[override]
        return value.upper()


settings = Settings()


def configure_logging() -> None:
    """Configure global logging based on the current settings."""

    logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))


__all__ = ["Settings", "settings", "configure_logging"]
