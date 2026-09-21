import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type NextFunction, type Request, type Response } from "express";

import type { NamesService } from "../application/names-service.js";
import type { AppConfig } from "../config.js";
import type { NameKind } from "../domain/types.js";
import { createMcpServer } from "../mcp/server.js";

/**
 * HTTP: MCP Streamable HTTP, REST-API, Health.
 * Alle Pfade nutzen dieselbe Fassade wie der stdio-MCP.
 */

export function createApp(service: NamesService, config: AppConfig): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(bearerAuth(config.authToken));

  app.get("/health", (_req, res) => {
    res.json(service.health());
  });

  app.post(
    "/api/hydrate",
    asyncRoute(async (req) => {
      const name = requireString(req.body, "name");
      const kind = optionalKind(req.body);
      return service.hydrateName(name, {
        kind,
        limit: optionalNumber(req.body, "limit"),
        threshold: optionalNumber(req.body, "threshold"),
      });
    }),
  );

  app.get(
    "/api/stats",
    asyncRoute(async () => service.lexiconStats()),
  );

  app.get(
    "/api/search",
    asyncRoute(async (req) =>
      service.searchNames({
        prefix: typeof req.query.prefix === "string" ? req.query.prefix : undefined,
        kind: req.query.kind === "given" ? "given" : "family",
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    ),
  );

  app.post(
    "/api/suggest",
    asyncRoute(async (req) => {
      const name = requireString(req.body, "name");
      return service.suggestNames(name, {
        kind: optionalKind(req.body),
        limit: optionalNumber(req.body, "limit"),
      });
    }),
  );

  mountMcp(app, service, config);
  app.use(errorHandler);
  return app;
}

function mountMcp(app: express.Express, service: NamesService, config: AppConfig): void {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res, next) => {
    try {
      const sessionId = req.get("mcp-session-id");
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Keine gültige Session. Zuerst initialize senden." },
            id: null,
          });
          return;
        }
        const created = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, created);
          },
        });
        created.onclose = () => {
          if (created.sessionId) transports.delete(created.sessionId);
        };
        await createMcpServer(service, config).connect(created);
        transport = created;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });

  const forwardToSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.get("mcp-session-id");
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        res.status(400).send("Unbekannte Session");
        return;
      }
      await transport.handleRequest(req, res);
    } catch (error) {
      next(error);
    }
  };
  app.get("/mcp", forwardToSession);
  app.delete("/mcp", forwardToSession);
}

function bearerAuth(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!token || req.path === "/health") return next();
    if (req.get("authorization") === `Bearer ${token}`) return next();
    res.status(401).json({ error: "unauthorized" });
  };
}

class BadRequestError extends Error {}

function requireString(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`Feld "${key}" fehlt oder ist leer.`);
  }
  return value;
}

function optionalKind(body: unknown): NameKind | undefined {
  const value = (body as Record<string, unknown> | undefined)?.kind;
  return value === "given" || value === "family" ? value : undefined;
}

function optionalNumber(body: unknown, key: string): number | undefined {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asyncRoute(handler: (req: Request) => Promise<unknown> | unknown) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      next(error);
    }
  };
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = (error as Error).message ?? "Unbekannter Fehler";
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: message, needsHuman: true });
    return;
  }
  console.error(`[mcp-names] ${message}`);
  res.status(500).json({ error: message, needsHuman: true });
}
