/**
 * Read-only Namelex lookup API — TypeScript port of packages/namelex query.py.
 * Opens the SQLite lexicon with bun:sqlite (read-only).
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

import { NgramModel } from "./ngram.js";
import { normalize, skeleton } from "./normalize.js";
import { cologne } from "./phonetics.js";
import { similarity } from "./similarity.js";

export const DEFAULT_THRESHOLD = 0.86;

export interface SurnameRow {
  id: number;
  name: string;
  norm: string;
  skeleton: string;
  cologne: string;
  length: number;
  prob: number;
  log_prob: number;
  plausibility: number;
  rank_de: number | null;
  sources: string;
}

export interface Match {
  name: string;
  score: number;
  similarity: number;
  probability: number;
  rank: number | null;
  sources: string;
  exact: boolean;
  matched_via: string;
  confident: boolean;
}

export interface ProbabilityResult {
  name: string;
  known: boolean;
  probability: number;
  log_probability: number;
  plausibility: number;
  rank: number | null;
  sources: string;
}

export class Lexicon {
  readonly dbPath: string;
  private readonly db: Database;
  readonly meta: Record<string, string>;
  private readonly model: NgramModel;

  constructor(dbPath: string) {
    if (!existsSync(dbPath)) {
      throw new Error(
        `Namelex database not found at ${dbPath}. Set NAMELEX_DB_PATH or ship data/fixtures/surnames.sqlite3.`,
      );
    }
    this.dbPath = dbPath;
    this.db = new Database(dbPath, { readonly: true });
    const metaRows = this.db.query("SELECT key, value FROM meta").all() as Array<{
      key: string;
      value: string;
    }>;
    this.meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const ngramRows = this.db.query("SELECT gram, n, count FROM ngram").all() as Array<{
      gram: string;
      n: number;
      count: number;
    }>;
    this.model = NgramModel.fromRows(
      ngramRows.map((r) => [r.gram, r.n, r.count] as [string, number, number]),
      {
        maxOrder: Number(this.meta.ngram_max_order ?? 4),
        median: Number(this.meta.ngram_median ?? -3.0),
        spread: Number(this.meta.ngram_spread ?? 1.0),
      },
    );
  }

  close(): void {
    this.db.close();
  }

  lookup(name: string): SurnameRow | null {
    const row = this.db.query("SELECT * FROM surname WHERE norm = ?").get(normalize(name)) as SurnameRow | null;
    return row ?? null;
  }

  probability(name: string): ProbabilityResult {
    const entry = this.lookup(name);
    const norm = normalize(name);
    const plausibility = this.model.plausibility(norm);
    if (entry) {
      return {
        name: entry.name,
        known: true,
        probability: entry.prob,
        log_probability: entry.log_prob,
        plausibility: entry.plausibility,
        rank: entry.rank_de,
        sources: entry.sources,
      };
    }
    return {
      name,
      known: false,
      probability: 0,
      log_probability: -50,
      plausibility,
      rank: null,
      sources: "",
    };
  }

  candidates(name: string, maxCandidates = 400): SurnameRow[] {
    const norm = normalize(name);
    if (!norm) return [];
    const keys = [normalize(name), skeleton(name), cologne(name)] as const;
    const rows = this.db
      .query(
        `SELECT * FROM surname
         WHERE norm = ? OR skeleton = ? OR cologne = ?
            OR (substr(norm, 1, 3) = ? AND abs(length - ?) <= 2)
         ORDER BY prob DESC
         LIMIT ?`,
      )
      .all(...keys, norm.slice(0, 3), norm.length, maxCandidates) as SurnameRow[];
    if (rows.length > 0) return rows;
    return this.db
      .query(
        `SELECT s.* FROM variant v JOIN surname s ON s.id = v.surname_id
         WHERE v.norm = ? OR v.cologne = ? LIMIT ?`,
      )
      .all(norm, cologne(name), maxCandidates) as SurnameRow[];
  }

  match(name: string, options: { limit?: number; threshold?: number; priorWeight?: number } = {}): Match[] {
    const limit = options.limit ?? 5;
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const priorWeight = options.priorWeight ?? 0.32;
    const norm = normalize(name);
    if (!norm) return [];

    const queryCologne = cologne(name);
    const querySkeleton = skeleton(name);
    const results: Match[] = [];

    for (const row of this.candidates(name)) {
      const sim = similarity(norm, row.norm);
      if (sim < threshold - 0.15) continue;
      let matchedVia: string;
      if (row.norm === norm) matchedVia = "exact";
      else if (row.skeleton === querySkeleton) matchedVia = "skeleton";
      else if (row.cologne === queryCologne) matchedVia = "phonetic";
      else matchedVia = "edit";

      let prior = 0;
      if (row.prob > 0) {
        prior = Math.max(0, Math.min(1, (Math.log10(row.prob) + 7) / 7));
      }
      const score = (1 - priorWeight) * sim + priorWeight * prior;
      results.push({
        name: row.name,
        score: round4(score),
        similarity: round4(sim),
        probability: row.prob,
        rank: row.rank_de,
        sources: row.sources,
        exact: row.norm === norm,
        matched_via: matchedVia,
        confident: row.norm === norm || sim >= threshold,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  variantsOf(name: string): string[] {
    const row = this.db.query("SELECT id FROM surname WHERE norm = ?").get(normalize(name)) as { id: number } | null;
    if (!row) return [];
    const variants = this.db.query("SELECT name FROM variant WHERE surname_id = ? ORDER BY name").all(row.id) as Array<{
      name: string;
    }>;
    return variants.map((v) => v.name);
  }

  /** Head of lexicon by prior (for search / keyterms). */
  listNames(limit = 5000): string[] {
    const rows = this.db.query("SELECT name FROM surname ORDER BY prob DESC, name ASC LIMIT ?").all(limit) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  }

  stats(): {
    surnames: number;
    entries: number;
    probability_mass: number;
    variants: number;
    licenses: unknown;
  } {
    const counts = this.db.query("SELECT COUNT(*) AS n, SUM(prob) AS mass FROM surname").get() as {
      n: number;
      mass: number | null;
    };
    const variants = this.db.query("SELECT COUNT(*) AS n FROM variant").get() as { n: number };
    let licenses: unknown = [];
    try {
      licenses = JSON.parse(this.meta.licenses ?? "[]");
    } catch {
      licenses = [];
    }
    return {
      surnames: counts.n,
      entries: counts.n,
      probability_mass: Math.round((counts.mass ?? 0) * 1e6) / 1e6,
      variants: variants.n,
      licenses,
    };
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
