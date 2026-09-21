/**
 * Voice-UX presentation layer on top of Lexicon.match / probability.
 */

import {
  DEFAULT_THRESHOLD,
  type FollowUpHint,
  type HydrateNameResponse,
  type MatchHints,
  type MatchKind,
  type NameCandidate,
  type NameKind,
  SOFT_FLOOR,
} from "../domain/types.js";
import type { Lexicon, Match } from "./lexicon.js";
import { normalize, skeleton } from "./normalize.js";
import { cologne } from "./phonetics.js";

export function emptyHints(query = ""): MatchHints {
  return {
    normalizedQuery: normalize(query),
    cologne: query.trim() ? cologne(query) : "",
    skeleton: query.trim() ? skeleton(query) : "",
    reasonDe: "Kein Name erkannt",
    spellOut: [],
  };
}

export function deriveFollowUp(r: Omit<HydrateNameResponse, "followUp">): FollowUpHint {
  if (r.needsHuman || !r.best) return "spell_or_human";
  if (r.best.exact && r.best.confident && r.alternatives.length === 0) return "accept";
  if (r.alternatives.length === 0) return "confirm_one";
  if (r.alternatives.length === 1) return "choose_two";
  return "choose_few";
}

function mapMatchKind(m: Match, variants: string[]): MatchKind {
  if (m.exact) return "exact";
  if (m.matched_via === "phonetic") return "phonetic";
  if (variants.some((v) => normalize(v) === normalize(m.name)) || m.matched_via === "skeleton") {
    return m.matched_via === "skeleton" ? "phonetic" : "variant";
  }
  if (m.matched_via === "skeleton") return "phonetic";
  return "fuzzy";
}

function spellOutGroups(name: string): string[] {
  const cleaned = name.trim();
  if (!cleaned) return [];
  // Keep digraphs useful for German spelling on the phone.
  const groups: string[] = [];
  let i = 0;
  const lower = cleaned.toLowerCase();
  while (i < cleaned.length) {
    const digraph = lower.slice(i, i + 2);
    if (["sch", "ch", "ck", "tz", "ie", "ei", "eu", "äu", "ue", "oe", "ae"].some((d) => lower.startsWith(d, i))) {
      const len = digraph.startsWith("sch") || lower.startsWith("sch", i) ? 3 : 2;
      if (lower.startsWith("sch", i)) {
        groups.push(cleaned.slice(i, i + 3));
        i += 3;
        continue;
      }
      groups.push(cleaned.slice(i, i + len));
      i += len;
      continue;
    }
    groups.push(cleaned.slice(i, i + 1));
    i += 1;
  }
  return groups;
}

function reasonDe(best: NameCandidate | null, query: string): string {
  if (!best) return "Kein treffender Name im Lexikon";
  if (best.exact) return "Exakter Lexikon-Treffer";
  if (best.matchKind === "phonetic") return `Kölner Phonetik wie ${best.name}`;
  if (best.matchKind === "variant") return `Schreibvariante → ${best.name}`;
  const a = normalize(query);
  const b = normalize(best.name);
  const delta = Math.abs(a.length - b.length);
  if (delta <= 1) return "Fuzzy: 1 Buchstabe";
  return `Fuzzy-Ähnlichkeit zu ${best.name}`;
}

function toCandidate(m: Match, variants: string[]): NameCandidate {
  const extra = variants.filter((v) => v !== m.name).slice(0, 3);
  return {
    name: m.name,
    score: m.score,
    confident: m.confident,
    exact: m.exact,
    matchKind: mapMatchKind(m, variants),
    spellings: [...new Set([m.name, ...extra])].slice(0, 4),
  };
}

function voiceNeedsHuman(best: NameCandidate | null, alternatives: NameCandidate[], confidence: number): boolean {
  if (!best) return true;
  if (confidence < SOFT_FLOOR) return true;
  // Near-tie between two fuzzy forms → ask, unless already a strong confident hit.
  if (
    alternatives.length >= 1 &&
    !best.exact &&
    !best.confident &&
    Math.abs(best.score - (alternatives[0]?.score ?? 0)) <= 0.05
  ) {
    return true;
  }
  return false;
}

