"""Command line entry point: fetch -> build -> query."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import build as build_module
from .query import Lexicon, as_dict
from .verify import report as verify_report
from .sources import NameRecord, gnd, onomaverse, wikidata, wordlist


def cmd_fetch(args: argparse.Namespace) -> int:
    data = Path(args.data)
    data.mkdir(parents=True, exist_ok=True)

    if "onomaverse" in args.sources:
        path = data / "onomaverse-surname-frequency.csv"
        if args.refresh or not path.exists():
            onomaverse.download(path)
        print(f"onomaverse: {path}")

    if "wikidata" in args.sources:
        lexicon = wikidata.fetch_lexicon(data / "wikidata-lexicon.jsonl",
                                         refresh=args.refresh,
                                         max_pages=args.max_pages)
        print(f"wikidata lexicon: {lexicon}")
        persons = wikidata.fetch_person_counts(data / "wikidata-persons.jsonl",
                                               refresh=args.refresh,
                                               max_pages=args.max_pages)
        print(f"wikidata persons: {persons}")

    if "gnd" in args.sources:
        if not args.gnd_dump:
            print("gnd: pass --gnd-dump with the downloaded DNB dump "
                  "(see https://data.dnb.de/GND/)", file=sys.stderr)
            return 2
        out = gnd.build_counts(Path(args.gnd_dump), data / "gnd-surnames.jsonl",
                               jsonld=args.gnd_dump.endswith((".jsonld",
                                                              ".jsonld.gz")))
        print(f"gnd: {out}")
    return 0


def _collect(data: Path) -> list[NameRecord]:
    records: list[NameRecord] = []
    onomaverse_csv = data / "onomaverse-surname-frequency.csv"
    if onomaverse_csv.exists():
        records.extend(onomaverse.load(onomaverse_csv))
    wikidata_lexicon = data / "wikidata-lexicon.jsonl"
    if wikidata_lexicon.exists():
        records.extend(wikidata.load_lexicon(wikidata_lexicon))
    wikidata_persons = data / "wikidata-persons.jsonl"
    if wikidata_persons.exists():
        records.extend(wikidata.load_person_counts(wikidata_persons))
    gnd_counts = data / "gnd-surnames.jsonl"
    if gnd_counts.exists():
        records.extend(gnd.load(gnd_counts))
    for extra in sorted(data.glob("*.txt")):
        records.extend(wordlist.load(extra))
    return records


def cmd_build(args: argparse.Namespace) -> int:
    data = Path(args.data)
    records = _collect(data)
    if not records:
        print(f"no source extracts found in {data}; run 'namelex fetch' first",
              file=sys.stderr)
        return 2
    entries = build_module.merge(records)
    weights = json.loads(args.weights) if args.weights else None
    path = build_module.build(Path(args.db), entries, weights=weights)
    lexicon = Lexicon(path)
    print(json.dumps(lexicon.stats(), indent=2, ensure_ascii=False))
    lexicon.close()
    return 0


def cmd_query(args: argparse.Namespace) -> int:
    lexicon = Lexicon(Path(args.db))
    payload = {
        "query": args.name,
        "probability": lexicon.probability(args.name),
        "matches": [as_dict(m) for m in lexicon.match(args.name, limit=args.limit)],
        "variants": lexicon.variants_of(args.name),
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    lexicon.close()
    return 0


def cmd_calibrate(args: argparse.Namespace) -> int:
    """Derive a similarity threshold from the GND variant pairs."""
    import random
    from .normalize import normalize
    from .similarity import similarity

    lexicon = Lexicon(Path(args.db))
    rows = lexicon.connection.execute(
        "SELECT s.norm AS a, v.norm AS b FROM variant v "
        "JOIN surname s ON s.id = v.surname_id").fetchall()
    positives = [similarity(r["a"], r["b"]) for r in rows if r["a"] and r["b"]]

    names = [r[0] for r in lexicon.connection.execute(
        "SELECT norm FROM surname ORDER BY RANDOM() LIMIT 4000")]
    random.seed(0)
    negatives = []
    for _ in range(min(len(positives) * 4, 20000) or 5000):
        a, b = random.sample(names, 2) if len(names) > 1 else ("", "")
        negatives.append(similarity(a, b))

    if not positives:
        print("no variant pairs in the database; add the GND source first",
              file=sys.stderr)
        return 2

    best = (0.0, 0.0)
    for step in range(50, 100):
        threshold = step / 100
        true_positive = sum(1 for p in positives if p >= threshold)
        false_positive = sum(1 for n in negatives if n >= threshold)
        precision = true_positive / max(true_positive + false_positive, 1)
        recall = true_positive / len(positives)
        f1 = 2 * precision * recall / max(precision + recall, 1e-9)
        if f1 > best[1]:
            best = (threshold, f1)
    print(json.dumps({
        "variant_pairs": len(positives),
        "random_pairs": len(negatives),
        "suggested_threshold": best[0],
        "f1": round(best[1], 4),
        "positive_median": round(sorted(positives)[len(positives) // 2], 4),
        "negative_p99": round(sorted(negatives)[int(len(negatives) * 0.99)], 4),
    }, indent=2))
    lexicon.close()
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    print(json.dumps(verify_report(Path(args.db)), indent=2, ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="namelex",
                                     description="German surname lexicon builder")
    parser.add_argument("--data", default="data", help="cache directory")
    parser.add_argument("--db", default="data/surnames.sqlite3")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch = sub.add_parser("fetch", help="download and extract the sources")
    fetch.add_argument("--sources", nargs="+",
                       default=["onomaverse", "wikidata"],
                       choices=["onomaverse", "wikidata", "gnd"])
    fetch.add_argument("--gnd-dump", help="path to a downloaded DNB GND dump")
    fetch.add_argument("--max-pages", type=int, default=None,
                       help="limit SPARQL pages (for a smoke test)")
    fetch.add_argument("--refresh", action="store_true")
    fetch.set_defaults(func=cmd_fetch)

    build_cmd = sub.add_parser("build", help="build the SQLite database")
    build_cmd.add_argument("--weights", help="JSON source weights")
    build_cmd.set_defaults(func=cmd_build)

    query = sub.add_parser("query", help="look up a name")
    query.add_argument("name")
    query.add_argument("--limit", type=int, default=5)
    query.set_defaults(func=cmd_query)

    verify = sub.add_parser("verify", help="structural sanity checks on the build")
    verify.set_defaults(func=cmd_verify)

    calibrate = sub.add_parser("calibrate",
                               help="suggest a similarity threshold from GND pairs")
    calibrate.set_defaults(func=cmd_calibrate)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
