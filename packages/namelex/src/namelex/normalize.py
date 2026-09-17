"""Normalisation of German personal names.

The goal is a comparison form that collapses the spelling variation that is
actually observed in German name data (umlaut transcription, doubled
consonants, historic digraphs) while keeping the display form intact.
"""
from __future__ import annotations

import re
import unicodedata

# Nobiliary particles and other name prefixes. Longest first so that
# "von der" is matched before "von".
# Deliberately limited to particles that appear as a SEPARATE leading token
# in German name fields. "Mc", "Mac", "O'" and Arabic "bin"/"ibn" are part of
# the name itself and are not split off.
NAME_PREFIXES: tuple[str, ...] = (
    "von und zu", "von der", "von dem", "von den", "van der", "van den",
    "van de", "de la", "de le", "zu der", "in der", "auf dem", "auf der",
    "von", "vom", "van", "zu", "zur", "zum", "de", "del", "della", "di", "da",
    "du", "le", "la", "ter", "ten", "op", "af", "dos", "das", "dei", "ten",
)

_UMLAUT_MAP = str.maketrans({
    "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
    "Ä": "ae", "Ö": "oe", "Ü": "ue", "ẞ": "ss",
    # Letters that carry no combining mark and would otherwise be dropped.
    "ı": "i", "İ": "i", "ł": "l", "Ł": "l", "ø": "oe", "Ø": "oe",
    "đ": "d", "Đ": "d", "ð": "d", "Ð": "d", "þ": "th", "Þ": "th",
    "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ħ": "h", "ŋ": "ng",
})

_SEPARATORS = re.compile(r"[\s\-‐-―'’`´.]+")
_NON_ALPHA = re.compile(r"[^a-z]")


def strip_accents(value: str) -> str:
    """Remove combining marks, but expand German umlauts first.

    "Müller" -> "mueller", "Šimek" -> "simek".
    """
    expanded = value.translate(_UMLAUT_MAP)
    decomposed = unicodedata.normalize("NFD", expanded)
    without_marks = "".join(c for c in decomposed if not unicodedata.combining(c))
    return unicodedata.normalize("NFC", without_marks)


def split_prefix(name: str) -> tuple[str, str]:
    """Split a nobiliary particle from the core name.

    Returns (prefix, core). The prefix is lowercased, the core keeps its
    original casing. Names without a particle return ("", name).
    """
    cleaned = name.strip()
    lowered = cleaned.lower()
    for prefix in sorted(NAME_PREFIXES, key=len, reverse=True):
        token = prefix + " "
        if lowered.startswith(token):
            core = cleaned[len(token):].strip()
            if core:
                return prefix, core
    return "", cleaned


def normalize(name: str, *, keep_prefix: bool = False) -> str:
    """Return the canonical comparison form of a name.

    Lowercased, accent-free, umlauts expanded, separators removed.
    """
    if not name:
        return ""
    prefix, core = split_prefix(name)
    base = f"{prefix} {core}" if (keep_prefix and prefix) else core
    folded = strip_accents(base).lower()
    folded = _SEPARATORS.sub("", folded)
    return _NON_ALPHA.sub("", folded)


# Ordered rewrite rules applied to the normalised form to produce the
# "skeleton": a lossy key under which orthographic variants collide.
_SKELETON_RULES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(pattern), repl) for pattern, repl in (
        (r"sch", "s"),
        (r"(?:ph)", "f"),
        (r"(?:th)", "t"),
        (r"(?:dt)$", "t"),
        (r"(?:ck)", "k"),
        (r"(?:tz|cz|zz)", "z"),
        (r"(?:chs|x)", "ks"),
        (r"(?:ch)", "k"),
        (r"(?:ei|ai|ey|ay)", "ai"),
        (r"(?:eu|oi|oy|äu)", "oi"),
        (r"(?:ie)", "i"),
        (r"(?:ue)", "u"),
        (r"(?:oe)", "o"),
        (r"(?:ae)", "a"),
        (r"(?:v|w)", "f"),
        (r"(?:c|q|g)", "k"),
        (r"(?:y|j)", "i"),
        (r"(?:d)$", "t"),
        (r"(?:b)$", "p"),
        (r"(?:mann)$", "man"),
        (r"(.)\1+", r"\1"),
    )
)


def skeleton(name: str) -> str:
    """Aggressive orthographic key.

    Maier/Mayer/Meier/Meyer collapse, as do Schmidt/Schmitt and
    Neumann/Neuman. Intended as a blocking key, not as a decision.
    """
    value = normalize(name)
    for pattern, repl in _SKELETON_RULES:
        value = pattern.sub(repl, value)
    value = re.sub(r"(.)\1+", r"\1", value)
    return value


def display_form(name: str) -> str:
    """Tidy a raw source string for display without changing its letters."""
    collapsed = re.sub(r"\s+", " ", name.strip())
    collapsed = collapsed.strip(" ,;:")
    return collapsed
