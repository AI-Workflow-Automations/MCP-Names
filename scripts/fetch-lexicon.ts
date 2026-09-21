/**
 * Fetch open DE name sources and build SQLite lexicons (TypeScript only).
 *
 * v1 sources (see internal/name-sources.md):
 * - Onomaverse DE given + surname (CC BY 4.0)
 * - Köln Vornamen Gesamt (DL-DE-Zero-2.0)
 * - München Vornamen (DL-DE-BY-2.0) via CKAN
 * - Berlin häufige Vornamen aggregate (CC BY 3.0 DE) via GitHub
 * - Wikidata given/family SPARQL sample pages (CC0) — optional, capped
 *
 * Usage:
 *   bun run scripts/fetch-lexicon.ts
 *   bun run scripts/fetch-lexicon.ts --offline-fixtures   # curated only
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type BuildRecord, buildLexiconDb } from "../src/namelex/build.js";

const ROOT = resolve(import.meta.dir, "..");
const CACHE = resolve(ROOT, "data/cache");
const FIXTURES = resolve(ROOT, "data/fixtures");

const ONOMA_GIVEN =
  "https://github.com/onomaverse/datasets/releases/download/v2026.06/given-name-frequency.csv";
const ONOMA_SURNAME =
  "https://github.com/onomaverse/datasets/releases/download/v2026.06/surname-frequency.csv";
const KOELN =
  "https://www.offenedaten-koeln.de/sites/default/files/distribution/Gesamt_Vornamen_2019-2022_0.csv";
const MUENCHEN_PACKAGE = "https://opendata.muenchen.de/api/3/action/package_show?id=vornamen-von-neugeborenen";
const BERLIN_TARBALL = "https://codeload.github.com/berlin/haeufige-vornamen-berlin/tar.gz/refs/heads/main";

const ONOMA_ATTR =
  "Onomaverse: CC BY 4.0 - Names data from Onomaverse (https://onomaverse.com/datasets), licensed CC BY 4.0.";

async function fetchText(url: string, destName: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const dest = resolve(CACHE, destName);
  console.error(`fetch ${url}`);
  const res = await fetch(url, {
    headers: { "user-agent": "mcp-names-fetch/0.2 (+https://github.com/AI-Workflow-Automations/MCP-Names)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  writeFileSync(dest, text);
  return text;
}

function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = lines[0]!.includes(";") && !lines[0]!.includes(",") ? ";" : ",";
  const split = (line: string) => line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]!).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function col(headers: string[], names: string[]): number {
  for (const name of names) {
    const i = headers.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function parseOnomaverse(text: string, country: string, source: string): BuildRecord[] {
  const { headers, rows } = parseDelimited(text);
  const iName = col(headers, ["name"]);
  const iCountry = col(headers, ["country_code"]);
  const iCount = col(headers, ["count"]);
  const iOrigin = col(headers, ["origin"]);
  if (iName < 0 || iCountry < 0 || iCount < 0) throw new Error("unexpected onomaverse schema");
  const out: BuildRecord[] = [];
  for (const row of rows) {
    if ((row[iCountry] ?? "").toUpperCase() !== country) continue;
    const name = row[iName] ?? "";
    const count = Number(row[iCount] ?? 0);
    if (!name || !Number.isFinite(count) || count <= 0) continue;
    out.push({ name, count, source, origin: row[iOrigin] ?? "" });
  }
  return out;
}

function parseMunicipalGiven(text: string, source: string): BuildRecord[] {
  const { headers, rows } = parseDelimited(text);
  const iName = col(headers, ["vorname", "name"]);
  const iCount = col(headers, ["anzahl", "count"]);
  if (iName < 0 || iCount < 0) {
    console.error(`skip ${source}: headers=${headers.join("|")}`);
    return [];
  }
  const agg = new Map<string, number>();
  for (const row of rows) {
    const name = row[iName] ?? "";
    const count = Number((row[iCount] ?? "0").replace(",", "."));
    if (!name || !Number.isFinite(count) || count <= 0) continue;
    agg.set(name, (agg.get(name) ?? 0) + count);
  }
  return [...agg.entries()].map(([name, count]) => ({ name, count, source }));
}

async function fetchKoeln(): Promise<BuildRecord[]> {
  const text = await fetchText(KOELN, "koeln-vornamen.csv");
  return parseMunicipalGiven(text, "koeln:open-data");
}

async function fetchMuenchen(): Promise<BuildRecord[]> {
  const metaText = await fetchText(MUENCHEN_PACKAGE, "muenchen-package.json");
  const meta = JSON.parse(metaText) as {
    result?: { resources?: Array<{ format?: string; url?: string; name?: string }> };
  };
  const resources = meta.result?.resources ?? [];
  const csv = resources
    .filter((r) => (r.format ?? "").toLowerCase() === "csv" && r.url)
    .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))[0];
  if (!csv?.url) {
    console.error("muenchen: no CSV resource");
    return [];
  }
  const text = await fetchText(csv.url, "muenchen-vornamen.csv");
  return parseMunicipalGiven(text, "muenchen:open-data");
}

async function fetchBerlin(): Promise<BuildRecord[]> {
  // Prefer a yearly aggregate JSON if present in the repo via raw; fall back to one district sample.
  const candidates = [
    "https://raw.githubusercontent.com/berlin/haeufige-vornamen-berlin/main/data/2023/all_names.json",
    "https://raw.githubusercontent.com/berlin/haeufige-vornamen-berlin/main/all_names.json",
  ];
  for (const url of candidates) {
    try {
      const text = await fetchText(url, "berlin-all-names.json");
      const data = JSON.parse(text) as unknown;
      const agg = new Map<string, number>();
      const ingest = (name: string, count: number) => {
        if (!name || count <= 0) return;
        agg.set(name, (agg.get(name) ?? 0) + count);
      };
      if (Array.isArray(data)) {
        for (const row of data) {
          const r = row as Record<string, unknown>;
          ingest(String(r.vorname ?? r.name ?? ""), Number(r.anzahl ?? r.count ?? 0));
        }
      } else if (data && typeof data === "object") {
        for (const [name, val] of Object.entries(data as Record<string, unknown>)) {
          if (typeof val === "number") ingest(name, val);
          else if (val && typeof val === "object") {
            const o = val as Record<string, unknown>;
            ingest(name, Number(o.anzahl ?? o.count ?? 0));
          }
        }
      }
      if (agg.size > 0) {
        return [...agg.entries()].map(([name, count]) => ({
          name,
          count,
          source: "berlin:open-data",
        }));
      }
    } catch (error) {
      console.error(`berlin candidate failed: ${(error as Error).message}`);
    }
  }
  // Lightweight fallback: clone tip via sparse CSV path for one year/one bezirk pattern
  void BERLIN_TARBALL;
  console.error("berlin: no usable aggregate; skipping");
  return [];
}

async function fetchWikidataFamilySample(maxPages = 20): Promise<BuildRecord[]> {
  // Cap for agent builds — full crawl can be raised later.
  const endpoint = "https://query.wikidata.org/sparql";
  const out: BuildRecord[] = [];
  let after = "";
  for (let page = 0; page < maxPages; page++) {
    const filter = after ? `FILTER(STR(?item) > "${after}")` : "";
    const query = `
      SELECT ?item ?itemLabel WHERE {
        ?item wdt:P31 wd:Q101352 .
        ${filter}
        SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en,mul". }
      }
      ORDER BY ?item
      LIMIT 200
    `;
    const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
    console.error(`wikidata family page ${page + 1}`);
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/sparql-results+json",
          "user-agent": "mcp-names-fetch/0.2",
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        console.error(`wikidata HTTP ${res.status}`);
        break;
      }
      const json = (await res.json()) as {
        results: { bindings: Array<{ item: { value: string }; itemLabel: { value: string } }> };
      };
      const bindings = json.results.bindings;
      if (bindings.length === 0) break;
      for (const b of bindings) {
        const label = b.itemLabel.value;
        if (!label || /^Q\d+$/.test(label)) continue;
        out.push({ name: label, count: 1, source: "wikidata" });
        after = b.item.value;
      }
      await Bun.sleep(500);
    } catch (error) {
      console.error(`wikidata page failed: ${(error as Error).message}`);
      break;
    }
  }
  return out;
}

function asciiVariants(name: string): string[] {
  const map: Record<string, string> = {
    ä: "ae",
    ö: "oe",
    ü: "ue",
    ß: "ss",
    Ä: "Ae",
    Ö: "Oe",
    Ü: "Ue",
  };
  let ascii = "";
  for (const ch of name) ascii += map[ch] ?? ch;
  ascii = ascii.normalize("NFD").replace(/\p{M}/gu, "");
  return ascii !== name ? [ascii] : [];
}

function withAsciiVariants(records: BuildRecord[]): BuildRecord[] {
  return records.map((r) => ({
    ...r,
    variants: [...new Set([...(r.variants ?? []), ...asciiVariants(r.name)])],
  }));
}

async function main() {
  const offline = process.argv.includes("--offline-fixtures");
  mkdirSync(FIXTURES, { recursive: true });

  if (offline) {
    console.error("offline mode — run scripts/build-fixtures.ts instead");
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("bun", ["run", "scripts/build-fixtures.ts"], { stdio: "inherit", cwd: ROOT });
    process.exit(r.status ?? 1);
  }

  const given: BuildRecord[] = [];
  const family: BuildRecord[] = [];
  const licenses = new Set<string>([
    "Wikidata: CC0 1.0",
    ONOMA_ATTR,
    "Köln Open Data: DL-DE-Zero-2.0",
    "München Open Data: DL-DE-BY-2.0 (Landeshauptstadt München)",
    "Berlin Open Data: CC BY 3.0 DE (BerlinOnline / LABO)",
  ]);

  try {
    const onomaGiven = await fetchText(ONOMA_GIVEN, "onomaverse-given.csv");
    given.push(...parseOnomaverse(onomaGiven, "DE", "onomaverse"));
  } catch (e) {
    console.error(`onoma given failed: ${(e as Error).message}`);
  }

  try {
    const onomaSur = await fetchText(ONOMA_SURNAME, "onomaverse-surname.csv");
    family.push(...parseOnomaverse(onomaSur, "DE", "onomaverse"));
  } catch (e) {
    console.error(`onoma surname failed: ${(e as Error).message}`);
  }

  try {
    given.push(...(await fetchKoeln()));
  } catch (e) {
    console.error(`koeln failed: ${(e as Error).message}`);
  }

  try {
    given.push(...(await fetchMuenchen()));
  } catch (e) {
    console.error(`muenchen failed: ${(e as Error).message}`);
  }

  try {
    given.push(...(await fetchBerlin()));
  } catch (e) {
    console.error(`berlin failed: ${(e as Error).message}`);
  }

  try {
    family.push(...(await fetchWikidataFamilySample(8)));
  } catch (e) {
    console.error(`wikidata failed: ${(e as Error).message}`);
  }

  const familyPath = resolve(FIXTURES, "surnames.sqlite3");
  const givenPath = resolve(FIXTURES, "given-names.sqlite3");

  const { CURATED_FAMILY, CURATED_GIVEN } = await import("./curated-seeds.ts");
  family.push(...CURATED_FAMILY);
  given.push(...CURATED_GIVEN);

  buildLexiconDb(familyPath, withAsciiVariants(family), {
    kind: "family",
    licenses: [...licenses],
  });
  console.log(`wrote ${familyPath} (${family.length} source rows)`);

  buildLexiconDb(givenPath, withAsciiVariants(given), {
    kind: "given",
    licenses: [...licenses],
  });
  console.log(`wrote ${givenPath} (${given.length} source rows)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
