"""CLI entry: stdio MCP server (Claude Desktop / Claude Code / Inspector)."""
from __future__ import annotations

import sys

from mcp_names.bootstrap import compose_service
from mcp_names.mcp.server import create_mcp_server


def main(argv: list[str] | None = None) -> int:
    _ = argv  # reserved for future transport flags
    try:
        service = compose_service()
    except FileNotFoundError as exc:
        print(f"[mcp-names] {exc}", file=sys.stderr)
        return 2

    server = create_mcp_server(service)
    print("[mcp-names] stdio transport ready", file=sys.stderr)
    # FastMCP.run blocks on stdio; keep ownership of the lexicon for process life.
    try:
        server.run(transport="stdio")
    finally:
        service.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
