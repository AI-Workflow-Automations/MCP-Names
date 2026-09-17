/**
 * Normalisation of German personal names.
 * Comparison form collapses umlaut transcription and separators; display form stays intact.
 */

export const NAME_PREFIXES = [
  "von und zu",
  "von der",
  "von dem",
  "von den",
  "van der",
  "van den",
  "van de",
  "de la",
  "de le",
  "zu der",
  "in der",
  "auf dem",
  "auf der",
  "von",
  "vom",
  "van",
  "zu",
  "zur",
  "zum",
  "de",
  "del",
  "della",
  "di",
  "da",
  "du",
  "le",
  "la",
  "ter",
  "ten",
  "op",
  "af",
  "dos",
  "das",
  "dei",
] as const;

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
  ẞ: "ss",
  ı: "i",
  İ: "i",
  ł: "l",
  Ł: "l",
  ø: "oe",
  Ø: "oe",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ħ: "h",
  ŋ: "ng",
};

const SEPARATORS = /[\s\-‐-―'’`´.]+/g;
const NON_ALPHA = /[^a-z]/g;

export function stripAccents(value: string): string {
  let expanded = "";
  for (const char of value) {
    expanded += UMLAUT_MAP[char] ?? char;
  }
  return expanded.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

export function splitPrefix(name: string): { prefix: string; core: string } {
  const cleaned = name.trim();
  const lowered = cleaned.toLowerCase();
  const prefixes = [...NAME_PREFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    const token = `${prefix} `;
    if (lowered.startsWith(token)) {
      const core = cleaned.slice(token.length).trim();
      if (core) return { prefix, core };
    }
  }
  return { prefix: "", core: cleaned };
}

export function normalize(name: string, options: { keepPrefix?: boolean } = {}): string {
  if (!name) return "";
  const { prefix, core } = splitPrefix(name);
  const base = options.keepPrefix && prefix ? `${prefix} ${core}` : core;
  let folded = stripAccents(base).toLowerCase();
  folded = folded.replace(SEPARATORS, "");
  return folded.replace(NON_ALPHA, "");
}

const SKELETON_RULES: Array<[RegExp, string]> = [
  [/sch/g, "s"],
  [/(?:ph)/g, "f"],
  [/(?:th)/g, "t"],
  [/(?:dt)$/g, "t"],
  [/(?:ck)/g, "k"],
  [/(?:tz|cz|zz)/g, "z"],
  [/(?:chs|x)/g, "ks"],
  [/(?:ch)/g, "k"],
  [/(?:ei|ai|ey|ay)/g, "ai"],
  [/(?:eu|oi|oy|äu)/g, "oi"],
  [/(?:ie)/g, "i"],
  [/(?:ue)/g, "u"],
  [/(?:oe)/g, "o"],
  [/(?:ae)/g, "a"],
  [/(?:v|w)/g, "f"],
  [/(?:c|q|g)/g, "k"],
  [/(?:y|j)/g, "i"],
  [/(?:d)$/g, "t"],
  [/(?:b)$/g, "p"],
  [/(?:mann)$/g, "man"],
  [/(.)\1+/g, "$1"],
];

export function skeleton(name: string): string {
  let value = normalize(name);
  for (const [pattern, repl] of SKELETON_RULES) {
    value = value.replace(pattern, repl);
  }
  return value.replace(/(.)\1+/g, "$1");
}
