"""Hydration API used by the TypeScript MCP server.

The MCP layer stays in TypeScript; this module is the Namelex-facing contract:
probability, fuzzy matches, variants, and a needsHuman hint.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .query import Lexicon, as_dict


def hydrate_name(
    lexicon: Lexicon,
    name: str,
    *,
    limit: int = 5,
    threshold: float = 0.86,
    db_path: Path | None = None,
) -> dict[str, Any]:
    """Hydrate a (possibly misspelled) surname with lexicon evidence."""
    cleaned = (name or "").strip()
    if not cleaned:
        return {
            "query": name,
            "error": "name must not be empty",
            "needsHuman": True,
        }

    probability = lexicon.probability(cleaned)
    matches = [
        as_dict(m)
        for m in lexicon.match(cleaned, limit=limit, threshold=threshold)
    ]
    variant_source = cleaned
    top = next((m for m in matches if m.get("confident")), None)
    if top:
        variant_source = top["name"]
    elif probability.get("known"):
        variant_source = probability.get("name") or cleaned

    return {
        "query": cleaned,
        "probability": probability,
        "matches": matches,
        "variants": lexicon.variants_of(variant_source),
        "needsHuman": needs_human(probability, matches),
        "lexicon": {
            "db": str(db_path) if db_path is not None else "",
            "threshold": threshold,
        },
    }


def lexicon_stats(lexicon: Lexicon, db_path: Path) -> dict[str, Any]:
    stats = lexicon.stats()
    stats["db"] = str(db_path)
    stats["exists"] = db_path.exists()
    return stats


def needs_human(probability: dict[str, Any], matches: list[dict[str, Any]]) -> bool:
    if probability.get("known"):
        return False
    if any(m.get("confident") and m.get("exact") for m in matches):
        return False
    if matches and matches[0].get("confident"):
        return False
    return True
