/**
 * Build a Namelex-compatible SQLite lexicon from ranked name records (TypeScript).
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

import { NgramModel } from "./ngram.js";
import { normalize, skeleton } from "./normalize.js";
import { cologne } from "./phonetics.js";

export interface BuildRecord {
  name: string;
  count: number;
  source: string;
  variants?: string[];
  origin?: string;
}

const SCHEMA = `
PRAGMA journal_mode = DELETE;
CREATE TABLE IF NOT EXISTS surname (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    norm TEXT NOT NULL,
    skeleton TEXT NOT NULL,
    cologne TEXT NOT NULL,
    prefix TEXT NOT NULL DEFAULT '',
    length INTEGER NOT NULL,
    count_onomaverse INTEGER NOT NULL DEFAULT 0,
    count_wikidata INTEGER NOT NULL DEFAULT 0,
    count_gnd INTEGER NOT NULL DEFAULT 0,
    prob REAL NOT NULL DEFAULT 0.0,
    log_prob REAL NOT NULL DEFAULT 0.0,
    plausibility REAL NOT NULL DEFAULT 0.0,
    rank_de INTEGER,
    origin TEXT NOT NULL DEFAULT '',
    sources TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_surname_norm ON surname(norm);
CREATE INDEX IF NOT EXISTS idx_surname_skeleton ON surname(skeleton);
CREATE INDEX IF NOT EXISTS idx_surname_cologne ON surname(cologne);
CREATE INDEX IF NOT EXISTS idx_surname_prob ON surname(prob DESC);
CREATE TABLE IF NOT EXISTS variant (
    surname_id INTEGER NOT NULL REFERENCES surname(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    norm TEXT NOT NULL,
    cologne TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (surname_id, name)
);
CREATE INDEX IF NOT EXISTS idx_variant_norm ON variant(norm);
CREATE TABLE IF NOT EXISTS ngram (
    gram TEXT NOT NULL,
    n INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (gram, n)
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

interface Merged {
  name: string;
  counts: Record<string, number>;
  variants: Map<string, string>;
  origin: string;
  sources: Set<string>;
  bestCount: number;
}

function preferDisplay(a: string, b: string): string {
  // Prefer German umlaut forms over ASCII transcriptions (Müller > Mueller).
  const umlauts = (s: string) => (s.match(/[äöüÄÖÜß]/g) ?? []).length;
  if (umlauts(a) !== umlauts(b)) return umlauts(a) > umlauts(b) ? a : b;
  // Prefer dotted/special Latin letters used in DE open data (ı, ł, …) over ASCII fold.
  const special = (s: string) => (s.match(/[ıİłŁøØđĐ]/g) ?? []).length;
  if (special(a) !== special(b)) return special(a) > special(b) ? a : b;
  // Otherwise prefer plain ASCII vowels over acute/grave (Mia > Mía).
  const fancy = (s: string) => (s.match(/[áàâéèêíìîóòôúùûý]/gi) ?? []).length;
  if (fancy(a) !== fancy(b)) return fancy(a) < fancy(b) ? a : b;
  return a.length >= b.length ? a : b;
}

export function mergeRecords(records: BuildRecord[]): Map<string, Merged> {
  const merged = new Map<string, Merged>();
  for (const record of records) {
    const key = normalize(record.name);
    if (!key || key.length < 2) continue;
    let entry = merged.get(key);
    if (!entry) {
      entry = {
        name: record.name,
        counts: {},
        variants: new Map(),
        origin: record.origin ?? "",
        sources: new Set(),
        bestCount: record.count,
      };
      merged.set(key, entry);
    } else if (record.count > entry.bestCount) {
      entry.name = preferDisplay(record.name, entry.name);
      entry.bestCount = record.count;
    } else {
      entry.name = preferDisplay(entry.name, record.name);
    }
    entry.sources.add(record.source);
    if (record.count > 0) {
      entry.counts[record.source] = (entry.counts[record.source] ?? 0) + record.count;
    }
    for (const variant of record.variants ?? []) {
      const vNorm = normalize(variant);
      if (vNorm && vNorm !== key) entry.variants.set(variant, record.source);
    }
  }
  return merged;
}

/** Simple proportional probabilities from total counts (fixture-grade). */
export function buildLexiconDb(
  path: string,
  records: BuildRecord[],
  options: { licenses?: string[]; kind?: string } = {},
): string {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) unlinkSync(path);

  const db = new Database(path);
  db.exec(SCHEMA);
  const merged = mergeRecords(records);
  const entries = [...merged.values()].sort((a, b) => {
    const sum = (e: Merged) => Object.values(e.counts).reduce((x, y) => x + y, 0);
    return sum(b) - sum(a) || a.name.localeCompare(b.name, "de");
  });

  const totals = entries.map((e) => Object.values(e.counts).reduce((a, b) => a + b, 0));
  const mass = totals.reduce((a, b) => a + b, 0) || 1;

  const insert = db.prepare(`
    INSERT INTO surname (name, norm, skeleton, cologne, prefix, length, prob, log_prob, plausibility, rank_de, origin, sources)
    VALUES (?, ?, ?, ?, '', ?, ?, ?, 0.5, ?, ?, ?)
  `);
  const insertVariant = db.prepare(
    `INSERT OR IGNORE INTO variant (surname_id, name, norm, cologne, source) VALUES (?, ?, ?, ?, ?)`,
  );

  const model = new NgramModel();
  const norms: string[] = [];

  db.exec("BEGIN");
  entries.forEach((entry, index) => {
    const norm = normalize(entry.name);
    const total = totals[index]!;
    const prob = total > 0 ? total / mass : 1 / entries.length / 10;
    const logProb = Math.log10(Math.max(prob, 1e-12));
    insert.run(
      entry.name,
      norm,
      skeleton(entry.name),
      cologne(entry.name),
      norm.length,
      prob,
      logProb,
      index + 1,
      entry.origin,
      [...entry.sources].sort().join(","),
    );
    const rowId = db.query("SELECT last_insert_rowid() AS id").get() as { id: number };
    const id = rowId.id;
    for (const [variant, source] of entry.variants) {
      insertVariant.run(id, variant, normalize(variant), cologne(variant), source);
    }
    norms.push(norm);
  });

  // Train n-gram on norms with weight by rank inverse
  for (const [i, norm] of norms.entries()) {
    const weight = Math.max(1, Math.round(1000 / (i + 1)));
    for (let n = 1; n <= model.maxOrder; n++) {
      const bucket = model.counts.get(n)!;
      for (const gram of gramsFor(norm, n)) {
        bucket.set(gram, (bucket.get(gram) ?? 0) + weight);
        model.totals.set(n, (model.totals.get(n) ?? 0) + weight);
        if (n === 1) model.vocabulary.add(gram);
      }
    }
  }
  // Calibrate median/spread roughly
  const scores = norms.map((n) => model.logProbability(n) / (n.length + 1)).sort((a, b) => a - b);
  if (scores.length) {
    model.median = scores[Math.floor(scores.length * 0.5)] ?? -3;
    const p05 = scores[Math.floor(scores.length * 0.05)] ?? model.median - 1;
    model.spread = Math.max(model.median - p05, 1e-6);
  }

  const insertNgram = db.prepare(`INSERT INTO ngram (gram, n, count) VALUES (?, ?, ?)`);
  for (const [n, bucket] of model.counts) {
    for (const [gram, count] of bucket) {
      if (count >= 2 || n <= 2) insertNgram.run(gram, n, count);
    }
  }

  // Update plausibility column
  const updatePlaus = db.prepare(`UPDATE surname SET plausibility = ? WHERE norm = ?`);
  for (const norm of norms) {
    updatePlaus.run(model.plausibility(norm), norm);
  }

  const licenses = options.licenses ?? [
    "Wikidata: CC0 1.0",
    "GND/DNB: CC0 1.0",
    "Onomaverse: CC BY 4.0 - Names data from Onomaverse (https://onomaverse.com/datasets)",
    "Municipal open data (Vornamen): see source attribution in meta",
  ];
  const putMeta = db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)`);
  putMeta.run("licenses", JSON.stringify(licenses));
  putMeta.run("ngram_max_order", String(model.maxOrder));
  putMeta.run("ngram_median", String(model.median));
  putMeta.run("ngram_spread", String(model.spread));
  putMeta.run("kind", options.kind ?? "family");
  putMeta.run("built_at", new Date().toISOString());
  db.exec("COMMIT");
  db.close();
  return path;
}

function gramsFor(text: string, order: number): string[] {
  const BOUNDARY = "^";
  const TERMINATOR = "$";
  const padded = BOUNDARY.repeat(order - 1) + text + TERMINATOR;
  const out: string[] = [];
  for (let i = 0; i <= padded.length - order; i++) out.push(padded.slice(i, i + order));
  return out;
}
