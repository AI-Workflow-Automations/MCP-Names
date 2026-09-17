/**
 * Fassade: hydriert Nachnamen über die TypeScript-Namelex-Implementierung.
 */

import type { AppConfig } from "../config.js";
import { hydrateName, type Lexicon, lexiconStats } from "../namelex/index.js";

export interface HydrateOptions {
  limit?: number;
  threshold?: number;
}

export class NamesService {
  constructor(
    readonly config: AppConfig,
    private readonly lexicon: Lexicon,
  ) {}

  close(): void {
    this.lexicon.close();
  }

  hydrateName(name: string, options: HydrateOptions = {}) {
    return hydrateName(this.lexicon, name, {
      limit: options.limit ?? this.config.matchLimit,
      threshold: options.threshold ?? this.config.similarityThreshold,
      dbPath: this.config.dbPath,
    });
  }

  lexiconStats() {
    return lexiconStats(this.lexicon, this.config.dbPath);
  }
}
