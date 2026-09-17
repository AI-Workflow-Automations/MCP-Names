/** Cologne phonetics (Kölner Phonetik, Postel 1969) for German names. */

import { normalize } from "./normalize.js";

const VOWELS = new Set("aeijouy");
const DT_SIBILANTS = new Set("csz");
const X_PRECEDERS = new Set("ckq");
const C_SIBILANTS = new Set("sz");
const C_FOLLOWERS_INITIAL = new Set("ahkloqrux");
const C_FOLLOWERS_INNER = new Set("ahkoqux");

export function cologne(name: string): string {
  const text = normalize(name);
  if (!text) return "";

  const codes: string[] = [];
  const length = text.length;
  for (let i = 0; i < length; i++) {
    const char = text[i]!;
    const nxt = i + 1 < length ? text[i + 1]! : "";
    const prev = i > 0 ? text[i - 1]! : "";
    let code: string | null = null;

    if (VOWELS.has(char)) code = "0";
    else if (char === "h") continue;
    else if (char === "b") code = "1";
    else if (char === "p") code = nxt === "h" ? "3" : "1";
    else if (char === "d" || char === "t") code = DT_SIBILANTS.has(nxt) ? "8" : "2";
    else if ("fvw".includes(char)) code = "3";
    else if ("gkq".includes(char)) code = "4";
    else if (char === "c") {
      if (i === 0) code = C_FOLLOWERS_INITIAL.has(nxt) ? "4" : "8";
      else if (C_SIBILANTS.has(prev)) code = "8";
      else code = C_FOLLOWERS_INNER.has(nxt) ? "4" : "8";
    } else if (char === "x") code = X_PRECEDERS.has(prev) ? "8" : "48";
    else if (char === "l") code = "5";
    else if (char === "m" || char === "n") code = "6";
    else if (char === "r") code = "7";
    else if (char === "s" || char === "z") code = "8";
    else continue;

    codes.push(code);
  }

  const flat = codes.join("");
  const deduped: string[] = [];
  for (const digit of flat) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== digit) {
      deduped.push(digit);
    }
  }
  if (deduped.length === 0) return "";
  const [head, ...rest] = deduped;
  return head! + rest.filter((d) => d !== "0").join("");
}
