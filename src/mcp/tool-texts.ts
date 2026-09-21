/**
 * Alles, was der LLM-Agent vom MCP-Server zu lesen bekommt.
 */

export type ToolName = "hydrate_name" | "lexicon_stats" | "search_names" | "suggest_names";

export interface ToolText {
  title: string;
  description: string;
  inputs: Record<string, string>;
}

export interface McpTexts {
  instructions: string;
  tools: Record<ToolName, ToolText>;
}

export const mcpTexts: McpTexts = {
  instructions: [
    "Deutscher Vor- und Nachnamen-Abgleich für Telefonagenten (Namelex).",
    "",
    "Ablauf:",
    "1. hydrate_name mit dem verstandenen Namen (kind=family|given) – nie ungeprüft übernehmen.",
    "2. Zuerst needsHuman, dann followUp, dann best / alternatives prüfen.",
    "3. followUp=accept → kurz rückbestätigen; choose_two/choose_few → Auswahl vorlesen; spell_or_human → buchstabieren oder übergeben.",
    "4. Scores und Cologne-Codes nicht vorlesen, außer der Anrufer fragt.",
    "5. lexicon_stats / search_names nur Setup/Debug – nie die Vollliste vorlesen.",
    "",
    "Datenquellen: Wikidata (CC0), GND/DNB (CC0), Onomaverse (CC BY 4.0 –",
    '"Names data from Onomaverse (https://onomaverse.com/datasets), licensed CC BY 4.0."),',
    "kommunale Vornamen-Open-Data (GovData u. a.).",
  ].join("\n"),
  tools: {
    hydrate_name: {
      title: "Namen hydrieren",
      description:
        "Reichert einen (möglicherweise falsch erkannten) Vor- oder Nachnamen an: confidence, best, alternatives, followUp, needsHuman. Primäres Tool für Namensaufnahme.",
      inputs: {
        name: 'Name wie verstanden, z.B. "Schmit", "Mueller", "Jannik"',
        kind: '"family" (Nachname, Standard) oder "given" (Vorname)',
        limit: "Max. Kandidaten intern (Standard 5)",
        threshold: "Ähnlichkeitsschwelle für confident (Standard 0.86)",
      },
    },
    lexicon_stats: {
      title: "Lexikon-Statistik",
      description: "Größe und Lizenzen der geladenen Lexika. Nur Setup/Debugging.",
      inputs: {},
    },
    search_names: {
      title: "Namen suchen",
      description: "Präfixsuche im Lexikon (Setup/Klärung). Nie die Vollliste vorlesen.",
      inputs: {
        prefix: "Optionaler Namenspräfix",
        kind: '"family" oder "given"',
        limit: "Max. Treffer (1–100, Standard 50)",
      },
    },
    suggest_names: {
      title: "Namensvorschläge",
      description: "Kurze Kandidatenliste (≤3–5) für eine Auswahlfrage am Telefon.",
      inputs: {
        name: "Gehörter Name",
        kind: '"family" oder "given"',
        limit: "Max. Vorschläge (1–5, Standard 3)",
      },
    },
  },
};
