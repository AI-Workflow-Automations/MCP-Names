from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pytest  # noqa: E402

from namelex.normalize import normalize, skeleton, split_prefix  # noqa: E402
from namelex.phonetics import cologne  # noqa: E402
from namelex.similarity import similarity  # noqa: E402


@pytest.mark.parametrize("name,expected", [
    ("Müller", "mueller"), ("Mueller", "mueller"), ("Muller", "muller"),
    ("Weiß", "weiss"), ("Schäfer", "schaefer"), ("Yıldırım", "yildirim"),
    ("Łukasiewicz", "lukasiewicz"), ("Øster", "oester"),
    ("O'Brien", "obrien"), ("Mc Donald", "mcdonald"),
])
def test_normalize(name, expected):
    assert normalize(name) == expected


def test_prefix_is_split_only_for_particles():
    assert split_prefix("von der Leyen") == ("von der", "Leyen")
    assert split_prefix("de Vries") == ("de", "Vries")
    assert split_prefix("Mc Donald") == ("", "Mc Donald")
    assert split_prefix("Müller") == ("", "Müller")


@pytest.mark.parametrize("group", [
    ("Meyer", "Maier", "Mayer", "Meier"),
    ("Schmidt", "Schmitt"),
    ("Neumann", "Neuman"),
    ("Schäfer", "Schaefer"),
])
def test_skeleton_collapses_known_variants(group):
    keys = {skeleton(n) for n in group}
    assert len(keys) == 1, f"{group} should share one skeleton, got {keys}"


@pytest.mark.parametrize("name,expected", [
    # Canonical reference values for Cologne phonetics.
    ("Müller-Lüdenscheidt", "65752682"),
    ("Wikipedia", "3412"),
    ("Breschnew", "17863"),
    ("Müller", "657"),
    ("Schmidt", "862"),
    ("Schmitt", "862"),
])
def test_cologne(name, expected):
    assert cologne(name) == expected


def test_cologne_handles_empty_and_edge_input():
    assert cologne("") == ""
    assert cologne("...") == ""
    assert cologne("Xaver") == "4837"


def test_similarity_orders_sensibly():
    assert similarity("schmidt", "schmitt") > similarity("schmidt", "schneider")
    assert similarity("mueller", "muller") > similarity("mueller", "miller")
    assert similarity("mueller", "bergmann") < 0.5
    assert similarity("mueller", "mueller") == 1.0
