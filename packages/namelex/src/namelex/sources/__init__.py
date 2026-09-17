"""Source loaders. Each yields NameRecord objects."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class NameRecord:
    """A single surname observation from one source."""

    name: str
    count: int = 0
    source: str = ""
    variants: list[str] = field(default_factory=list)
    origin: str = ""
