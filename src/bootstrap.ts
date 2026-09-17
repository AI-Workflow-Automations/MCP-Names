import { NamesService } from "./application/names-service.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { Lexicon } from "./namelex/index.js";

/** Shared startup for the MCP entrypoint. */
export const config = loadConfig();

export function composeService(cfg: AppConfig = config): NamesService {
  return new NamesService(cfg, new Lexicon(cfg.dbPath));
}
