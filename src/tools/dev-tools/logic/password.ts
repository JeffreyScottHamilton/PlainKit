export const PW_MIN = 4;
export const PW_MAX = 128;
export const PW_COUNT_MAX = 20;

export const CLASSES = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?',
} as const;
// Ambiguous-excluded sets drop l/I/1, O/0, o; the full sets keep them.
export const FULL = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789' } as const;

export type Fill = (buf: Uint32Array) => void;
const defaultFill: Fill = (buf) => crypto.getRandomValues(buf);

/**
 * Uniform integer in [0, max) by rejection sampling over 32-bit draws.
 * Draws >= floor(2^32 / max) * max are rejected so no residue is favored.
 */
export function unbiasedInt(max: number, fill: Fill = defaultFill): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('max must be an integer from 1 to 2^32');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    fill(buf);
    const v = buf[0] ?? 0;
    if (v < limit) return v % max;
  }
}

export type PwOptions = { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; excludeAmbiguous: boolean };

export function validatePassword(o: PwOptions): string | null {
  if (!Number.isInteger(o.length) || o.length < PW_MIN || o.length > PW_MAX) return `Length must be a whole number from ${PW_MIN} to ${PW_MAX}.`;
  if (!o.lower && !o.upper && !o.digits && !o.symbols) return 'Select at least one character type.';
  const classes = activeClasses(o);
  if (o.length < classes.length) return `Length must be at least ${classes.length} to include one of each selected type.`;
  return null;
}

function activeClasses(o: PwOptions): string[] {
  const pick = (full: string, ambiguousFree: string) => (o.excludeAmbiguous ? ambiguousFree : full);
  const out: string[] = [];
  if (o.lower) out.push(pick(FULL.lower, CLASSES.lower));
  if (o.upper) out.push(pick(FULL.upper, CLASSES.upper));
  if (o.digits) out.push(pick(FULL.digits, CLASSES.digits));
  if (o.symbols) out.push(CLASSES.symbols);
  return out;
}

/** Password with at least one character from each selected class. Caller validates first. */
export function generatePassword(o: PwOptions, rnd: (max: number) => number = (m) => unbiasedInt(m)): string {
  const classes = activeClasses(o);
  const pool = classes.join('');
  const chars: string[] = classes.map((c) => c[rnd(c.length)] ?? '');
  while (chars.length < o.length) chars.push(pool[rnd(pool.length)] ?? '');
  // Fisher-Yates so the guaranteed characters are not always at the front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j] ?? '', chars[i] ?? ''];
  }
  return chars.join('');
}

/** Estimate: length x log2(pool size), assuming uniform random characters. */
export function entropyBits(o: PwOptions): number {
  const pool = activeClasses(o).join('').length;
  return pool < 2 ? 0 : o.length * Math.log2(pool);
}
