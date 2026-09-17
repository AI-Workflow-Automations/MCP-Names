"""Fassade: hydriert Nachnamen über Namelex.Lexicon.

Keine Fachlogik hier – Namelex liefert Wahrscheinlichkeit, Fuzzy-Matches und
Varianten. Diese Schicht formatiert die Antwort für MCP/REST-Clients.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from namelex.query import Lexicon, as_dict

from .config import Config


class NamesService:
    """Ein Einstiegspunkt für MCP-Tools – analog zur Geocoder-Fassade."""

    def __init__(self, config: Config, lexicon: Lexicon | None = None):
        self.config = config
        self._owns_lexicon = lexicon is None
        self.lexicon = lexicon or Lexicon(config.db_path)

    def close(self) -> None:
        if self._owns_lexicon:
            self.lexicon.close()

    def hydrate_name(
        self,
        name: str,
        *,
        limit: int | None = None,
        threshold: float | None = None,
    ) -> dict[str, Any]:
        """Hydrate a (possibly misspelled) surname with lexicon evidence.

        Returns probability / plausibility, ranked correction candidates, and
        known spelling variants. Soft matches stay in the list and are flagged
        with ``confident`` so the agent can decide.
        """
        cleaned = (name or "").strip()
        if not cleaned:
            return {
                "query": name,
                "error": "name must not be empty",
                "needsHuman": True,
            }

        limit = limit if limit is not None else self.config.match_limit
        threshold = (
            threshold if threshold is not None else self.config.similarity_threshold
        )
        probability = self.lexicon.probability(cleaned)
        matches = [
            as_dict(m)
            for m in self.lexicon.match(
                cleaned, limit=limit, threshold=threshold
            )
        ]
        # Variants for the top confident hit, else exact lookup form.
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
            "variants": self.lexicon.variants_of(variant_source),
            "needsHuman": _needs_human(probability, matches),
            "lexicon": {
                "db": str(self.config.db_path),
                "threshold": threshold,
            },
        }

    def lexicon_stats(self) -> dict[str, Any]:
        stats = self.lexicon.stats()
        stats["db"] = str(self.config.db_path)
        stats["exists"] = Path(self.config.db_path).exists()
        return stats


def _needs_human(probability: dict[str, Any], matches: list[dict[str, Any]]) -> bool:
    if probability.get("known"):
        return False
    if any(m.get("confident") and m.get("exact") for m in matches):
        return False
    if matches and matches[0].get("confident"):
        return False
    # Unbekannt und kein sicherer Kandidat – Agent soll nachfragen / übergeben.
    return True
