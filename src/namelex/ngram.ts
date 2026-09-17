/** Character n-gram model over the surname lexicon (plausibility scores). */

const BOUNDARY = "^";
const TERMINATOR = "$";
export const MAX_ORDER = 4;
const LAMBDAS = [0.55, 0.25, 0.15, 0.05] as const;

export function grams(text: string, order: number): string[] {
  const padded = BOUNDARY.repeat(order - 1) + text + TERMINATOR;
  const out: string[] = [];
  for (let i = 0; i <= padded.length - order; i++) {
    out.push(padded.slice(i, i + order));
  }
  return out;
}

export class NgramModel {
  maxOrder: number;
  counts: Map<number, Map<string, number>>;
  totals: Map<number, number>;
  vocabulary = new Set<string>();
  median = -3.0;
  spread = 1.0;

  constructor(maxOrder = MAX_ORDER) {
    this.maxOrder = maxOrder;
    this.counts = new Map();
    this.totals = new Map();
    for (let n = 1; n <= maxOrder; n++) {
      this.counts.set(n, new Map());
      this.totals.set(n, 0);
    }
  }

  private conditional(gram: string, n: number): number {
    const vocabularySize = Math.max(this.vocabulary.size + 2, 2);
    if (n === 1) {
      return ((this.counts.get(1)?.get(gram) ?? 0) + 1) / ((this.totals.get(1) ?? 0) + vocabularySize);
    }
    const context = gram.slice(0, -1);
    const contextCount = this.counts.get(n - 1)?.get(context) ?? 0;
    return ((this.counts.get(n)?.get(gram) ?? 0) + 1) / (contextCount + vocabularySize);
  }

  logProbability(text: string): number {
    if (!text) return Number.NEGATIVE_INFINITY;
    let total = 0;
    const maxOrder = Math.min(this.maxOrder, text.length + 1);
    for (let position = 0; position <= text.length; position++) {
      let mixture = 0;
      for (let order = 1; order <= maxOrder; order++) {
        const padded = BOUNDARY.repeat(order - 1) + text + TERMINATOR;
        const end = position + order;
        if (end > padded.length) continue;
        const gram = padded.slice(position, end);
        const weight = LAMBDAS[Math.min(order, LAMBDAS.length) - 1]!;
        mixture += weight * this.conditional(gram, order);
      }
      total += Math.log(Math.max(mixture, 1e-12));
    }
    return total;
  }

  plausibility(text: string): number {
    if (!text) return 0;
    const meanLog = this.logProbability(text) / (text.length + 1);
    const z = (meanLog - this.median) / this.spread;
    const clamped = Math.max(Math.min(z, 20), -20);
    return 1 / (1 + Math.exp(-1.4 * clamped));
  }

  static fromRows(
    rows: Iterable<[string, number, number]>,
    options: { maxOrder?: number; median?: number; spread?: number } = {},
  ): NgramModel {
    const model = new NgramModel(options.maxOrder ?? MAX_ORDER);
    if (options.median !== undefined) model.median = options.median;
    if (options.spread !== undefined) model.spread = options.spread;
    for (const [gram, n, count] of rows) {
      const bucket = model.counts.get(n);
      if (!bucket) continue;
      bucket.set(gram, count);
      model.totals.set(n, (model.totals.get(n) ?? 0) + count);
      if (n === 1) model.vocabulary.add(gram);
    }
    return model;
  }
}