export function hydrateNameVoice(
  lexicon: Lexicon,
  name: string,
  options: {
    kind?: NameKind;
    limit?: number;
    threshold?: number;
  } = {},
): HydrateNameResponse {
  const kind = options.kind ?? "family";
  const cleaned = (name ?? "").trim();
  if (!cleaned) {
    const base: Omit<HydrateNameResponse, "followUp"> = {
      query: name ?? "",
      kind,
      confidence: 0,
      best: null,
      alternatives: [],
      needsHuman: true,
      hints: emptyHints(""),
      error: "name must not be empty",
    };
    return { ...base, followUp: deriveFollowUp(base) };
  }

  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  // Pull enough matches to pick best + 3 alternatives.
  const rawLimit = Math.max(options.limit ?? 5, 8);
  const matches = lexicon.match(cleaned, { limit: rawLimit, threshold });
  const probability = lexicon.probability(cleaned);

  const ranked = matches.map((m) => {
    const variants = lexicon.variantsOf(m.name);
    return toCandidate(m, variants);
  });

  // Prefer confident exact / known display form.
  let best: NameCandidate | null = null;
  const confident = ranked.filter((c) => c.confident);
  if (confident.length > 0) {
    // Prefer higher score; break near-ties toward the longer common form (Schmit→Schmidt not Schmid).
    const sorted = [...confident].sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.02) return b.score - a.score;
      return b.name.length - a.name.length;
    });
    best = sorted[0]!;
  } else if (ranked[0] && ranked[0].score >= SOFT_FLOOR) {
    best = ranked[0];
  } else if (probability.known) {
    best = {
      name: probability.name,
      score: 1,
      confident: true,
      exact: true,
      matchKind: "exact",
      spellings: [probability.name, ...lexicon.variantsOf(probability.name)].slice(0, 4),
    };
  }

  const alternatives = ranked.filter((c) => !best || normalize(c.name) !== normalize(best.name)).slice(0, 3);

  const confidence = best?.score ?? 0;
  const needsHuman = voiceNeedsHuman(best, alternatives, confidence);

  const hints: MatchHints = {
    normalizedQuery: normalize(cleaned),
    cologne: cologne(cleaned),
    skeleton: skeleton(cleaned),
    reasonDe: reasonDe(best, cleaned),
    spellOut: best && !best.exact ? spellOutGroups(best.name) : [],
  };

  const base: Omit<HydrateNameResponse, "followUp"> = {
    query: cleaned,
    kind,
    confidence,
    best,
    alternatives,
    needsHuman,
    hints,
  };
  return { ...base, followUp: deriveFollowUp(base) };
}

export function searchNames(
  lexicon: Lexicon,
  options: { prefix?: string; limit?: number } = {},
): { prefix?: string; names: string[]; count: number; total: number; truncated: boolean } {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const prefix = options.prefix?.trim() ?? "";
  const normPrefix = normalize(prefix);
  const all = lexicon.listNames(5000);
  const filtered = normPrefix ? all.filter((n) => normalize(n).startsWith(normPrefix)) : all;
  const names = filtered.slice(0, limit);
  return {
    prefix: prefix || undefined,
    names,
    count: names.length,
    total: filtered.length,
    truncated: filtered.length > names.length,
  };
}

export function suggestNames(
  lexicon: Lexicon,
  name: string,
  options: { kind?: NameKind; limit?: number; threshold?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 3, 1), 5);
  const hydrated = hydrateNameVoice(lexicon, name, {
    kind: options.kind,
    limit,
    threshold: options.threshold,
  });
  const suggestions = [hydrated.best, ...hydrated.alternatives].filter(Boolean).slice(0, limit);
  return {
    query: hydrated.query,
    kind: hydrated.kind,
    suggestions,
    needsHuman: hydrated.needsHuman,
    followUp: hydrated.followUp,
  };
}
