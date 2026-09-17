"""Nachnamen-Hydrierung für Telefonagenten – MCP-Server auf Namelex.

Runtime: Python ≥3.10 · MCP: FastMCP (stdio) · Lexikon: [Namelex](packages/namelex)

---

## Warum

Spracherkennung verhört deutsche Nachnamen. Ein Agent, der „Schmit“ ungeprüft
übernimmt, schreibt falsche Daten – der Kunde erlebt das als „der Agent findet
mich nicht“.

Dieser Server hydriert den verstandenen Namen gegen ein offenes Nachnamen-Lexikon
(Namelex): Wahrscheinlichkeit, Fuzzy-Korrekturen, Schreibvarianten, und ein
`needsHuman`-Flag wenn nichts sicher passt.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python scripts/build_fixture_db.py   # falls data/fixtures/surnames.sqlite3 fehlt
pytest -q
mcp-names                            # stdio MCP
```

Claude Code / Desktop (`.mcp.json` ist bereits im Repo):

```bash
claude   # startet mcp-names über .mcp.json
```

Oder manuell:

```bash
claude mcp add mcp-names -- python -m mcp_names
```

Produktion: Lexikon mit Namelex bauen und Pfad setzen:

```bash
namelex fetch --sources onomaverse wikidata
namelex build --db data/surnames.sqlite3
export NAMELEX_DB_PATH=data/surnames.sqlite3
mcp-names
```

## MCP tools

| Tool | Zweck |
|---|---|
| `hydrate_name` | Primäres Hydrierungs-Tool: Wahrscheinlichkeit, Matches, Varianten |
| `lexicon_stats` | Größe / Lizenzen der geladenen DB (Setup/Debug) |

Beispielantwort von `hydrate_name` für `"Schmit"`:

```json
{
  "query": "Schmit",
  "probability": { "known": false, "plausibility": 0.72, ... },
  "matches": [
    { "name": "Schmidt", "score": 0.91, "confident": true, "matched_via": "edit" }
  ],
  "variants": ["Schmid", "Schmitt"],
  "needsHuman": false
}
```

## Konfiguration

| Variable | Default | Bedeutung |
|---|---|---|
| `NAMELEX_DB_PATH` | `data/fixtures/surnames.sqlite3` | SQLite-Lexikon |
| `NAMELEX_MATCH_LIMIT` | `5` | Max. Kandidaten |
| `NAMELEX_SIMILARITY_THRESHOLD` | `0.86` | Soft-Floor für `confident` |

## Layout

```
src/mcp_names/          MCP-Fassade und Tools
packages/namelex/       vendortes Namelex (Hydrierungs-Backend)
data/fixtures/          Offline-Fixture-DB für Tests/Demos
vendor/namelex_1.tar.gz Quellarchiv (Provenienz)
```

## Lizenzen der Lexikon-Quellen

| Quelle | Lizenz |
|---|---|
| Wikidata | CC0 1.0 |
| GND (DNB) | CC0 1.0 |
| Onomaverse | CC BY 4.0 – Attribution: Names data from Onomaverse (https://onomaverse.com/datasets), licensed CC BY 4.0. |

Details: [`packages/namelex/README.md`](packages/namelex/README.md).
