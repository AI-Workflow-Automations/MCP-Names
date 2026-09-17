from __future__ import annotations

import json
from pathlib import Path

import pytest

from namelex import hydrate as hydrate_module
from namelex import build as build_module
from namelex.query import Lexicon
from namelex.sources import NameRecord


def sample_records():
    return [
        NameRecord("Müller", 46400, "onomaverse", origin="German"),
        NameRecord("Schmidt", 31905, "onomaverse"),
        NameRecord("Schneider", 16824, "onomaverse"),
        NameRecord("Müller", 120, "gnd", variants=["Mueller", "Muller"]),
        NameRecord("Schmidt", 90, "gnd", variants=["Schmitt", "Schmid"]),
    ]


@pytest.fixture
def lexicon(tmp_path: Path):
    entries = build_module.merge(sample_records())
    db = build_module.build(tmp_path / "db.sqlite3", entries)
    lex = Lexicon(db)
    yield lex, db
    lex.close()


def test_hydrate_resolves_misspelling(lexicon):
    lex, db = lexicon
    result = hydrate_module.hydrate_name(lex, "Schmit", db_path=db)
    assert "Schmidt" in [m["name"] for m in result["matches"]]
    assert result["needsHuman"] is False
    json.dumps(result)


def test_hydrate_empty(lexicon):
    lex, db = lexicon
    result = hydrate_module.hydrate_name(lex, "  ", db_path=db)
    assert result["needsHuman"] is True
    assert "error" in result


def test_stats(lexicon):
    lex, db = lexicon
    stats = hydrate_module.lexicon_stats(lex, db)
    assert stats["surnames"] >= 3
    assert stats["exists"] is True
