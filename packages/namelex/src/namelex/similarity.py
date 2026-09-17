"""String similarity tuned for German names.

Pure standard library so the MCP server has no hard dependency. If
``rapidfuzz`` is installed it is used for the hot path instead.
"""
from __future__ import annotations

from functools import lru_cache

# QWERTZ layout. Substituting a key for one of its physical neighbours is a
# far more likely typo than an arbitrary substitution, so it costs less.
_ROWS = (
    "qwertzuiopü",
    "asdfghjklöä",
    "yxcvbnm",
)
_ROW_OFFSET = (0.0, 0.5, 1.5)


def _keyboard_positions() -> dict[str, tuple[float, float]]:
    positions: dict[str, tuple[float, float]] = {}
    for row_index, row in enumerate(_ROWS):
        for col_index, char in enumerate(row):
            positions[char] = (row_index, col_index + _ROW_OFFSET[row_index])
    return positions


_POSITIONS = _keyboard_positions()

# Pairs that are routinely interchanged in German name spelling. Treated as
# near-free substitutions.
_SOFT_PAIRS = {
    frozenset("iy"), frozenset("ck"), frozenset("kc"), frozenset("fv"),
    frozenset("vw"), frozenset("sz"), frozenset("dt"), frozenset("bp"),
    frozenset("gk"), frozenset("mn"), frozenset("ae"), frozenset("ou"),
}


@lru_cache(maxsize=4096)
def substitution_cost(a: str, b: str) -> float:
    """Cost of replacing ``a`` with ``b`` in [0, 1]."""
    if a == b:
        return 0.0
    if frozenset((a, b)) in _SOFT_PAIRS:
        return 0.4
    pos_a, pos_b = _POSITIONS.get(a), _POSITIONS.get(b)
    if pos_a and pos_b:
        distance = ((pos_a[0] - pos_b[0]) ** 2 + (pos_a[1] - pos_b[1]) ** 2) ** 0.5
        if distance <= 1.2:
            return 0.5
    return 1.0


def weighted_edit_distance(source: str, target: str) -> float:
    """Damerau-Levenshtein (OSA) with keyboard- and phoneme-aware costs."""
    if source == target:
        return 0.0
    if not source:
        return float(len(target))
    if not target:
        return float(len(source))

    previous_previous: list[float] = []
    previous = list(range(len(target) + 1))
    previous = [float(x) for x in previous]

    for i, s_char in enumerate(source, start=1):
        current = [float(i)] + [0.0] * len(target)
        for j, t_char in enumerate(target, start=1):
            cost = substitution_cost(s_char, t_char)
            current[j] = min(
                previous[j] + 1.0,          # deletion
                current[j - 1] + 1.0,       # insertion
                previous[j - 1] + cost,     # substitution
            )
            if (i > 1 and j > 1
                    and s_char == target[j - 2]
                    and source[i - 2] == t_char):
                current[j] = min(current[j], previous_previous[j - 2] + 0.7)
        previous_previous, previous = previous, current
    return previous[-1]


def jaro(source: str, target: str) -> float:
    if source == target:
        return 1.0
    if not source or not target:
        return 0.0
    match_window = max(len(source), len(target)) // 2 - 1
    match_window = max(match_window, 0)

    source_flags = [False] * len(source)
    target_flags = [False] * len(target)
    matches = 0
    for i, char in enumerate(source):
        start = max(0, i - match_window)
        end = min(i + match_window + 1, len(target))
        for j in range(start, end):
            if not target_flags[j] and target[j] == char:
                source_flags[i] = target_flags[j] = True
                matches += 1
                break
    if matches == 0:
        return 0.0

    transpositions = 0
    k = 0
    for i, flagged in enumerate(source_flags):
        if not flagged:
            continue
        while not target_flags[k]:
            k += 1
        if source[i] != target[k]:
            transpositions += 1
        k += 1
    transpositions //= 2

    return (matches / len(source)
            + matches / len(target)
            + (matches - transpositions) / matches) / 3.0


def jaro_winkler(source: str, target: str, *, prefix_weight: float = 0.1) -> float:
    score = jaro(source, target)
    prefix = 0
    for a, b in zip(source[:4], target[:4]):
        if a != b:
            break
        prefix += 1
    return score + prefix * prefix_weight * (1 - score)


def similarity(source: str, target: str) -> float:
    """Combined similarity in [0, 1].

    The edit distance carries the structural signal, Jaro-Winkler rewards a
    shared prefix, which matters because German surname typos cluster in the
    ending (-mann/-man, -er/-ers, -dt/-t).
    """
    if not source or not target:
        return 0.0
    if source == target:
        return 1.0
    longest = max(len(source), len(target))
    edit = 1.0 - min(weighted_edit_distance(source, target) / longest, 1.0)
    return 0.65 * edit + 0.35 * jaro_winkler(source, target)
