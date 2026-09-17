/**
 * Alles, was der LLM-Agent vom MCP-Server zu lesen bekommt:
 * Instructions, Tool-Titel, Beschreibungen, Parametertexte.
 */

export type ToolName = "hydrate_name" | "lexicon_stats";

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
    "Deutscher Nachnamen-Abgleich für Telefonagenten (Namelex).",
    "",
    "Ablauf:",
    "1. hydrate_name mit dem verstandenen Nachnamen – nie ungeprüft übernehmen.",
    "2. Bei needsHuman=true nichts raten: nachfragen oder an einen Menschen übergeben.",
    "3. confident=true und exact=true: Name ist im Lexikon; Varianten können vorgelesen werden.",
    "4. lexicon_stats nur für Setup/Debugging, nicht im Kundengespräch.",
    "",
    "Datenquellen: Wikidata (CC0), GND/DNB (CC0), Onomaverse (CC BY 4.0 –",
    '"Names data from Onomaverse (https://onomaverse.com/datasets), licensed CC BY 4.0.").',
  ].join("\n"),
  tools: {
    hydrate_name: {
      title: "Nachnamen hydrieren",
      description:
        "Reichert einen (möglicherweise falsch erkannten) Nachnamen mit Lexikon-Wahrscheinlichkeit, Fuzzy-Korrekturkandidaten und Schreibvarianten an. Primäres Tool für Namensaufnahme.",
      inputs: {
        name: 'Nachname wie verstanden, z.B. "Schmit" oder "Mueller"',
        limit: "Maximale Anzahl Korrekturkandidaten (Standard 5)",
        threshold: "Ähnlichkeitsschwelle für confident (Standard 0.86)",
      },
    },
    lexicon_stats: {
      title: "Lexikon-Statistik",
      description:
        "Liefert Anzahl Nachnamen, Varianten und Lizenzhinweise der geladenen Namelex-Datenbank. Nur für Setup und Debugging.",
      inputs: {},
    },
  },
};
