"""Tool-Texte und Server-Instructions für den LLM-Agenten."""
from __future__ import annotations

from typing import TypedDict


class ToolText(TypedDict):
    title: str
    description: str
    inputs: dict[str, str]


INSTRUCTIONS = """\
Deutscher Nachnamen-Abgleich für Telefonagenten (Namelex).

Ablauf:
1. hydrate_name mit dem verstandenen Nachnamen – nie ungeprüft übernehmen.
2. Bei needsHuman=true nichts raten: nachfragen oder an einen Menschen übergeben.
3. confident=true und exact=true: Name ist im Lexikon; Varianten können vorgelesen werden.
4. lexicon_stats nur für Setup/Debugging, nicht im Kundengespräch.

Datenquellen: Wikidata (CC0), GND/DNB (CC0), Onomaverse (CC BY 4.0 –
"Names data from Onomaverse (https://onomaverse.com/datasets), licensed CC BY 4.0.").
"""

TOOLS: dict[str, ToolText] = {
    "hydrate_name": {
        "title": "Nachnamen hydrieren",
        "description": (
            "Reichert einen (möglicherweise falsch erkannten) Nachnamen mit "
            "Lexikon-Wahrscheinlichkeit, Fuzzy-Korrekturkandidaten und "
            "Schreibvarianten an. Primäres Tool für Namensaufnahme."
        ),
        "inputs": {
            "name": 'Nachname wie verstanden, z.B. "Schmit" oder "Mueller"',
            "limit": "Maximale Anzahl Korrekturkandidaten (Standard 5)",
            "threshold": "Ähnlichkeitsschwelle für confident (Standard 0.86)",
        },
    },
    "lexicon_stats": {
        "title": "Lexikon-Statistik",
        "description": (
            "Liefert Anzahl Nachnamen, Varianten und Lizenzhinweise der "
            "geladenen Namelex-Datenbank. Nur für Setup und Debugging."
        ),
        "inputs": {},
    },
}
