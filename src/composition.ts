import { existsSync } from "node:fs";

import { NamesService } from "./application/names-service.js";
import type { AppConfig } from "./config.js";
import { Lexicon } from "./namelex/lexicon.js";

/**
 * Composition Root: hier werden konkrete Adapter zusammengesteckt.
 */
export function composeNamesService(config: AppConfig): NamesService {
  const family = new Lexicon(config.familyDbPath);
  const given = existsSync(config.givenDbPath) ? new Lexicon(config.givenDbPath) : null;
  return new NamesService(config, family, given);
}
