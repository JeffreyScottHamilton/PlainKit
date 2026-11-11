export type SlugOptions = { separator: '-' | '_'; maxLength: number | null; keepNonLatin: boolean };
export type SlugOutcome = { ok: true; slug: string } | { ok: false; message: string };

// Letters NFKD does not decompose; mapped so "Straße" becomes "strasse", not "strae".
const LATIN_MAP: Record<string, string> = { ß: 'ss', æ: 'ae', ø: 'o', đ: 'd', ł: 'l', œ: 'oe', þ: 'th', ı: 'i' };

export function slugify(input: string, o: SlugOptions): SlugOutcome {
  if (o.maxLength !== null && (!Number.isInteger(o.maxLength) || o.maxLength < 1 || o.maxLength > 200)) {
    return { ok: false, message: 'Max length must be a whole number from 1 to 200, or empty for no limit.' };
  }
  let s = input.normalize('NFKD').toLowerCase();
  if (!o.keepNonLatin) {
    s = s.replace(/\p{M}/gu, '').replace(/[ßæøđłœþı]/g, (c) => LATIN_MAP[c] ?? c);
  }
  const bad = o.keepNonLatin ? /[^\p{L}\p{M}\p{N}]+/gu : /[^a-z0-9]+/g;
  s = s.replace(bad, o.separator);
  const sep = o.separator;
  s = s.split(sep).filter((p) => p !== '').join(sep);
  if (o.maxLength !== null) {
    s = Array.from(s).slice(0, o.maxLength).join('').replace(new RegExp(`${sep}+$`), '');
  }
  if (s === '') return { ok: false, message: 'Nothing left after slugging. Try turning on "Keep non-Latin letters" for non-Latin text.' };
  return { ok: true, slug: s };
}
