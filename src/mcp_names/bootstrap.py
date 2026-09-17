"""Composition root – Service und Config zusammenstecken."""
from __future__ import annotations

from pathlib import Path

from namelex.query import Lexicon

from .config import Config, load_config
from .service import NamesService


def compose_service(config: Config | None = None) -> NamesService:
    cfg = config or load_config()
    if not cfg.db_path.exists():
        raise FileNotFoundError(
            f"Namelex database not found at {cfg.db_path}. "
            "Set NAMELEX_DB_PATH or build one with `namelex build` "
            "(see README). A fixture DB is under data/fixtures/."
        )
    return NamesService(cfg, Lexicon(cfg.db_path))


def default_fixture_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "fixtures" / "surnames.sqlite3"
