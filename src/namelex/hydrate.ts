/** Hydration API: probability, fuzzy matches, variants, needsHuman. */

import { existsSync } from "node:fs";

import type { Lexicon, Match, ProbabilityResult } from "./lexicon.js";

export interface HydrateResult {
  query: string;
  error?: string;
  probability?: ProbabilityResult;
  matches?: Match[];
  variants?: string[];
  needsHuman: boolean;
  lexicon?: { db: string; threshold: number };
}

export function hydrateName(
  lexicon: Lexicon,
  name: string,
  options: { limit?: number; threshold?: number; dbPath?: string } = {},
): HydrateResult {
  const cleaned = (name ?? "").trim();
  if (!cleaned) {
    return { query: name, error: "name must not be empty", needsHuman: true };
  }

  const limit = options.limit ?? 5;
  const threshold = options.threshold ?? 0.86;
  const probability = lexicon.probability(cleaned);
  const matches = lexicon.match(cleaned, { limit, threshold });

  let variantSource = cleaned;
  const top = matches.find((m) => m.confident);
  if (top) variantSource = top.name;
  else if (probability.known) variantSource = probability.name || cleaned;

  return {
    query: cleaned,
    probability,
    matches,
    variants: lexicon.variantsOf(variantSource),
    needsHuman: needsHuman(probability, matches),
    lexicon: {
      db: options.dbPath ?? lexicon.dbPath,
      threshold,
    },
  };
}

export function lexiconStats(lexicon: Lexicon, dbPath: string) {
  return {
    ...lexicon.stats(),
    db: dbPath,
    exists: existsSync(dbPath),
  };
}

export function needsHuman(probability: ProbabilityResult, matches: Match[]): boolean {
  if (probability.known) return false;
  if (matches.some((m) => m.confident && m.exact)) return false;
  if (matches[0]?.confident) return false;
  return true;
}
