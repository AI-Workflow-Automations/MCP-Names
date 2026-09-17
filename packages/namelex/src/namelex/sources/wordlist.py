"""Plain text word lists: one name per line.

Lets any curated list be folded in, for example
https://github.com/imsky/wordlists (MIT) or an internal export. Such lists
carry no frequency, so they only widen recall.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

from . import NameRecord


def load(path: Path, *, source: str | None = None) -> Iterator[NameRecord]:
    label = source or f"wordlist:{path.stem}"
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            name = line.strip()
            if not name or name.startswith("#"):
                continue
            # Lists are often all-lowercase; title-case them for display but
            # keep interior capitals of names such as "McDonald".
            if name.islower():
                name = "-".join(part.capitalize() for part in name.split("-"))
            yield NameRecord(name=name, count=0, source=label)
