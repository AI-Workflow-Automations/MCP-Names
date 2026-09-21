/**
 * Fachliche Typen der Namens-Hydrierung (voice-assist UX).
 * Kein HTTP/MCP/IO hier.
 */

export type NameKind = "family" | "given";

export type MatchKind = "exact" | "variant" | "fuzzy" | "phonetic";

export type FollowUpHint = "accept" | "confirm_one" | "choose_two" | "choose_few" | "spell_or_human";

export interface NameCandidate {
  name: string;
  score: number;
  confident: boolean;
  exact: boolean;
  matchKind: MatchKind;
  spellings: string[];
}

export interface MatchHints {
  normalizedQuery: string;
  cologne: string;
  skeleton: string;
  reasonDe: string;
  spellOut: string[];
}

/** MCP tool result for hydrate_name (voice-optimized). */
export interface HydrateNameResponse {
  query: string;
  kind: NameKind;
  confidence: number;
  best: NameCandidate | null;
  alternatives: NameCandidate[];
  needsHuman: boolean;
  followUp: FollowUpHint;
  hints: MatchHints;
  error?: string;
}

export const SOFT_FLOOR = 0.55;
export const DEFAULT_THRESHOLD = 0.86;
