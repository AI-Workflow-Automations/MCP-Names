/** Runtime configuration for MCP Names. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface AppConfig {
  /** Absolute path to the Namelex SQLite database. */
  dbPath: string;
  matchLimit: number;
  similarityThreshold: number;
  /** Python executable used to invoke the Namelex CLI bridge. */
  pythonPath: string;
  /** Working directory / repo root for resolving relative paths. */
  repoRoot: string;
}

const REPO_ROOT = resolve(import.meta.dir, "..");

function resolvePython(env: NodeJS.ProcessEnv): string {
  if (env.NAMELEX_PYTHON) return env.NAMELEX_PYTHON;
  if (env.PYTHON) return env.PYTHON;
  const venvPython = join(REPO_ROOT, ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawDb = env.NAMELEX_DB_PATH ?? "data/fixtures/surnames.sqlite3";
  const dbPath = resolve(REPO_ROOT, rawDb);
  return {
    dbPath,
    matchLimit: Number(env.NAMELEX_MATCH_LIMIT ?? "5"),
    similarityThreshold: Number(env.NAMELEX_SIMILARITY_THRESHOLD ?? "0.86"),
    pythonPath: resolvePython(env),
    repoRoot: REPO_ROOT,
  };
}
