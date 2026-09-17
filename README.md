# MCP Names – German surname hydration for phone agents

**Runtime:** Bun · **Package manager:** pnpm · **Lint:** Biome · **Lexikon:** [Namelex](packages/namelex) (Python) · **Code:** English, **comments:** German

---

## Why

Speech recognition mangles German surnames. An agent that silently accepts “Schmit” writes bad data; the caller experiences “the agent can’t find me.”

This server hydrates the heard name against an open surname lexicon (Namelex): probability, fuzzy corrections, spelling variants, and a `needsHuman` flag when nothing is confident.

The **MCP surface is TypeScript** (same stack as MCP-Geocoder). Hydration **calls into Namelex** via `namelex hydrate` / `namelex stats`.

## Quick start

```bash
pnpm install
python3 -m pip install -e ".[dev]"          # Namelex CLI bridge
python3 scripts/build_fixture_db.py         # if data/fixtures/surnames.sqlite3 is missing
pnpm check                                  # typecheck + lint + test
bun run src/index.ts                        # stdio MCP
```

Claude Code / Desktop (`.mcp.json` is in the repo):

```bash
claude   # starts mcp-names via bun
```

Or:

```bash
claude mcp add mcp-names -- bun run "$PWD/src/index.ts"
```

Production lexicon:

```bash
namelex fetch --sources onomaverse wikidata
namelex build --db data/surnames.sqlite3
export NAMELEX_DB_PATH=data/surnames.sqlite3
bun run src/index.ts
```

## MCP tools

| Tool | Purpose |
|---|---|
| `hydrate_name` | Primary hydration: probability, matches, variants |
| `lexicon_stats` | DB size / licenses (setup/debug) |

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NAMELEX_DB_PATH` | `data/fixtures/surnames.sqlite3` | SQLite lexicon |
| `NAMELEX_MATCH_LIMIT` | `5` | Max candidates |
| `NAMELEX_SIMILARITY_THRESHOLD` | `0.86` | Soft floor for `confident` |
| `NAMELEX_PYTHON` / `PYTHON` | `python3` | Interpreter for the Namelex bridge |

## Layout

```
src/                    TypeScript MCP server (tools, facade, bridge)
packages/namelex/       Vendored Namelex (build + hydrate CLI)
data/fixtures/          Offline fixture DB for tests/demos
vendor/namelex_1.tar.gz Source archive (provenance)
```

## Licenses (lexicon sources)

| Source | License |
|---|---|
| Wikidata | CC0 1.0 |
| GND (DNB) | CC0 1.0 |
| Onomaverse | CC BY 4.0 – Attribution required |

Details: [`packages/namelex/README.md`](packages/namelex/README.md).
