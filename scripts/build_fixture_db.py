#!/usr/bin/env python3
"""Build the offline fixture lexicon shipped under data/fixtures/."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "namelex" / "src"))

from namelex import build as build_module  # noqa: E402
from namelex.sources import NameRecord  # noqa: E402


def sample_records() -> list[NameRecord]:
    # Compact stand-in for CI/demo; production DBs come from `namelex fetch/build`.
    return [
        NameRecord("Müller", 46400, "onomaverse", origin="German"),
        NameRecord("Schmidt", 31905, "onomaverse"),
        NameRecord("Schneider", 16824, "onomaverse"),
        NameRecord("Fischer", 14200, "onomaverse"),
        NameRecord("Weber", 12100, "onomaverse"),
        NameRecord("Meyer", 11000, "onomaverse"),
        NameRecord("Wagner", 10500, "onomaverse"),
        NameRecord("Becker", 9800, "onomaverse"),
        NameRecord("Schulz", 9200, "onomaverse"),
        NameRecord("Hoffmann", 8800, "onomaverse"),
        NameRecord("Mueller", 0, "wordlist:fixture"),
        NameRecord("Müller", 120, "gnd", variants=["Mueller", "Muller"]),
        NameRecord("Schmidt", 90, "gnd", variants=["Schmitt", "Schmid"]),
        NameRecord("Schneider", 40, "gnd", variants=["Schnyder"]),
        NameRecord("Yıldırım", 3, "gnd"),
        NameRecord("Szczepański", 1, "gnd"),
        NameRecord("Bergmann", 0, "wikidata"),
        NameRecord("Nguyen", 50, "wikidata_persons"),
        NameRecord("Mustermann", 0, "wordlist:fixture"),
    ]


def main() -> int:
    out = ROOT / "data" / "fixtures" / "surnames.sqlite3"
    out.parent.mkdir(parents=True, exist_ok=True)
    entries = build_module.merge(sample_records())
    path = build_module.build(out, entries)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
