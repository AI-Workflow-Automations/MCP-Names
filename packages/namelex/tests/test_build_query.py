from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from namelex import build as build_module  # noqa: E402
from namelex.query import Lexicon  # noqa: E402
from namelex.sources import NameRecord  # noqa: E402


def sample_records():
    return [
        NameRecord("Müller", 46400, "onomaverse", origin="German"),
        NameRecord("Schmidt", 31905, "onomaverse"),
        NameRecord("Schneider", 16824, "onomaverse"),
        NameRecord("Mueller", 0, "wordlist:test"),
        NameRecord("Müller", 120, "gnd", variants=["Mueller", "Muller"]),
        NameRecord("Schmidt", 90, "gnd", variants=["Schmitt"]),
        NameRecord("Yıldırım", 3, "gnd"),
        NameRecord("Szczepański", 1, "gnd"),
        NameRecord("Bergmann", 0, "wikidata"),
    ]


def build_db(tmp_path):
    entries = build_module.merge(sample_records())
    return build_module.build(tmp_path / "db.sqlite3", entries)


def test_merge_collapses_transcriptions_and_keeps_diacritics():
    entries = build_module.merge(sample_records())
    assert "mueller" in entries
    assert entries["mueller"].name == "Müller", "display form keeps the umlaut"
    assert "muller" not in entries or entries["muller"].name != "Müller"


def test_probabilities_sum_to_one(tmp_path):
    lexicon = Lexicon(build_db(tmp_path))
    assert abs(lexicon.stats()["probability_mass"] - 1.0) < 1e-6
    lexicon.close()


def test_exact_and_fuzzy_lookup(tmp_path):
    lexicon = Lexicon(build_db(tmp_path))

    assert lexicon.probability("Müller")["known"] is True
    assert lexicon.probability("Mueller")["known"] is True, "transcription resolves"
    assert lexicon.probability("Zzzqqx")["known"] is False

    names = [m.name for m in lexicon.match("Schmit")]
    assert "Schmidt" in names

    assert lexicon.probability("Müller")["rank"] == 1
    lexicon.close()


def test_variants_are_stored(tmp_path):
    lexicon = Lexicon(build_db(tmp_path))
    variants = lexicon.variants_of("Müller")
    assert "Mueller" in variants or "Muller" in variants
    lexicon.close()


def test_unknown_but_plausible_name_scores_above_keyboard_noise(tmp_path):
    lexicon = Lexicon(build_db(tmp_path))
    name_like = lexicon.probability("Schneidert")["plausibility"]
    noise = lexicon.probability("Xqzptwv")["plausibility"]
    assert name_like > noise
    lexicon.close()
