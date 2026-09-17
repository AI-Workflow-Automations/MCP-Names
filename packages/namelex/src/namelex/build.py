"""Build the surname SQLite database from the cached source extracts."""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from .ngram import NgramModel
from .normalize import display_form, normalize, skeleton, split_prefix
from .phonetics import cologne
from .sources import NameRecord

SCHEMA = Path(__file__).with_name("schema.sql")

# How much probability mass each source contributes. Onomaverse covers only
# the head of the distribution (about 390 German surnames) but its ordering
# is closest to the population; Wikidata persons are prominence-biased; the
# GND is bibliographic and historic. Deliberately conservative on Onomaverse
# so the head does not swallow the whole distribution: the 400 most common
# German surnames account for roughly a quarter of the population, not half.
DEFAULT_WEIGHTS = {
    "wikidata_persons": 0.55,
    "gnd": 0.45,
}
# Onomaverse covers only the head of the distribution, so it is anchored by
# mass instead of by weight: its ~390 German surnames together receive this
# share. The 400 most common surnames in Germany account for roughly a
# quarter of the population, so its internal ordering is used without letting
# its internal normalisation dictate absolute probabilities.
HEAD_SOURCE = "onomaverse"
HEAD_MASS = 0.25
# Mass reserved for names that appear in the lexicon without any frequency,
# distributed according to the n-gram model.
UNKNOWN_MASS = 0.08
# A source is only trusted at its full weight once it carries this many
# observations. Below it the weight is scaled down linearly and the freed
# mass goes to the n-gram backoff. Without this guard a source that failed
# halfway through its download would still claim its full share of the
# distribution and distort every probability in the table.
MIN_OBSERVATIONS = 50_000


@dataclass
class Entry:
    name: str
    counts: dict[str, int] = field(default_factory=dict)
    variants: dict[str, str] = field(default_factory=dict)  # variant -> source
    origin: str = ""
    sources: set[str] = field(default_factory=set)


def merge(records: Iterable[NameRecord]) -> dict[str, Entry]:
    """Merge source records keyed by normalised form.

    The display form kept is the one with the most diacritics, because
    "Müller" is the name and "Mueller" is a transcription of it.
    """
    merged: dict[str, Entry] = {}
    for record in records:
        name = display_form(record.name)
        key = normalize(name)
        if not key or len(key) < 2:
            continue
        entry = merged.get(key)
        if entry is None:
            entry = merged[key] = Entry(name=name)
        elif _prefer(name, entry.name):
            entry.name = name
        entry.sources.add(record.source)
        if record.count:
            entry.counts[record.source] = entry.counts.get(record.source, 0) + record.count
        if record.origin and not entry.origin:
            entry.origin = record.origin
        for variant in record.variants:
            variant = display_form(variant)
            if variant and normalize(variant) != key:
                entry.variants.setdefault(variant, record.source)
    return merged


def _prefer(candidate: str, current: str) -> bool:
    """Prefer the spelling that carries German diacritics."""
    special = "äöüßÄÖÜẞáàâéèêíìîóòôúùûñçšžčłøæœ"
    candidate_score = sum(c in special for c in candidate)
    current_score = sum(c in special for c in current)
    if candidate_score != current_score:
        return candidate_score > current_score
    return False


