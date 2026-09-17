/**
 * Fassade: hydriert Nachnamen über die Namelex-Bridge.
 * Keine Fachlogik hier – Namelex liefert Wahrscheinlichkeit, Matches und Varianten.
 */

import type { AppConfig } from "../config.js";
import type { NamelexBridge } from "../infrastructure/namelex-bridge.js";

export interface HydrateOptions {
  limit?: number;
  threshold?: number;
}

export class NamesService {
  constructor(
    readonly config: AppConfig,
    private readonly bridge: NamelexBridge,
  ) {}

  hydrateName(name: string, options: HydrateOptions = {}): Promise<unknown> {
    return this.bridge.hydrate(name, options);
  }

  lexiconStats(): Promise<unknown> {
    return this.bridge.stats();
  }
}
