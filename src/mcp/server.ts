import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { NamesService } from "../application/names-service.js";
import type { AppConfig } from "../config.js";
import { mcpTexts } from "./tool-texts.js";

/**
 * MCP-Server: übersetzt Tool-Aufrufe in Aufrufe der Fassade.
 * Hier steht keine Fachlogik – Hydrierung läuft über src/namelex.
 */

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message, needsHuman: true }) }],
  };
}

async function guarded(action: () => Promise<unknown> | unknown) {
  try {
    return jsonResult(await action());
  } catch (error) {
    return errorResult((error as Error).message);
  }
}

export function createMcpServer(service: NamesService, _config: AppConfig): McpServer {
  const texts = mcpTexts;
  const server = new McpServer({ name: "mcp-names", version: "0.1.0" }, { instructions: texts.instructions });

  const hydrate = texts.tools.hydrate_name;
  server.registerTool(
    "hydrate_name",
    {
      title: hydrate.title,
      description: hydrate.description,
      inputSchema: {
        name: z.string().describe(hydrate.inputs.name),
        limit: z.number().int().min(1).max(50).optional().describe(hydrate.inputs.limit),
        threshold: z.number().min(0).max(1).optional().describe(hydrate.inputs.threshold),
      },
    },
    ({ name, limit, threshold }) => guarded(() => service.hydrateName(name, { limit, threshold })),
  );

  const stats = texts.tools.lexicon_stats;
  server.registerTool(
    "lexicon_stats",
    {
      title: stats.title,
      description: stats.description,
      inputSchema: {},
    },
    () => guarded(() => service.lexiconStats()),
  );

  return server;
}
