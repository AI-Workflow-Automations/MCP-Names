#!/usr/bin/env bun
import { createApp } from "./api/app.js";
import { composeService, config } from "./bootstrap.js";

/**
 * HTTP-Einstieg: MCP über Streamable HTTP, REST-API, Health.
 */
const service = composeService();
const app = createApp(service, config);
app.listen(config.httpPort, () => {
  console.error(`[mcp-names] http://localhost:${config.httpPort}  (MCP: /mcp, API: /api/hydrate, Health: /health)`);
});
