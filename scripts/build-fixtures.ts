#!/usr/bin/env bun
/**
 * Offline curated fixtures (no network). Prefer `pnpm fetch-lexicon` for production-sized DBs.
 */

import { resolve } from "node:path";

import { buildLexiconDb } from "../src/namelex/build.js";
import { CURATED_FAMILY, CURATED_GIVEN } from "./curated-seeds.js";

const ROOT = resolve(import.meta.dir, "..");

buildLexiconDb(resolve(ROOT, "data/fixtures/surnames.sqlite3"), CURATED_FAMILY, {
  kind: "family",
  licenses: [
    "Wikidata: CC0 1.0",
    "GND/DNB: CC0 1.0",
    "Onomaverse: CC BY 4.0 - Names data from Onomaverse (https://onomaverse.com/datasets)",
  ],
});
console.log("wrote surnames fixture");

buildLexiconDb(resolve(ROOT, "data/fixtures/given-names.sqlite3"), CURATED_GIVEN, {
  kind: "given",
  licenses: ["Municipal open data / curated offline head"],
});
console.log("wrote given-names fixture");
