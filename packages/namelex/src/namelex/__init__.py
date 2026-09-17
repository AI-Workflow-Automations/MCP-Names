"""namelex - a German surname lexicon for fuzzy name resolution.

Data sources and their licences:
  * Wikidata          CC0 1.0
  * GND (DNB)         CC0 1.0
  * Onomaverse        CC BY 4.0, attribution required:
                      "Names data from Onomaverse
                      (https://onomaverse.com/datasets), licensed CC BY 4.0."
"""
from __future__ import annotations

__version__ = "0.1.0"

from .normalize import normalize, skeleton, split_prefix  # noqa: F401
from .phonetics import cologne  # noqa: F401
from .similarity import similarity  # noqa: F401
