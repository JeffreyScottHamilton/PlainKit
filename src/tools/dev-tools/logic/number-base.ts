export type NumParse = { ok: true; value: bigint; bits: number } | { ok: false; message: string };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export function parseInBase(input: string, base: number): NumParse {
  if (!Number.isInteger(base) || base < 2 || base > 36) return { ok: false, message: 'Base must be a whole number from 2 to 36.' };
  let s = input.trim().toLowerCase();
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const prefix: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' };
  const p = prefix[base];
  if (p && s.startsWith(p)) s = s.slice(2);
  if (s === '') return { ok: false, message: 'Enter a number.' };
  let value = 0n;
  const b = BigInt(base);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) {
      const allowed = base <= 10 ? `0-${base - 1}` : `0-9, a-${DIGITS[base - 1]}`;
      return { ok: false, message: `"${ch}" is not a valid digit in base ${base} (allowed: ${allowed}).` };
    }
    value = value * b + BigInt(d);
  }
  if (negative) value = -value;
  return { ok: true, value, bits: value === 0n ? 1 : (value < 0n ? -value : value).toString(2).length };
}

export function formatInBase(value: bigint, base: number): string {
  return value.toString(base);
}
