"""Read-only lookup API. This is what the MCP server calls."""
from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import dataclass, asdict
from pathlib import Path

from .ngram import NgramModel
from .normalize import normalize, skeleton
from .phonetics import cologne
from .similarity import similarity

# Above this a candidate is treated as the same name spelled differently,
# below it as a different name. Calibrate with `namelex calibrate`, which
# scores the GND variant pairs against random pairs.
DEFAULT_THRESHOLD = 0.86


@dataclass(slots=True)
class Match:
    name: str
    score: float
    similarity: float
    probability: float
    rank: int | None
    sources: str
    exact: bool
    matched_via: str
    confident: bool


class Lexicon:
    def __init__(self, db_path: Path):
        self.connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self.connection.row_factory = sqlite3.Row
        meta = dict(self.connection.execute("SELECT key, value FROM meta").fetchall())
        self.meta = meta
        rows = self.connection.execute("SELECT gram, n, count FROM ngram").fetchall()
        self.model = NgramModel.from_rows(
            ((r["gram"], r["n"], r["count"]) for r in rows),
            max_order=int(meta.get("ngram_max_order", 4)),
            median=float(meta.get("ngram_median", -3.0)),
            spread=float(meta.get("ngram_spread", 1.0)),
        )

    def close(self) -> None:
        self.connection.close()

    # -- exact -----------------------------------------------------------
    def lookup(self, name: str) -> dict | None:
        row = self.connection.execute(
            "SELECT * FROM surname WHERE norm = ?", (normalize(name),)
        ).fetchone()
        return dict(row) if row else None

    # -- probability -----------------------------------------------------
    def probability(self, name: str) -> dict:
        """How likely is this string to be a German surname?

        ``probability`` is the share of the population expected to carry the
        name; ``plausibility`` is how name-like the string is regardless of
        whether it is recorded.
        """
        entry = self.lookup(name)
        norm = normalize(name)
        plausibility = self.model.plausibility(norm)
        if entry:
            return {
                "name": entry["name"],
                "known": True,
                "probability": entry["prob"],
                "log_probability": entry["log_prob"],
                "plausibility": entry["plausibility"],
                "rank": entry["rank_de"],
                "sources": entry["sources"],
            }
        return {
            "name": name,
            "known": False,
            "probability": 0.0,
            "log_probability": -50.0,
            "plausibility": plausibility,
            "rank": None,
            "sources": "",
        }

    # -- fuzzy -----------------------------------------------------------
    def candidates(self, name: str, *, max_candidates: int = 400) -> list[sqlite3.Row]:
        """Blocking step: cheap keys first, similarity only on the survivors."""
        norm = normalize(name)
        if not norm:
            return []
        keys = (normalize(name), skeleton(name), cologne(name))
        query = """
            SELECT * FROM surname
            WHERE norm = ? OR skeleton = ? OR cologne = ?
               OR (substr(norm, 1, 3) = ? AND abs(length - ?) <= 2)
            ORDER BY prob DESC
            LIMIT ?
        """
        rows = self.connection.execute(
            query, (*keys, norm[:3], len(norm), max_candidates)
        ).fetchall()
        if rows:
            return rows
        # Nothing shares a key: fall back to variant spellings.
        return self.connection.execute(
            """SELECT s.* FROM variant v JOIN surname s ON s.id = v.surname_id
               WHERE v.norm = ? OR v.cologne = ? LIMIT ?""",
            (norm, cologne(name), max_candidates),
        ).fetchall()

    def match(self, name: str, *, limit: int = 5,
              threshold: float = DEFAULT_THRESHOLD,
              prior_weight: float = 0.15) -> list[Match]:
        """Rank correction candidates for a possibly misspelled surname.

        The final score blends string similarity with the prior: between two
        equally similar candidates the more common name wins, which is what
        makes "Mller" resolve to "Müller" rather than to "Moller".
        """
        norm = normalize(name)
        if not norm:
            return []
        query_cologne = cologne(name)
        query_skeleton = skeleton(name)
        results: list[Match] = []
        for row in self.candidates(name):
            sim = similarity(norm, row["norm"])
            if sim < threshold - 0.15:
                continue
            if row["norm"] == norm:
                matched_via = "exact"
            elif row["skeleton"] == query_skeleton:
                matched_via = "skeleton"
            elif row["cologne"] == query_cologne:
                matched_via = "phonetic"
            else:
                matched_via = "edit"
            # log10 prior mapped into [0, 1] over six orders of magnitude.
            prior = 0.0
            if row["prob"] > 0:
                prior = max(0.0, min(1.0, (math.log10(row["prob"]) + 7.0) / 7.0))
            score = (1 - prior_weight) * sim + prior_weight * prior
            results.append(Match(
                name=row["name"], score=round(score, 4), similarity=round(sim, 4),
                probability=row["prob"], rank=row["rank_de"],
                sources=row["sources"], exact=row["norm"] == norm,
                matched_via=matched_via,
                confident=bool(row["norm"] == norm or sim >= threshold),
            ))
        results.sort(key=lambda m: -m.score)
        # Everything above the soft floor is returned, flagged rather than
        # dropped: the caller usually wants to see the near misses and decide,
        # and a hard cut hides that "Miller" is close to both "Muller" and
        # "Mueller".
        return results[:limit]

    def variants_of(self, name: str) -> list[str]:
        row = self.connection.execute(
            "SELECT id FROM surname WHERE norm = ?", (normalize(name),)
        ).fetchone()
        if not row:
            return []
        return [r["name"] for r in self.connection.execute(
            "SELECT name FROM variant WHERE surname_id = ? ORDER BY name", (row["id"],)
        )]

    def stats(self) -> dict:
        counts = self.connection.execute(
            "SELECT COUNT(*) AS n, SUM(prob) AS mass FROM surname").fetchone()
        return {
            "surnames": counts["n"],
            "probability_mass": round(counts["mass"] or 0.0, 6),
            "variants": self.connection.execute(
                "SELECT COUNT(*) AS n FROM variant").fetchone()["n"],
            "licenses": json.loads(self.meta.get("licenses", "[]")),
        }


def as_dict(match: Match) -> dict:
    return asdict(match)
