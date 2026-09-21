# MCP Names

Fault-tolerant German **Vor- und Nachnamen** for phone agents. Matches what speech
recognition thought it heard against an open-name lexicon, returns confidence and a
`followUp` hint instead of guesswork — as an MCP server and a small REST API.

**Runtime:** Bun · **Package manager:** pnpm@12.4.1 · **Lint:** Biome · **Container:** Docker  
**Code:** English, **comments:** German

---

## Quick start

```bash
pnpm install
pnpm fixtures          # rebuild data/fixtures/*.sqlite3
pnpm check             # typecheck + lint + test
pnpm serve             # http://localhost:8080
```

| URL | What |
|---|---|
| `/health` | Lexicon readiness + thresholds |
| `/mcp` | MCP Streamable HTTP |
| `/api/hydrate` | REST hydrate (same facade as MCP) |
| `/api/stats` | Lexicon stats |
| `/api/search` | Prefix search |
| `/api/suggest` | Short voice shortlist |

stdio MCP (Claude Code / Desktop): `.mcp.json` or `bun run src/index.ts`.

### Docker

```bash
pnpm docker:build
docker run --rm -p 8081:8080 mcp-names
# or
pnpm docker:up
```

stdio via Docker:

```bash
claude mcp add mcp-names -- docker run -i --rm ghcr.io/ai-workflow-automations/mcp-names stdio
```

Production lexicon mount:

```bash
docker run -d --name names -p 8081:8080 \
  -e NAMELEX_DB_PATH=/data/names.sqlite3 \
  -e NAMELEX_GIVEN_DB_PATH=/data/given.sqlite3 \
  -v "$PWD/data:/data:ro" \
  ghcr.io/ai-workflow-automations/mcp-names
```

## MCP tools

| Tool | Role |
|---|---|
| `hydrate_name` | Primary — voice UX payload (`confidence`, `best`, `alternatives`, `followUp`, `needsHuman`) |
| `lexicon_stats` | Setup / debug |
| `search_names` | Prefix browse (not for TTS) |
| `suggest_names` | ≤3–5 spoken options |

`kind`: `"family"` (Nachname, default) or `"given"` (Vorname).

Agent order: **`needsHuman` → `followUp` → `best` / `alternatives`**.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NAMELEX_DB_PATH` | `data/fixtures/surnames.sqlite3` | Family lexicon |
| `NAMELEX_GIVEN_DB_PATH` | `data/fixtures/given-names.sqlite3` | Given-name lexicon |
| `NAMELEX_MATCH_LIMIT` | `5` | Match pull size |
| `NAMELEX_SIMILARITY_THRESHOLD` | `0.86` | Confident floor |
| `HTTP_PORT` | `8080` | HTTP listen |
| `MCP_AUTH_TOKEN` | empty | Optional Bearer ( `/health` always open) |

## Data refresh

```bash
pnpm fixtures        # offline curated seeds (small)
pnpm fetch-lexicon   # network: Onomaverse + Köln + München (+ Wikidata sample) → data/fixtures/
```

Shipped fixtures after fetch are production-sized for demos (~400 Nachnamen DE head, ~14k Vornamen). For full Wikidata/GND dumps, raise pagination in `scripts/fetch-lexicon.ts` and point `NAMELEX_*_DB_PATH` at the resulting SQLite. Attribution for Onomaverse (CC BY 4.0) must remain in `meta.licenses`.

## Layout

```
src/domain/         types (voice UX)
src/namelex/        normalize, phonetics, similarity, lexicon, build, voice
src/application/    NamesService facade
src/api/            Express (/health, /mcp, REST)
src/mcp/            tool registration + texts
data/fixtures/      offline SQLite (family + given)
scripts/build-fixtures.ts
```

## Licenses (lexicon sources)

| Source | License |
|---|---|
| Wikidata | CC0 1.0 |
| GND (DNB) | CC0 1.0 |
| Onomaverse | CC BY 4.0 |
| Municipal Vornamen / GovData | per dataset (fixture documents provenance) |
