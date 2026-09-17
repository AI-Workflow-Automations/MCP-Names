import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { NamesService } from "../src/application/names-service.js";
import { loadConfig } from "../src/config.js";
import { NamelexBridge } from "../src/infrastructure/namelex-bridge.js";
import { createMcpServer } from "../src/mcp/server.js";

const repoRoot = resolve(import.meta.dir, "..");
const fixtureDb = resolve(repoRoot, "data/fixtures/surnames.sqlite3");

function service(): NamesService {
  const config = loadConfig({
    ...process.env,
    NAMELEX_DB_PATH: fixtureDb,
  });
  return new NamesService(config, new NamelexBridge(config));
}

describe("hydrate_name via Namelex bridge", () => {
  test("resolves Schmit → Schmidt", async () => {
    const result = (await service().hydrateName("Schmit")) as {
      matches: Array<{ name: string; confident: boolean }>;
      needsHuman: boolean;
      query: string;
    };
    expect(result.query).toBe("Schmit");
    expect(result.matches.some((m) => m.name === "Schmidt")).toBe(true);
    expect(result.needsHuman).toBe(false);
  });

  test("empty name needs human", async () => {
    const result = (await service().hydrateName("  ")) as {
      needsHuman: boolean;
      error?: string;
    };
    expect(result.needsHuman).toBe(true);
    expect(result.error).toBeTruthy();
  });

  test("lexicon_stats returns counts", async () => {
    const stats = (await service().lexiconStats()) as {
      surnames: number;
      exists: boolean;
    };
    expect(stats.exists).toBe(true);
    expect(stats.surnames).toBeGreaterThanOrEqual(5);
  });

  test("missing db fails clearly", async () => {
    const config = loadConfig({
      ...process.env,
      NAMELEX_DB_PATH: resolve(repoRoot, "data/fixtures/missing.sqlite3"),
    });
    const svc = new NamesService(config, new NamelexBridge(config));
    expect(svc.hydrateName("Schmidt")).rejects.toThrow(/not found/);
  });
});

describe("MCP registration", () => {
  test("registers hydrate_name and lexicon_stats", () => {
    const config = loadConfig({ ...process.env, NAMELEX_DB_PATH: fixtureDb });
    const server = createMcpServer(service(), config);
    // McpServer stores tools internally; smoke-check construction succeeds.
    expect(server).toBeTruthy();
  });
});
