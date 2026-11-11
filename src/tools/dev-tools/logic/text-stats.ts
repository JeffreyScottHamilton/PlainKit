export type TextStats = {
  utf16: number;
  codePoints: number;
  graphemes: number | null;
  utf8Bytes: number;
  words: number;
  lines: number;
  paragraphs: number;
};

export function hasSegmenter(): boolean {
  return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
}

export function textStats(text: string): TextStats {
  const graphemes = hasSegmenter() ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length : null;
  const words = text.match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0;
  const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length;
  const paragraphs = text.split(/\n\s*\n/).filter((b) => b.trim() !== '').length;
  return {
    utf16: text.length,
    codePoints: Array.from(text).length,
    graphemes,
    utf8Bytes: new TextEncoder().encode(text).length,
    words,
    lines,
    paragraphs,
  };
}
