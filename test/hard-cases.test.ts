import { describe, expect, test } from "bun:test";

import { createFixtureService } from "./fixtures.js";

interface HardCase {
  heard: string;
  kind?: "family" | "given";
  why: string;
  expectBest?: string | string[];
  forbidBest?: string;
  expectNeedsHuman?: boolean;
}

const FAMILY: HardCase[] = [
  { heard: "Schmidt", why: "exact", expectBest: "Schmidt", expectNeedsHuman: false },
  { heard: "Schmit", why: "ASR drop-d", expectBest: "Schmidt", forbidBest: "Schneider", expectNeedsHuman: false },
  { heard: "Mueller", why: "ue for ü", expectBest: "Müller", expectNeedsHuman: false },
  { heard: "Muller", why: "missing umlaut", expectBest: "Müller", expectNeedsHuman: false },
  { heard: "Müller", why: "exact umlaut", expectBest: "Müller", expectNeedsHuman: false },
  { heard: "Schnyder", why: "Swiss variant", expectBest: "Schneider" },
  { heard: "Nguyen", why: "non-German DE", expectBest: "Nguyen", expectNeedsHuman: false },
  { heard: "Yildirim", why: "diacritic loss", expectBest: "Yıldırım" },
  { heard: "Szczepanski", why: "diacritic loss", expectBest: "Szczepański" },
  { heard: "Xylophonowitz", why: "invented", expectNeedsHuman: true },
  { heard: "asdfgh", why: "nonsense", expectNeedsHuman: true },
  { heard: "   ", why: "empty", expectNeedsHuman: true },
];

const GIVEN: HardCase[] = [
  { heard: "Mia", kind: "given", why: "exact", expectBest: "Mia", expectNeedsHuman: false },
  { heard: "Jannik", kind: "given", why: "exact rivalry", expectBest: ["Jannik", "Yannick"] },
  { heard: "Claus", kind: "given", why: "C/K", expectBest: ["Claus", "Klaus"] },
  { heard: "Xyzzy", kind: "given", why: "invented", expectNeedsHuman: true },
];

describe("hard-cases family", () => {
  const service = createFixtureService();
  for (const c of FAMILY) {
    test(`${c.heard} (${c.why})`, () => {
      const r = service.hydrateName(c.heard, { kind: c.kind ?? "family" });
      if (c.expectNeedsHuman !== undefined) expect(r.needsHuman).toBe(c.expectNeedsHuman);
      if (c.expectBest) {
        const allowed = Array.isArray(c.expectBest) ? c.expectBest : [c.expectBest];
        expect(r.best?.name ?? "").toBeTruthy();
        expect(allowed.includes(r.best!.name)).toBe(true);
      }
      if (c.forbidBest) expect(r.best?.name).not.toBe(c.forbidBest);
      if (c.expectNeedsHuman === true) expect(r.followUp).toBe("spell_or_human");
    });
  }
});

describe("hard-cases given", () => {
  const service = createFixtureService();
  for (const c of GIVEN) {
    test(`${c.heard} (${c.why})`, () => {
      const r = service.hydrateName(c.heard, { kind: "given" });
      if (c.expectNeedsHuman !== undefined) expect(r.needsHuman).toBe(c.expectNeedsHuman);
      if (c.expectBest) {
        const allowed = Array.isArray(c.expectBest) ? c.expectBest : [c.expectBest];
        expect(r.best?.name ?? "").toBeTruthy();
        expect(allowed.includes(r.best!.name)).toBe(true);
      }
    });
  }
});
