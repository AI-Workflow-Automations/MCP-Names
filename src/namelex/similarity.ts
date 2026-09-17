/** String similarity tuned for German names (no external deps). */

const ROWS = ["qwertzuiopü", "asdfghjklöä", "yxcvbnm"] as const;
const ROW_OFFSET = [0.0, 0.5, 1.5] as const;

function keyboardPositions(): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  ROWS.forEach((row, rowIndex) => {
    [...row].forEach((char, colIndex) => {
      positions.set(char, [rowIndex, colIndex + ROW_OFFSET[rowIndex]!]);
    });
  });
  return positions;
}

const POSITIONS = keyboardPositions();

const SOFT_PAIRS = new Set(
  ["iy", "ck", "kc", "fv", "vw", "sz", "dt", "bp", "gk", "mn", "ae", "ou"].map((pair) => [...pair].sort().join("")),
);

function softKey(a: string, b: string): string {
  return [a, b].sort().join("");
}

export function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (SOFT_PAIRS.has(softKey(a, b))) return 0.4;
  const posA = POSITIONS.get(a);
  const posB = POSITIONS.get(b);
  if (posA && posB) {
    const distance = Math.hypot(posA[0] - posB[0], posA[1] - posB[1]);
    if (distance <= 1.2) return 0.5;
  }
  return 1.0;
}

export function weightedEditDistance(source: string, target: string): number {
  if (source === target) return 0;
  if (!source) return target.length;
  if (!target) return source.length;

  let previousPrevious: number[] = [];
  let previous = Array.from({ length: target.length + 1 }, (_, i) => i);

  for (let i = 1; i <= source.length; i++) {
    const sChar = source[i - 1]!;
    const current = [i, ...Array.from({ length: target.length }, () => 0)];
    for (let j = 1; j <= target.length; j++) {
      const tChar = target[j - 1]!;
      const cost = substitutionCost(sChar, tChar);
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && sChar === target[j - 2] && source[i - 2] === tChar) {
        current[j] = Math.min(current[j]!, previousPrevious[j - 2]! + 0.7);
      }
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[previous.length - 1]!;
}

export function jaro(source: string, target: string): number {
  if (source === target) return 1;
  if (!source || !target) return 0;
  const matchWindow = Math.max(Math.floor(Math.max(source.length, target.length) / 2) - 1, 0);
  const sourceFlags = Array.from({ length: source.length }, () => false);
  const targetFlags = Array.from({ length: target.length }, () => false);
  let matches = 0;

  for (let i = 0; i < source.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, target.length);
    for (let j = start; j < end; j++) {
      if (!targetFlags[j] && target[j] === source[i]) {
        sourceFlags[i] = true;
        targetFlags[j] = true;
        matches += 1;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < source.length; i++) {
    if (!sourceFlags[i]) continue;
    while (!targetFlags[k]) k += 1;
    if (source[i] !== target[k]) transpositions += 1;
    k += 1;
  }
  transpositions = Math.floor(transpositions / 2);

  return (matches / source.length + matches / target.length + (matches - transpositions) / matches) / 3;
}

export function jaroWinkler(source: string, target: string, prefixWeight = 0.1): number {
  const score = jaro(source, target);
  let prefix = 0;
  const limit = Math.min(4, source.length, target.length);
  for (let i = 0; i < limit; i++) {
    if (source[i] !== target[i]) break;
    prefix += 1;
  }
  return score + prefix * prefixWeight * (1 - score);
}

export function similarity(source: string, target: string): number {
  if (!source || !target) return 0;
  if (source === target) return 1;
  const longest = Math.max(source.length, target.length);
  const edit = 1 - Math.min(weightedEditDistance(source, target) / longest, 1);
  return 0.65 * edit + 0.35 * jaroWinkler(source, target);
}
