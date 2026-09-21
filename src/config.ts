/** Runtime configuration — only place that reads process.env. */

import { resolve } from "node:path";

export interface AppConfig {
  familyDbPath: string;
  givenDbPath: string;
  matchLimit: number;
  similarityThreshold: number;
  httpPort: number;
  authToken: string;
  webEnabled: boolean;
  publicUrl?: string;
  repoRoot: string;
}

const REPO_ROOT = resolve(import.meta.dir, "..");

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const familyRaw = env.NAMELEX_DB_PATH ?? env.NAMELEX_FAMILY_DB_PATH ?? "data/fixtures/surnames.sqlite3";
  const givenRaw = env.NAMELEX_GIVEN_DB_PATH ?? "data/fixtures/given-names.sqlite3";
  return {
    familyDbPath: resolve(REPO_ROOT, familyRaw),
    givenDbPath: resolve(REPO_ROOT, givenRaw),
    matchLimit: readNumber(env, "NAMELEX_MATCH_LIMIT", 5),
    similarityThreshold: readNumber(env, "NAMELEX_SIMILARITY_THRESHOLD", 0.86),
    httpPort: readNumber(env, "HTTP_PORT", 8080),
    authToken: env.MCP_AUTH_TOKEN ?? "",
    webEnabled: env.WEB_ENABLED !== "false",
    publicUrl: env.PUBLIC_URL?.trim() || undefined,
    repoRoot: REPO_ROOT,
  };
}

/** @deprecated use familyDbPath */
export type { AppConfig as Config };
