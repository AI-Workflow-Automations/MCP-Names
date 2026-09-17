"""GND (Gemeinsame Normdatei) person records, CC0.

The DNB publishes the authority file as bulk dumps (RDF/XML, Turtle,
N-Triples, JSON-LD) via its Linked Data Service at https://data.dnb.de/GND/.
The exact file name changes with each release, so the path or URL is passed
in rather than hard-coded.

Two things are extracted per person record:

* the surname of the preferred name    -> frequency signal
* the surnames of all variant names    -> spelling-variant pairs

The variant names are the reason this source matters: they are real,
editorially curated alternative spellings of the same person's name, which
gives a gold set for calibrating similarity thresholds instead of guessing
them.

Caveat: the GND is bibliographic. It over-represents historic and
scholarly names and under-represents the contemporary population.
"""
from __future__ import annotations

import gzip
import io
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Iterator, TextIO

from . import NameRecord

LICENSE = "CC0 1.0 (DNB / GND)"
DUMP_INDEX = "https://data.dnb.de/GND/"

_SUBJECT = re.compile(r"^<(?P<iri>[^>]+)>")
_LITERAL = re.compile(r'"(?P<value>(?:[^"\\]|\\.)*)"')

_PREFERRED_PREDICATES = ("preferredNameForThePerson",)
_VARIANT_PREDICATES = ("variantNameForThePerson",)
_SURNAME_PREDICATES = ("surname",)

# "<1920-1998>", "<Familie>", trailing role additions
_ANGLE_ADDITION = re.compile(r"<[^>]*>")
_ROMAN_ORDINAL = re.compile(r"^[IVXLC]+\.?$")


def _unescape(value: str) -> str:
    return (value.replace("\\\\", "\\").replace('\\"', '"')
            .replace("\\n", " ").replace("\\t", " ").strip())


def surname_from_label(label: str) -> str:
    """Extract the family name from a GND person label.

    GND writes "Nachname, Vorname". Labels without a comma are mononyms
    (rulers, saints, medieval persons) and yield nothing.
    """
    cleaned = _ANGLE_ADDITION.sub(" ", label).strip()
    if "," not in cleaned:
        return ""
    surname = cleaned.split(",", 1)[0].strip(" .;:")
    surname = re.sub(r"\s+", " ", surname)
    if not surname or len(surname) < 2:
        return ""
    if _ROMAN_ORDINAL.match(surname):
        return ""
    if not re.search(r"[A-Za-zÀ-ÿ]", surname):
        return ""
    return surname


def _open(path: Path) -> TextIO:
    if path.suffix == ".gz":
        return io.TextIOWrapper(gzip.open(path, "rb"), encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def iter_person_names(path: Path) -> Iterator[tuple[str, str, str]]:
    """Yield (subject, kind, label) triples from an N-Triples/Turtle dump.

    ``kind`` is "preferred", "variant" or "surname".
    """
    with _open(path) as handle:
        for line in handle:
            if "NameForThePerson" not in line and "#surname" not in line:
                continue
            literal = _LITERAL.search(line)
            if not literal:
                continue
            value = _unescape(literal.group("value"))
            if not value:
                continue
            subject_match = _SUBJECT.match(line)
            subject = subject_match.group("iri") if subject_match else ""
            if any(p in line for p in _PREFERRED_PREDICATES):
                yield subject, "preferred", value
            elif any(p in line for p in _VARIANT_PREDICATES):
                yield subject, "variant", value
            elif any(f"#{p}" in line for p in _SURNAME_PREDICATES):
                yield subject, "surname", value


def iter_person_names_jsonld(path: Path) -> Iterator[tuple[str, str, str]]:
    """Same as ``iter_person_names`` for line-delimited JSON-LD."""
    with _open(path) as handle:
        for line in handle:
            line = line.strip().rstrip(",")
            if not line or line in "[]":
                continue
            try:
                node = json.loads(line)
            except json.JSONDecodeError:
                continue
            subject = node.get("@id", "")
            for key, value in node.items():
                if key.endswith("preferredNameForThePerson"):
                    kind = "preferred"
                elif key.endswith("variantNameForThePerson"):
                    kind = "variant"
                elif key.endswith("surname"):
                    kind = "surname"
                else:
                    continue
                for item in value if isinstance(value, list) else [value]:
                    text = item.get("@value") if isinstance(item, dict) else item
                    if isinstance(text, str) and text.strip():
                        yield subject, kind, text.strip()


def build_counts(path: Path, out: Path, *, jsonld: bool = False,
                 min_count: int = 1) -> Path:
    """Aggregate a dump into ``{"name", "count", "variants"}`` JSON lines."""
    reader = iter_person_names_jsonld if jsonld else iter_person_names
    counts: dict[str, int] = defaultdict(int)
    variants: dict[str, set[str]] = defaultdict(set)
    per_subject: dict[str, dict[str, set[str]]] = defaultdict(
        lambda: {"preferred": set(), "variant": set()})

    for subject, kind, label in reader(path):
        surname = label if kind == "surname" else surname_from_label(label)
        if not surname:
            continue
        bucket = "preferred" if kind in ("preferred", "surname") else "variant"
        per_subject[subject][bucket].add(surname)

    for record in per_subject.values():
        preferred = record["preferred"]
        for name in preferred:
            counts[name] += 1
        for variant in record["variant"]:
            for name in preferred:
                if variant != name:
                    variants[name].add(variant)
        if not preferred:
            for variant in record["variant"]:
                counts[variant] += 1

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for name, count in sorted(counts.items(), key=lambda kv: -kv[1]):
            if count < min_count:
                continue
            handle.write(json.dumps(
                {"name": name, "count": count,
                 "variants": sorted(variants.get(name, ()))},
                ensure_ascii=False) + "\n")
    return out


def load(path: Path) -> Iterator[NameRecord]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            entry = json.loads(line)
            yield NameRecord(name=entry["name"], count=int(entry["count"]),
                             source="gnd", variants=list(entry.get("variants", [])))
