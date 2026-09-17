/** Runtime configuration for MCP Names. */

import { resolve } from "node:path";

export interface AppConfig {
  /** Absolute path to the Namelex SQLite database. */
  dbPath: string;
  matchLimit: number;
  similarityThreshold: number;
  repoRoot: string;
}

const REPO_ROOT = resolve(import.meta.dir, "..");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawDb = env.NAMELEX_DB_PATH ?? "data/fixtures/surnames.sqlite3";
  const dbPath = resolve(REPO_ROOT, rawDb);
  return {
    dbPath,
    matchLimit: Number(env.NAMELEX_MATCH_LIMIT ?? "5"),
    similarityThreshold: Number(env.NAMELEX_SIMILARITY_THRESHOLD ?? "0.86"),
    repoRoot: REPO_ROOT,
  };
}
