"""Onomaverse Global Surname Frequency (CC BY 4.0).

Attribution required: "Names data from Onomaverse
(https://onomaverse.com/datasets), licensed CC BY 4.0."

Caveat: the dataset holds roughly 390 surnames for Germany and its
``pct_in_country`` is the share within the dataset, not within the
population. Use it as a rank anchor for the head of the distribution, never
as an absolute probability.
"""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Iterator

import requests

from . import NameRecord

RELEASE = "v2026.06"
CSV_URL = (
    "https://github.com/onomaverse/datasets/releases/download/"
    f"{RELEASE}/surname-frequency.csv"
)
LICENSE = "CC BY 4.0 - Names data from Onomaverse (https://onomaverse.com/datasets)"


def download(dest: Path, *, timeout: int = 120) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(CSV_URL, timeout=timeout)
    response.raise_for_status()
    dest.write_bytes(response.content)
    return dest


def load(path: Path, *, country: str = "DE") -> Iterator[NameRecord]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("country_code") != country:
                continue
            name = (row.get("name") or "").strip()
            if not name:
                continue
            try:
                count = int(row.get("count") or 0)
            except ValueError:
                count = 0
            yield NameRecord(
                name=name,
                count=count,
                source="onomaverse",
                origin=(row.get("origin") or "").strip(),
            )


def fetch(cache_dir: Path, *, country: str = "DE", refresh: bool = False) -> Iterator[NameRecord]:
    path = cache_dir / "onomaverse-surname-frequency.csv"
    if refresh or not path.exists():
        download(path)
    yield from load(path, country=country)
