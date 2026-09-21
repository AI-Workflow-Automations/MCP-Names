import { describe, expect, test } from "bun:test";

import { createFixtureService } from "./fixtures.js";

describe("hydrate_name voice UX", () => {
  const service = createFixtureService();

  test("Schmit → Schmidt with followUp", () => {
    const r = service.hydrateName("Schmit");
    expect(r.query).toBe("Schmit");
    expect(r.best?.name).toBe("Schmidt");
    expect(r.needsHuman).toBe(false);
    expect(r.confidence).toBeGreaterThan(0.8);
    expect(["confirm_one", "choose_two", "choose_few", "accept"]).toContain(r.followUp);
    expect(r.hints.cologne.length).toBeGreaterThan(0);
  });

  test("empty → spell_or_human", () => {
    const r = service.hydrateName("  ");
    expect(r.needsHuman).toBe(true);
    expect(r.best).toBeNull();
    expect(r.followUp).toBe("spell_or_human");
    expect(r.error).toBeTruthy();
  });

  test("Mueller → Müller", () => {
    const r = service.hydrateName("Mueller");
    expect(r.best?.name).toBe("Müller");
    expect(r.needsHuman).toBe(false);
  });

  test("given Jannik", () => {
    const r = service.hydrateName("Jannik", { kind: "given" });
    expect(r.kind).toBe("given");
    expect(r.best?.name).toBe("Jannik");
  });

  test("lexicon_stats dual", () => {
    const s = service.lexiconStats();
    expect(s.exists).toBe(true);
    expect(s.surnames).toBeGreaterThanOrEqual(10);
    expect(s.kinds).toContain("family");
    expect(s.kinds).toContain("given");
  });

  test("search_names prefix", () => {
    const s = service.searchNames({ prefix: "Sch", limit: 10 });
    expect(s.names.some((n) => n.startsWith("Sch"))).toBe(true);
  });

  test("suggest_names capped", () => {
    const s = service.suggestNames("Schmit", { limit: 3 });
    expect(s.suggestions.length).toBeLessThanOrEqual(3);
  });

  test("health ok", () => {
    const h = service.health();
    expect(h.ok).toBe(true);
    expect(h.service).toBe("mcp-names");
  });
});
