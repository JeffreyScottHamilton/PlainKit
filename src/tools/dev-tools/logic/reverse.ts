export type ReverseBy = 'graphemes' | 'words' | 'lines';
export type ReverseResult = { output: string; note?: string };

/** Code point order, used only when Intl.Segmenter is unavailable. Combined emoji break apart. */
export function reverseCodePoints(text: string): string {
  return Array.from(text).reverse().join('');
}

export function reverseGraphemes(text: string): ReverseResult {
  if (typeof Intl.Segmenter !== 'function') {
    return { output: reverseCodePoints(text), note: 'This browser has no grapheme segmenter. Reversed by code point, so emoji sequences may break.' };
  }
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return { output: Array.from(seg.segment(text), (s) => s.segment).reverse().join('') };
}

/** Reverses word order and keeps the whitespace between words in place. */
export function reverseWords(text: string): string {
  const parts = text.split(/(\s+)/);
  const words = parts.filter((_, i) => i % 2 === 0).reverse();
  return parts.map((p, i) => (i % 2 === 0 ? words[i / 2]! : p)).join('');
}

export function reverseLines(text: string): string {
  return text.split('\n').reverse().join('\n');
}
