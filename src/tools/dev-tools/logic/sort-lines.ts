export type SortOptions = {
  order: 'keep' | 'asc' | 'desc';
  caseInsensitive: boolean;
  natural: boolean;
  unique: boolean;
  removeEmpty: boolean;
  reverse: boolean;
  shuffle: boolean;
};

const collatorNumeric = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const collatorPlain = new Intl.Collator(undefined, { numeric: false, sensitivity: 'variant' });

/** Uniform random integer in [0, n) by rejection sampling (no modulo bias). */
export function randomInt(n: number, source: () => number = defaultSource): number {
  const limit = 0x100000000 - (0x100000000 % n);
  let x = source();
  while (x >= limit) x = source();
  return x % n;
}

function defaultSource(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

export function shuffleInPlace<T>(items: T[], source?: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, source);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export function sortLines(text: string, o: SortOptions, source?: () => number): { output: string; inCount: number; outCount: number } {
  let lines = text.split(/\r?\n/);
  const inCount = lines.length;
  if (o.removeEmpty) lines = lines.filter((l) => l.trim() !== '');
  if (o.unique) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const k = o.caseInsensitive ? l.toLowerCase() : l;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (o.shuffle) {
    shuffleInPlace(lines, source);
  } else if (o.order !== 'keep') {
    const cmp = (a: string, b: string) => {
      if (o.natural) return collatorNumeric.compare(o.caseInsensitive ? a.toLowerCase() : a, o.caseInsensitive ? b.toLowerCase() : b);
      const x = o.caseInsensitive ? a.toLowerCase() : a;
      const y = o.caseInsensitive ? b.toLowerCase() : b;
      return o.caseInsensitive ? (x < y ? -1 : x > y ? 1 : 0) : collatorPlain.compare(x, y);
    };
    lines.sort(o.order === 'asc' ? cmp : (a, b) => cmp(b, a));
  }
  if (o.reverse) lines.reverse();
  return { output: lines.join('\n'), inCount, outCount: lines.length };
}
