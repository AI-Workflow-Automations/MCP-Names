import { resolve } from "node:path";

import { NamesService } from "../src/application/names-service.js";
import { loadConfig } from "../src/config.js";
import { Lexicon } from "../src/namelex/lexicon.js";

export const REPO_ROOT = resolve(import.meta.dir, "..");
export const FAMILY_DB = resolve(REPO_ROOT, "data/fixtures/surnames.sqlite3");
export const GIVEN_DB = resolve(REPO_ROOT, "data/fixtures/given-names.sqlite3");

export function createFixtureService(): NamesService {
  const config = loadConfig({
    ...process.env,
    NAMELEX_DB_PATH: FAMILY_DB,
    NAMELEX_GIVEN_DB_PATH: GIVEN_DB,
  });
  const family = new Lexicon(config.familyDbPath);
  const given = new Lexicon(config.givenDbPath);
  return new NamesService(config, family, given);
}
