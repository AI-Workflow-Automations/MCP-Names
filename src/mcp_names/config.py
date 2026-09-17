"""Runtime configuration for MCP Names."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Default: fixture lexicon shipped for offline demos and tests.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DB = _REPO_ROOT / "data" / "fixtures" / "surnames.sqlite3"


@dataclass(frozen=True, slots=True)
class Config:
    """Paths and thresholds the service reads once at startup."""

    db_path: Path
    match_limit: int = 5
    similarity_threshold: float = 0.86


def load_config() -> Config:
    raw = os.environ.get("NAMELEX_DB_PATH", str(_DEFAULT_DB))
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (_REPO_ROOT / path).resolve()
    limit = int(os.environ.get("NAMELEX_MATCH_LIMIT", "5"))
    threshold = float(os.environ.get("NAMELEX_SIMILARITY_THRESHOLD", "0.86"))
    return Config(db_path=path, match_limit=limit, similarity_threshold=threshold)
