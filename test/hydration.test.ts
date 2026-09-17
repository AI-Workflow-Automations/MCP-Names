import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { NamesService } from "../src/application/names-service.js";
import { loadConfig } from "../src/config.js";
import { createMcpServer } from "../src/mcp/server.js";
import { Lexicon } from "../src/namelex/lexicon.js";
import { normalize, skeleton } from "../src/namelex/normalize.js";
import { cologne } from "../src/namelex/phonetics.js";

const repoRoot = resolve(import.meta.dir, "..");
const fixtureDb = resolve(repoRoot, "data/fixtures/surnames.sqlite3");

function service(): NamesService {
  const config = loadConfig({
    ...process.env,
    NAMELEX_DB_PATH: fixtureDb,
  });
  return new NamesService(config, new Lexicon(config.dbPath));
}

describe("namelex normalize/phonetics", () => {
  test("normalizes Müller", () => {
    expect(normalize("Müller")).toBe("mueller");
    expect(skeleton("Schmidt")).toBe(skeleton("Schmitt"));
  });

  test("cologne reference values", () => {
    expect(cologne("Breschnew")).toBe("17863");
    expect(cologne("Mueller-Luedenscheidt")).toBe("65752682");
  });
});

describe("hydrate_name (pure TypeScript)", () => {
  test("resolves Schmit → Schmidt", () => {
    const result = service().hydrateName("Schmit");
    expect(result.query).toBe("Schmit");
    expect(result.matches?.some((m) => m.name === "Schmidt")).toBe(true);
    expect(result.needsHuman).toBe(false);
  });

  test("empty name needs human", () => {
    const result = service().hydrateName("  ");
    expect(result.needsHuman).toBe(true);
    expect(result.error).toBeTruthy();
  });

  test("lexicon_stats returns counts", () => {
    const stats = service().lexiconStats();
    expect(stats.exists).toBe(true);
    expect(stats.surnames).toBeGreaterThanOrEqual(5);
  });

  test("missing db fails clearly", () => {
    const config = loadConfig({
      ...process.env,
      NAMELEX_DB_PATH: resolve(repoRoot, "data/fixtures/missing.sqlite3"),
    });
    expect(() => new NamesService(config, new Lexicon(config.dbPath))).toThrow(/not found/);
  });
});

describe("MCP registration", () => {
  test("registers hydrate_name and lexicon_stats", () => {
    const config = loadConfig({ ...process.env, NAMELEX_DB_PATH: fixtureDb });
    const server = createMcpServer(service(), config);
    expect(server).toBeTruthy();
  });
});
