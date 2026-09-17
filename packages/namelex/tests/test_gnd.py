from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from namelex.sources import gnd  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures_gnd.nt"


def test_surname_from_label():
    assert gnd.surname_from_label("Goethe, Johann Wolfgang von") == "Goethe"
    assert gnd.surname_from_label("Schröder, Gerhard <1944->") == "Schröder"
    assert gnd.surname_from_label("Aristoteles") == ""
    assert gnd.surname_from_label("Karl <IV., Heiliges Römisches Reich, Kaiser>") == ""
    assert gnd.surname_from_label("") == ""


def test_build_counts(tmp_path):
    out = gnd.build_counts(FIXTURE, tmp_path / "gnd.jsonl")
    entries = {json.loads(l)["name"]: json.loads(l)
               for l in out.read_text(encoding="utf-8").splitlines()}

    assert entries["Müller"]["count"] == 2, "two distinct person records"
    assert "Mueller" in entries["Müller"]["variants"]
    assert "Schmitt" in entries["Schmidt"]["variants"]
    assert set(entries["Schröder"]["variants"]) == {"Schroeder", "Schroder"}
    assert "Göthe" in entries["Goethe"]["variants"]
    assert "Aristoteles" not in entries, "mononyms must be skipped"
    assert "Karl" not in entries, "ruler names must be skipped"
