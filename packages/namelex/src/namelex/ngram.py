"""Character n-gram model over the surname lexicon.

Gives every string a plausibility score, including names that appear in no
frequency table. Without this the server would rate "Szczepanski" or
"Yildirim" as implausible purely because they are absent from the German
head of the distribution, which is wrong: roughly a fifth of surnames in
Germany are not of German origin.
"""
from __future__ import annotations

import math
from collections import defaultdict

BOUNDARY = "^"
TERMINATOR = "$"
MAX_ORDER = 4
# Interpolation weights for orders 1..4, highest order first.
LAMBDAS = (0.55, 0.25, 0.15, 0.05)


def grams(text: str, order: int) -> list[str]:
    padded = BOUNDARY * (order - 1) + text + TERMINATOR
    return [padded[i:i + order] for i in range(len(padded) - order + 1)]


class NgramModel:
    def __init__(self, max_order: int = MAX_ORDER):
        self.max_order = max_order
        self.counts: dict[int, dict[str, int]] = {
            n: defaultdict(int) for n in range(1, max_order + 1)
        }
        self.totals: dict[int, int] = {n: 0 for n in range(1, max_order + 1)}
        self.vocabulary: set[str] = set()
        # Set by calibrate(): mean and spread of the per-character log
        # probability across the lexicon itself.
        # Set by calibrate(): robust location and spread of the
        # per-character log probability across the lexicon.
        self.median: float = -3.0
        self.spread: float = 1.0

    def train(self, names, weight_fn=None) -> "NgramModel":
        for name in names:
            weight = weight_fn(name) if weight_fn else 1
            if not name or weight <= 0:
                continue
            self.vocabulary.update(name)
            for n in range(1, self.max_order + 1):
                bucket = self.counts[n]
                for gram in grams(name, n):
                    bucket[gram] += weight
                    self.totals[n] += weight
        return self

    def _conditional(self, gram: str, n: int) -> float:
        """P(last char | preceding n-1 chars) with add-one smoothing."""
        vocabulary_size = max(len(self.vocabulary) + 2, 2)
        if n == 1:
            return (self.counts[1].get(gram, 0) + 1) / (self.totals[1] + vocabulary_size)
        context = gram[:-1]
        context_count = self.counts[n - 1].get(context, 0)
        return (self.counts[n].get(gram, 0) + 1) / (context_count + vocabulary_size)

    def log_probability(self, text: str) -> float:
        """Interpolated log probability of the whole string."""
        if not text:
            return -math.inf
        total = 0.0
        max_order = min(self.max_order, len(text) + 1)
        for position in range(len(text) + 1):
            mixture = 0.0
            for order in range(1, max_order + 1):
                padded = BOUNDARY * (order - 1) + text + TERMINATOR
                end = position + order
                if end > len(padded):
                    continue
                gram = padded[position:end]
                weight = LAMBDAS[min(order, len(LAMBDAS)) - 1]
                mixture += weight * self._conditional(gram, order)
            total += math.log(max(mixture, 1e-12))
        return total

    def calibrate(self, names) -> "NgramModel":
        """Fit the plausibility scale to the lexicon.

        Absolute log probabilities depend on lexicon size and alphabet, so a
        hard-coded threshold would not survive a data refresh. Instead the
        per-character log probability of the lexicon itself defines the
        reference distribution, and plausibility becomes a z-score.
        """
        scores = sorted(self.log_probability(n) / (len(n) + 1) for n in names if n)
        if not scores:
            return self

        def percentile(p: float) -> float:
            index = min(int(p * (len(scores) - 1)), len(scores) - 1)
            return scores[index]

        self.median = percentile(0.50)
        # Percentiles rather than a standard deviation: the lexicon contains
        # legitimate but rare orthographies (Turkish, Polish, Greek) whose
        # scores are long-tailed, and a standard deviation would let them
        # dominate the scale.
        self.spread = max(self.median - percentile(0.05), 1e-6)
        return self

    def plausibility(self, text: str) -> float:
        """Probability-like score in [0, 1], 0.5 at the lexicon mean."""
        if not text:
            return 0.0
        mean_log = self.log_probability(text) / (len(text) + 1)
        z = (mean_log - self.median) / self.spread
        return 1.0 / (1.0 + math.exp(-1.4 * max(min(z, 20.0), -20.0)))

    def export_rows(self, min_count: int = 2):
        for n, bucket in self.counts.items():
            for gram, count in bucket.items():
                if count >= min_count or n <= 2:
                    yield gram, n, count

    @classmethod
    def from_rows(cls, rows, max_order: int = MAX_ORDER, *,
                  median: float | None = None,
                  spread: float | None = None) -> "NgramModel":
        model = cls(max_order)
        if median is not None:
            model.median = median
        if spread is not None:
            model.spread = spread
        for gram, n, count in rows:
            model.counts[n][gram] = count
            model.totals[n] += count
            if n == 1:
                model.vocabulary.add(gram)
        return model
