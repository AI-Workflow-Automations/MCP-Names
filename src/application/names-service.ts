/**
 * Fassade: Vor- und Nachnamen-Hydrierung für MCP und REST.
 */

import { existsSync } from "node:fs";

import type { AppConfig } from "../config.js";
import type { NameKind } from "../domain/types.js";
import type { Lexicon } from "../namelex/lexicon.js";
import { hydrateNameVoice, searchNames, suggestNames } from "../namelex/voice.js";

export interface HydrateOptions {
  kind?: NameKind;
  limit?: number;
  threshold?: number;
}

export class NamesService {
  constructor(
    readonly config: AppConfig,
    private readonly family: Lexicon,
    private readonly given: Lexicon | null,
  ) {}

  close(): void {
    this.family.close();
    this.given?.close();
  }

  private lexiconFor(kind: NameKind): Lexicon {
    if (kind === "given") {
      if (!this.given) {
        throw new Error("given names not configured (set NAMELEX_GIVEN_DB_PATH)");
      }
      return this.given;
    }
    return this.family;
  }

  hydrateName(name: string, options: HydrateOptions = {}) {
    const kind = options.kind ?? "family";
    try {
      const lexicon = this.lexiconFor(kind);
      return hydrateNameVoice(lexicon, name, {
        kind,
        limit: options.limit ?? this.config.matchLimit,
        threshold: options.threshold ?? this.config.similarityThreshold,
      });
    } catch (error) {
      if (kind === "given" && /not configured|not found/i.test((error as Error).message)) {
        return {
          query: name,
          kind,
          confidence: 0,
          best: null,
          alternatives: [],
          needsHuman: true,
          followUp: "spell_or_human" as const,
          hints: {
            normalizedQuery: "",
            cologne: "",
            skeleton: "",
            reasonDe: "Vornamen-Lexikon nicht konfiguriert",
            spellOut: [],
          },
          error: "given names not configured",
        };
      }
      throw error;
    }
  }

  searchNames(options: { prefix?: string; kind?: NameKind; limit?: number } = {}) {
    const kind = options.kind ?? "family";
    const lexicon = this.lexiconFor(kind);
    return { kind, ...searchNames(lexicon, options) };
  }

  suggestNames(name: string, options: HydrateOptions = {}) {
    const kind = options.kind ?? "family";
    const lexicon = this.lexiconFor(kind);
    return suggestNames(lexicon, name, {
      kind,
      limit: options.limit ?? 3,
      threshold: options.threshold ?? this.config.similarityThreshold,
    });
  }

  lexiconStats() {
    const family = {
      ...this.family.stats(),
      db: this.config.familyDbPath,
      exists: existsSync(this.config.familyDbPath),
      kind: "family" as const,
    };
    const given = this.given
      ? {
          ...this.given.stats(),
          db: this.config.givenDbPath,
          exists: existsSync(this.config.givenDbPath),
          kind: "given" as const,
        }
      : { exists: false, kind: "given" as const, entries: 0, surnames: 0 };
    return {
      ok: family.exists,
      family,
      given,
      // Back-compat flat fields (acceptance docs / older clients)
      surnames: family.surnames,
      entries: family.entries + (given.entries ?? 0),
      variants: family.variants + ((given as { variants?: number }).variants ?? 0),
      probability_mass: family.probability_mass,
      licenses: family.licenses,
      db: family.db,
      exists: family.exists,
      kinds: ["family", ...(this.given ? (["given"] as const) : [])],
      threshold_default: this.config.similarityThreshold,
    };
  }

  health() {
    const stats = this.lexiconStats();
    return {
      ok: stats.family.exists,
      service: "mcp-names",
      lexicon: {
        family: { path: this.config.familyDbPath, readable: stats.family.exists, entries: stats.family.entries },
        given: {
          path: this.config.givenDbPath,
          readable: Boolean(this.given && stats.given.exists),
          entries: (stats.given as { entries?: number }).entries ?? 0,
        },
      },
      thresholds: {
        similarity: this.config.similarityThreshold,
        matchLimit: this.config.matchLimit,
      },
    };
  }
}
