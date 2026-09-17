"""Wikidata loaders (CC0).

Two independent extractions:

* ``fetch_lexicon``      - every item that is an instance of "family name"
                           (Q101352) together with its German/multilingual
                           labels and aliases. This is the recall layer.
* ``fetch_person_counts``- surnames (P734) carried by humans (Q5) with German
                           citizenship (P27 = Q183). Counting these gives a
                           real, if prominence-biased, frequency signal.

Both use keyset pagination over the item IRI rather than OFFSET, because the
Wikidata Query Service degrades badly on large offsets but is fast when the
subject is bounded.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable, Iterator

import requests

from . import NameRecord

ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "namelex/0.1 (surname lexicon build; contact: dh@mike-bergmann.de)"
PAGE_SIZE = 5000
LICENSE = "CC0 1.0 (Wikidata)"

LEXICON_QUERY = """
SELECT ?item ?label ?alias WHERE {{
  ?item wdt:P31 wd:Q101352 .
  FILTER(?item > <{after}>)
  OPTIONAL {{ ?item rdfs:label ?label . FILTER(LANG(?label) IN ("de", "mul")) }}
  OPTIONAL {{ ?item skos:altLabel ?alias . FILTER(LANG(?alias) IN ("de", "mul")) }}
}}
ORDER BY ?item
LIMIT {limit}
"""

PERSON_QUERY = """
SELECT ?person ?surnameLabel WHERE {{
  ?person wdt:P31 wd:Q5 ;
          wdt:P27 wd:Q183 ;
          wdt:P734 ?surname .
  FILTER(?person > <{after}>)
  ?surname rdfs:label ?surnameLabel .
  FILTER(LANG(?surnameLabel) IN ("de", "mul"))
}}
ORDER BY ?person
LIMIT {limit}
"""

SENTINEL = "http://www.wikidata.org/entity/Q0"

HttpGet = Callable[..., Any]


def sparql(query: str, *, get: HttpGet | None = None, retries: int = 5) -> list[dict]:
    """Run a SPARQL query and return the binding list.

    ``get`` is injectable so the pagination logic can be tested offline.
    """
    getter = get or requests.get
    delay = 2.0
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            response = getter(
                ENDPOINT,
                params={"query": query, "format": "json"},
                headers={"Accept": "application/sparql-results+json",
                         "User-Agent": USER_AGENT},
                timeout=180,
            )
            if response.status_code == 429:
                wait = float(response.headers.get("Retry-After", delay))
                time.sleep(wait)
                delay = min(delay * 2, 60)
                continue
            response.raise_for_status()
            return response.json()["results"]["bindings"]
        except Exception as exc:  # network flakiness, gateway timeouts
            last_error = exc
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise RuntimeError(f"SPARQL query failed after {retries} attempts") from last_error


def _paginate(template: str, key: str, *, get: HttpGet | None = None,
              page_size: int | None = None, start: str = SENTINEL,
              max_pages: int | None = None) -> Iterator[list[dict]]:
    """Yield pages of bindings, advancing a keyset cursor.

    One subject can produce several rows (a label plus multiple aliases), so
    the final subject of a full page may have been truncated by LIMIT. That
    subject is dropped from the page and the cursor is set just before it, so
    the next request returns all of its rows. Without this, aliases are
    silently lost at every page boundary.
    """
    base_size = page_size or PAGE_SIZE
    cursor = start
    pages = 0
    while True:
        limit = base_size
        while True:
            bindings = sparql(template.format(after=cursor, limit=limit), get=get)
            if not bindings:
                return
            truncated = len(bindings) >= limit
            if not truncated:
                break
            last_subject = bindings[-1][key]["value"]
            kept = [row for row in bindings if row[key]["value"] != last_subject]
            if kept:
                bindings = kept
                break
            # A single subject fills the whole page, so its rows are cut off.
            # Widen the window until the subject fits, otherwise its aliases
            # would be lost.
            if limit > base_size * 64:
                break
            limit *= 4

        yield bindings
        new_cursor = bindings[-1][key]["value"]
        if new_cursor == cursor:
            return
        cursor = new_cursor
        pages += 1
        if max_pages is not None and pages >= max_pages:
            return
        if not truncated:
            return


def fetch_lexicon(cache: Path, *, get: HttpGet | None = None,
                  refresh: bool = False, max_pages: int | None = None,
                  page_size: int | None = None) -> Path:
    """Write one JSON object per family-name item to ``cache``."""
    if cache.exists() and not refresh:
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    collected: dict[str, dict[str, Any]] = {}
    for bindings in _paginate(LEXICON_QUERY, "item", get=get, max_pages=max_pages,
                              page_size=page_size):
        for row in bindings:
            qid = row["item"]["value"].rsplit("/", 1)[-1]
            entry = collected.setdefault(qid, {"qid": qid, "labels": [], "aliases": []})
            if "label" in row:
                value = row["label"]["value"]
                if value not in entry["labels"]:
                    entry["labels"].append(value)
            if "alias" in row:
                value = row["alias"]["value"]
                if value not in entry["aliases"]:
                    entry["aliases"].append(value)
    with cache.open("w", encoding="utf-8") as handle:
        for entry in collected.values():
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return cache


def fetch_person_counts(cache: Path, *, get: HttpGet | None = None,
                        refresh: bool = False, max_pages: int | None = None,
                        page_size: int | None = None) -> Path:
    """Write ``{"name": ..., "count": ...}`` lines to ``cache``."""
    if cache.exists() and not refresh:
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for bindings in _paginate(PERSON_QUERY, "person", get=get, max_pages=max_pages,
                              page_size=page_size):
        for row in bindings:
            name = row["surnameLabel"]["value"].strip()
            if name:
                counts[name] = counts.get(name, 0) + 1
    with cache.open("w", encoding="utf-8") as handle:
        for name, count in sorted(counts.items(), key=lambda kv: -kv[1]):
            handle.write(json.dumps({"name": name, "count": count},
                                    ensure_ascii=False) + "\n")
    return cache


def load_lexicon(cache: Path) -> Iterator[NameRecord]:
    with cache.open("r", encoding="utf-8") as handle:
        for line in handle:
            entry = json.loads(line)
            labels = entry.get("labels") or []
            if not labels:
                continue
            primary, *rest = labels
            yield NameRecord(
                name=primary,
                count=0,
                source="wikidata",
                variants=[*rest, *entry.get("aliases", [])],
            )


def load_person_counts(cache: Path) -> Iterator[NameRecord]:
    with cache.open("r", encoding="utf-8") as handle:
        for line in handle:
            entry = json.loads(line)
            yield NameRecord(name=entry["name"], count=int(entry["count"]),
                             source="wikidata_persons")
