#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { composeService, config } from "./bootstrap.js";
import { createMcpServer } from "./mcp/server.js";

/**
 * stdio-Transport – Claude Desktop / Claude Code / Inspector.
 */
const service = composeService();
const server = createMcpServer(service, config);
await server.connect(new StdioServerTransport());
console.error("[mcp-names] stdio-Transport bereit");
