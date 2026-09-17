"""Sanity checks for a built database.

The point is not to prove the table right - no open source of truth exists
for German surname frequencies - but to catch a build that has gone
structurally wrong: a source that failed to download, a weighting that lets
the head swallow the distribution, a normalisation that split one name into
several entries.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

# Order of magnitude only. Derived from published telephone-directory
# analyses of German surnames, which are themselves an approximation of the
# population. Used to check rank order and scale, never as ground truth.
REFERENCE_SHARE = {
    "Müller": 0.0095, "Schmidt": 0.0069, "Schneider": 0.0040,
    "Fischer": 0.0035, "Weber": 0.0033, "Meyer": 0.0033,
    "Wagner": 0.0032, "Becker": 0.0031, "Schulz": 0.0029,
    "Hoffmann": 0.0028,
}


def spearman(a: list[float], b: list[float]) -> float:
    def ranks(values: list[float]) -> list[float]:
        order = sorted(range(len(values)), key=lambda i: values[i])
        result = [0.0] * len(values)
        for rank, index in enumerate(order, start=1):
            result[index] = float(rank)
        return result

    ra, rb = ranks(a), ranks(b)
    n = len(a)
    if n < 2:
        return 0.0
    mean_a = sum(ra) / n
    mean_b = sum(rb) / n
    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(ra, rb))
    var_a = sum((x - mean_a) ** 2 for x in ra) ** 0.5
    var_b = sum((y - mean_b) ** 2 for y in rb) ** 0.5
    return cov / (var_a * var_b) if var_a and var_b else 0.0


def report(db_path: Path) -> dict:
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row

    total = connection.execute("SELECT COUNT(*) AS n FROM surname").fetchone()["n"]
    mass = connection.execute("SELECT SUM(prob) AS m FROM surname").fetchone()["m"] or 0.0

    observed: list[float] = []
    expected: list[float] = []
    missing: list[str] = []
    scale: dict[str, float] = {}
    from .normalize import normalize
    for name, share in REFERENCE_SHARE.items():
        row = connection.execute("SELECT prob FROM surname WHERE norm = ?",
                                 (normalize(name),)).fetchone()
        if not row:
            missing.append(name)
            continue
        observed.append(row["prob"])
        expected.append(share)
        scale[name] = round(row["prob"] / share, 2) if share else 0.0

    head = connection.execute(
        "SELECT SUM(prob) AS m FROM (SELECT prob FROM surname "
        "ORDER BY prob DESC LIMIT 400)").fetchone()["m"] or 0.0

    duplicates = connection.execute(
        "SELECT COUNT(*) AS n FROM (SELECT norm FROM surname "
        "GROUP BY norm HAVING COUNT(*) > 1)").fetchone()["n"]

    connection.close()
    return {
        "surnames": total,
        "probability_mass": round(mass, 6),
        "duplicate_norms": duplicates,
        "reference_names_missing": missing,
        "rank_correlation_vs_reference": round(spearman(observed, expected), 4),
        "observed_over_expected": scale,
        "top400_mass": round(head, 4),
        "notes": [
            "probability_mass must be 1.0",
            "duplicate_norms must be 0",
            "rank_correlation_vs_reference above 0.8 is healthy",
            "top400_mass around 0.25 is plausible; far above means the head "
            "source dominates - lower build.HEAD_MASS",
            "observed_over_expected near 1.0 means the scale is right; a "
            "value of 5 means that name is five times too likely",
        ],
    }
