import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { NamesService } from "../application/names-service.js";
import type { AppConfig } from "../config.js";
import { mcpTexts } from "./tool-texts.js";

/**
 * MCP-Server: Tool-Aufrufe → NamesService. Keine Fachlogik hier.
 */

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          query: "",
          confidence: 0,
          best: null,
          alternatives: [],
          needsHuman: true,
          followUp: "spell_or_human",
          hints: {
            normalizedQuery: "",
            cologne: "",
            skeleton: "",
            reasonDe: "Werkzeugfehler",
            spellOut: [],
          },
          error: message,
        }),
      },
    ],
  };
}

async function guarded(action: () => Promise<unknown> | unknown) {
  try {
    return jsonResult(await action());
  } catch (error) {
    return errorResult((error as Error).message);
  }
}

const kindSchema = z.enum(["family", "given"]).optional();

export function createMcpServer(service: NamesService, _config?: AppConfig): McpServer {
  const texts = mcpTexts;
  const server = new McpServer({ name: "mcp-names", version: "0.2.0" }, { instructions: texts.instructions });

  const hydrate = texts.tools.hydrate_name;
  server.registerTool(
    "hydrate_name",
    {
      title: hydrate.title,
      description: hydrate.description,
      inputSchema: {
        name: z.string().describe(hydrate.inputs.name),
        kind: kindSchema.describe(hydrate.inputs.kind),
        limit: z.number().int().min(1).max(50).optional().describe(hydrate.inputs.limit),
        threshold: z.number().min(0).max(1).optional().describe(hydrate.inputs.threshold),
      },
    },
    ({ name, kind, limit, threshold }) => guarded(() => service.hydrateName(name, { kind, limit, threshold })),
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

  const search = texts.tools.search_names;
  server.registerTool(
    "search_names",
    {
      title: search.title,
      description: search.description,
      inputSchema: {
        prefix: z.string().optional().describe(search.inputs.prefix),
        kind: kindSchema.describe(search.inputs.kind),
        limit: z.number().int().min(1).max(100).optional().describe(search.inputs.limit),
      },
    },
    ({ prefix, kind, limit }) => guarded(() => service.searchNames({ prefix, kind, limit })),
  );

  const suggest = texts.tools.suggest_names;
  server.registerTool(
    "suggest_names",
    {
      title: suggest.title,
      description: suggest.description,
      inputSchema: {
        name: z.string().describe(suggest.inputs.name),
        kind: kindSchema.describe(suggest.inputs.kind),
        limit: z.number().int().min(1).max(5).optional().describe(suggest.inputs.limit),
      },
    },
    ({ name, kind, limit }) => guarded(() => service.suggestNames(name, { kind, limit })),
  );

  return server;
}
