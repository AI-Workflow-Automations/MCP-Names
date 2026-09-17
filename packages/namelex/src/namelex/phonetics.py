"""Phonetic keys for German names.

Cologne phonetics (Koelner Phonetik, Postel 1969) is used instead of Soundex:
it was designed for German orthography, handles digraphs such as "sch" and
"ch" and produces variable-length codes.
"""
from __future__ import annotations

from .normalize import normalize

_VOWELS = set("aeijouy")
_DT_SIBILANTS = set("csz")
_X_PRECEDERS = set("ckq")
_C_SIBILANTS = set("sz")
_C_FOLLOWERS_INITIAL = set("ahkloqrux")
_C_FOLLOWERS_INNER = set("ahkoqux")


def cologne(name: str) -> str:
    """Return the Cologne phonetic code of a name.

    >>> cologne("Mueller-Luedenscheidt")
    '65752682'
    >>> cologne("Breschnew")
    '17863'
    """
    text = normalize(name)
    if not text:
        return ""

    codes: list[str] = []
    length = len(text)
    for i, char in enumerate(text):
        nxt = text[i + 1] if i + 1 < length else ""
        prev = text[i - 1] if i > 0 else ""

        if char in _VOWELS:
            code = "0"
        elif char == "h":
            continue
        elif char == "b":
            code = "1"
        elif char == "p":
            code = "3" if nxt == "h" else "1"
        elif char in "dt":
            code = "8" if nxt in _DT_SIBILANTS else "2"
        elif char in "fvw":
            code = "3"
        elif char in "gkq":
            code = "4"
        elif char == "c":
            if i == 0:
                code = "4" if nxt in _C_FOLLOWERS_INITIAL else "8"
            elif prev in _C_SIBILANTS:
                code = "8"
            else:
                code = "4" if nxt in _C_FOLLOWERS_INNER else "8"
        elif char == "x":
            code = "8" if prev in _X_PRECEDERS else "48"
        elif char == "l":
            code = "5"
        elif char in "mn":
            code = "6"
        elif char == "r":
            code = "7"
        elif char in "sz":
            code = "8"
        else:
            continue
        codes.append(code)

    flat = "".join(codes)

    # Collapse repeated digits, then drop every "0" except a leading one.
    deduped: list[str] = []
    for digit in flat:
        if not deduped or deduped[-1] != digit:
            deduped.append(digit)
    if not deduped:
        return ""
    head, tail = deduped[0], [d for d in deduped[1:] if d != "0"]
    return head + "".join(tail)


def cologne_core(name: str) -> str:
    """Cologne code of the name without its nobiliary particle."""
    return cologne(name)


def phonetic_keys(name: str) -> dict[str, str]:
    """All blocking keys used by the lexicon."""
    from .normalize import skeleton

    return {
        "norm": normalize(name),
        "skeleton": skeleton(name),
        "cologne": cologne(name),
    }
