"""Offline tests for the Wikidata keyset pagination."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from namelex.sources import wikidata  # noqa: E402


class FakeResponse:
    def __init__(self, payload):
        self.status_code = 200
        self.headers = {}
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def make_server(items):
    """Fake requests.get over a sorted list of (subject, rows).

    Honours both the keyset FILTER and the LIMIT of the query, the way the
    real endpoint does.
    """

    def get(url, params=None, headers=None, timeout=None):
        query = params["query"]
        after = query.split("FILTER(?item > <")[1].split(">")[0]
        limit = int(query.rsplit("LIMIT", 1)[1].strip())
        flat = []
        for subject, rows in items:
            if subject > after:
                flat.extend(rows)
        return FakeResponse({"results": {"bindings": flat[:limit]}})

    return get


def build_items():
    items = []
    for i in range(1, 13):
        subject = f"http://www.wikidata.org/entity/Q{i:03d}"
        rows = [{"item": {"value": subject}, "label": {"value": f"Name{i}"}}]
        # Q005 has many aliases and will straddle a page boundary.
        alias_count = 6 if i == 5 else 1
        for a in range(alias_count):
            rows.append({"item": {"value": subject},
                         "alias": {"value": f"Alias{i}_{a}"}})
        items.append((subject, rows))
    return items


def test_no_rows_lost_across_page_boundary(tmp_path):
    items = build_items()
    get = make_server(items)
    cache = tmp_path / "lex.jsonl"
    wikidata.fetch_lexicon(cache, get=get, refresh=True, page_size=5)
    entries = [json.loads(line) for line in cache.read_text(encoding="utf-8").splitlines()]
    by_qid = {e["qid"]: e for e in entries}

    assert len(by_qid) == 12, "every item must be collected exactly once"
    assert len(by_qid["Q005"]["aliases"]) == 6, "aliases must survive the boundary"
    for i in range(1, 13):
        assert by_qid[f"Q{i:03d}"]["labels"] == [f"Name{i}"]


def test_sparql_retries_on_429():
    calls = {"n": 0}

    class Throttled(FakeResponse):
        def __init__(self):
            super().__init__({"results": {"bindings": []}})
            self.status_code = 429
            self.headers = {"Retry-After": "0"}

    def get(url, params=None, headers=None, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return Throttled()
        return FakeResponse({"results": {"bindings": [{"x": {"value": "1"}}]}})

    result = wikidata.sparql("SELECT * WHERE {}", get=get)
    assert calls["n"] == 2
    assert result == [{"x": {"value": "1"}}]
