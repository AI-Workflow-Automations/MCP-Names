# MCP Names – German surname hydration for phone agents

**Runtime:** Bun · **Package manager:** pnpm · **Lint:** Biome · **Lexikon:** Namelex (TypeScript + SQLite) · **Code:** English, **comments:** German

---

## Why

Speech recognition mangles German surnames. An agent that silently accepts “Schmit” writes bad data; the caller experiences “the agent can’t find me.”

This server hydrates the heard name against an open surname lexicon (Namelex): probability, fuzzy corrections, spelling variants, and a `needsHuman` flag when nothing is confident.

The **MCP surface and hydration engine are pure TypeScript** (Bun + `bun:sqlite`). No Python runtime.

## Quick start

```bash
pnpm install
pnpm check                  # typecheck + lint + test
bun run src/index.ts        # stdio MCP
```

Claude Code / Desktop (`.mcp.json` is in the repo):

```bash
claude   # starts mcp-names via bun
```

Or:

```bash
claude mcp add mcp-names -- bun run "$PWD/src/index.ts"
```

Point at a production lexicon SQLite file (Namelex schema):

```bash
export NAMELEX_DB_PATH=/path/to/surnames.sqlite3
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

## Layout

```
src/mcp/                MCP tools + texts
src/application/        NamesService facade
src/namelex/            TypeScript Namelex (normalize, phonetics, similarity, lexicon, hydrate)
data/fixtures/          Offline fixture SQLite DB
```

## Licenses (lexicon sources)

| Source | License |
|---|---|
| Wikidata | CC0 1.0 |
| GND (DNB) | CC0 1.0 |
| Onomaverse | CC BY 4.0 – Attribution required |