def compute_probabilities(entries: dict[str, Entry], model: NgramModel,
                          weights: dict[str, float] | None = None,
                          unknown_mass: float = UNKNOWN_MASS,
                          head_mass: float = HEAD_MASS) -> dict[str, float]:
    """Mixture of per-source distributions plus an n-gram backoff."""
    weights = dict(weights or DEFAULT_WEIGHTS)
    totals: dict[str, int] = {}
    for entry in entries.values():
        for source, count in entry.counts.items():
            totals[source] = totals.get(source, 0) + count

    has_head = bool(totals.get(HEAD_SOURCE))
    if not has_head:
        head_mass = 0.0
    def confidence(source: str) -> float:
        return min(1.0, totals.get(source, 0) / MIN_OBSERVATIONS)

    raw_tail = {s: w * confidence(s) for s, w in weights.items()
                if s != HEAD_SOURCE and totals.get(s)}
    tail_confidence = (sum(raw_tail.values()) / sum(
        w for s, w in weights.items() if s != HEAD_SOURCE) if any(
        s != HEAD_SOURCE for s in weights) else 0.0)
    weight_sum = sum(raw_tail.values()) or 1.0
    tail_weights = {s: w / weight_sum for s, w in raw_tail.items()}

    if has_head:
        head_mass = head_mass * confidence(HEAD_SOURCE)

    known_mass = max(0.0, 1.0 - unknown_mass)
    tail_mass = max(0.0, known_mass - head_mass) * tail_confidence

    probabilities: dict[str, float] = {}
    backoff_scores: dict[str, float] = {}

    for key, entry in entries.items():
        value = 0.0
        for source, weight in tail_weights.items():
            count = entry.counts.get(source, 0)
            if count:
                value += weight * tail_mass * (count / totals[source])
        head_count = entry.counts.get(HEAD_SOURCE, 0)
        if head_count and has_head:
            value += head_mass * (head_count / totals[HEAD_SOURCE])
        if value:
            probabilities[key] = value
        else:
            backoff_scores[key] = max(model.plausibility(key), 1e-6)

    backoff_total = sum(backoff_scores.values())
    if backoff_total:
        for key, score in backoff_scores.items():
            probabilities[key] = unknown_mass * score / backoff_total

    # Renormalise so the table is a proper distribution.
    total = sum(probabilities.values()) or 1.0
    return {key: value / total for key, value in probabilities.items()}


def build(db_path: Path, entries: dict[str, Entry], *,
          weights: dict[str, float] | None = None,
          meta: dict[str, str] | None = None) -> Path:
    import math

    keys = list(entries)
    model = NgramModel().train(keys)
    model.calibrate(keys)
    probabilities = compute_probabilities(entries, model, weights)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    connection = sqlite3.connect(db_path)
    connection.executescript(SCHEMA.read_text(encoding="utf-8"))

    ranked = sorted(entries, key=lambda k: -probabilities.get(k, 0.0))
    rank_of = {key: index + 1 for index, key in enumerate(ranked)}

    rows = []
    for key, entry in entries.items():
        prefix, _core = split_prefix(entry.name)
        probability = probabilities.get(key, 0.0)
        rows.append((
            entry.name, key, skeleton(entry.name), cologne(entry.name), prefix,
            len(key),
            entry.counts.get("onomaverse", 0),
            entry.counts.get("wikidata_persons", 0) + entry.counts.get("wikidata", 0),
            entry.counts.get("gnd", 0),
            probability,
            math.log(probability) if probability > 0 else -50.0,
            model.plausibility(key),
            rank_of[key],
            entry.origin,
            ",".join(sorted(entry.sources)),
        ))

    connection.executemany(
        """INSERT INTO surname
           (name, norm, skeleton, cologne, prefix, length, count_onomaverse,
            count_wikidata, count_gnd, prob, log_prob, plausibility, rank_de,
            origin, sources)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )

    ids = dict(connection.execute("SELECT norm, id FROM surname").fetchall())
    variant_rows = []
    for key, entry in entries.items():
        surname_id = ids.get(key)
        if surname_id is None:
            continue
        for variant, source in entry.variants.items():
            variant_rows.append((surname_id, variant, normalize(variant),
                                 cologne(variant), source))
    connection.executemany(
        "INSERT OR IGNORE INTO variant (surname_id, name, norm, cologne, source)"
        " VALUES (?,?,?,?,?)",
        variant_rows,
    )

    connection.executemany(
        "INSERT OR REPLACE INTO ngram (gram, n, count) VALUES (?,?,?)",
        list(model.export_rows()),
    )

    info = {
        "surnames": str(len(rows)),
        "variants": str(len(variant_rows)),
        "ngram_median": repr(model.median),
        "ngram_spread": repr(model.spread),
        "ngram_max_order": str(model.max_order),
        "weights": json.dumps(weights or DEFAULT_WEIGHTS),
        "head_source": HEAD_SOURCE,
        "head_mass": repr(HEAD_MASS),
        "unknown_mass": repr(UNKNOWN_MASS),
        "licenses": json.dumps([
            "Wikidata: CC0 1.0",
            "GND/DNB: CC0 1.0",
            "Onomaverse: CC BY 4.0 - Names data from Onomaverse"
            " (https://onomaverse.com/datasets)",
        ]),
    }
    info.update(meta or {})
    connection.executemany("INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)",
                           list(info.items()))
    connection.commit()
    connection.close()
    return db_path
