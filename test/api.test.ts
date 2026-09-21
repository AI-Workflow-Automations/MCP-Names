import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";

import { createApp } from "../src/api/app.js";
import { loadConfig } from "../src/config.js";
import { createMcpServer } from "../src/mcp/server.js";
import { createFixtureService, FAMILY_DB, GIVEN_DB } from "./fixtures.js";

async function startApp() {
  const service = createFixtureService();
  const config = loadConfig({
    ...process.env,
    NAMELEX_DB_PATH: FAMILY_DB,
    NAMELEX_GIVEN_DB_PATH: GIVEN_DB,
  });
  const app = createApp(service, config);
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe("HTTP API", () => {
  test("GET /health", async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; service: string };
      expect(body.ok).toBe(true);
      expect(body.service).toBe("mcp-names");
    } finally {
      await close();
    }
  });

  test("POST /api/hydrate", async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/hydrate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Schmit" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { best: { name: string } | null; followUp: string };
      expect(body.best?.name).toBe("Schmidt");
      expect(body.followUp).toBeTruthy();
    } finally {
      await close();
    }
  });
});

describe("MCP registration", () => {
  test("registers tools", () => {
    const service = createFixtureService();
    const server = createMcpServer(service);
    expect(server).toBeTruthy();
  });
});
