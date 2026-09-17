"""MCP-Server: Tool-Aufrufe → NamesService. Keine Fachlogik hier."""
from __future__ import annotations

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

from mcp_names.mcp.texts import INSTRUCTIONS, TOOLS
from mcp_names.service import NamesService


def _json(payload: Any) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False)


def create_mcp_server(service: NamesService) -> FastMCP:
    mcp = FastMCP(
        "mcp-names",
        instructions=INSTRUCTIONS,
    )

    hydrate = TOOLS["hydrate_name"]

    @mcp.tool(name="hydrate_name", description=hydrate["description"])
    def hydrate_name(
        name: str,
        limit: int | None = None,
        threshold: float | None = None,
    ) -> str:
        """Hydrate a surname with Namelex probability, matches, and variants."""
        return _json(
            service.hydrate_name(name, limit=limit, threshold=threshold)
        )

    stats = TOOLS["lexicon_stats"]

    @mcp.tool(name="lexicon_stats", description=stats["description"])
    def lexicon_stats() -> str:
        """Return structural stats for the loaded Namelex database."""
        return _json(service.lexicon_stats())

    return mcp
