/** Curated ASR hard-case seeds always merged into fetched lexicons. */

import type { BuildRecord } from "../src/namelex/build.js";

export const CURATED_FAMILY: BuildRecord[] = [
  { name: "Müller", count: 46400, source: "curated", origin: "German", variants: ["Mueller", "Muller"] },
  { name: "Schmidt", count: 31905, source: "curated", variants: ["Schmitt", "Schmid", "Schmit"] },
  { name: "Schneider", count: 16824, source: "curated", variants: ["Schnyder"] },
  { name: "Fischer", count: 14200, source: "curated" },
  { name: "Weber", count: 12100, source: "curated" },
  { name: "Meyer", count: 11000, source: "curated", variants: ["Meier", "Maier", "Mayer"] },
  { name: "Wagner", count: 10500, source: "curated" },
  { name: "Becker", count: 9800, source: "curated" },
  { name: "Schulz", count: 9200, source: "curated", variants: ["Schultz"] },
  { name: "Hoffmann", count: 8800, source: "curated", variants: ["Hofmann"] },
  { name: "Schäfer", count: 7500, source: "curated", variants: ["Schaefer"] },
  { name: "Koch", count: 7200, source: "curated" },
  { name: "Bauer", count: 7000, source: "curated" },
  { name: "Richter", count: 6800, source: "curated" },
  { name: "Klein", count: 6500, source: "curated" },
  { name: "Wolf", count: 6200, source: "curated" },
  { name: "Schröder", count: 6000, source: "curated", variants: ["Schroeder"] },
  { name: "Neumann", count: 5800, source: "curated", variants: ["Neuman"] },
  { name: "Schwarz", count: 5600, source: "curated" },
  { name: "Zimmermann", count: 5400, source: "curated" },
  { name: "Braun", count: 5200, source: "curated" },
  { name: "Krüger", count: 5000, source: "curated", variants: ["Krueger"] },
  { name: "Hofmann", count: 4800, source: "curated" },
  { name: "Hartmann", count: 4600, source: "curated" },
  { name: "Lange", count: 4400, source: "curated" },
  { name: "Yıldırım", count: 800, source: "curated", variants: ["Yildirim", "Jildirim"] },
  { name: "Szczepański", count: 400, source: "curated", variants: ["Szczepanski"] },
  { name: "Nguyen", count: 5000, source: "curated" },
  { name: "Öztürk", count: 600, source: "curated", variants: ["Oeztuerk", "Ozturk"] },
  { name: "Mustermann", count: 1, source: "curated" },
  { name: "Bergmann", count: 1200, source: "curated" },
];

export const CURATED_GIVEN: BuildRecord[] = [
  { name: "Mia", count: 10000, source: "curated" },
  { name: "Jannik", count: 5000, source: "curated", variants: ["Yannick", "Janik"] },
  { name: "Yannick", count: 4200, source: "curated", variants: ["Jannik"] },
  { name: "Klaus", count: 7000, source: "curated", variants: ["Claus"] },
  { name: "Claus", count: 2500, source: "curated", variants: ["Klaus"] },
  { name: "Noah", count: 12000, source: "curated" },
  { name: "Emma", count: 10500, source: "curated" },
  { name: "Sophie", count: 11500, source: "curated", variants: ["Sofie"] },
];
