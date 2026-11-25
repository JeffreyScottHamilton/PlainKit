import { LOW_CONFIDENCE } from './model';

export type WordScore = { text: string; confidence: number };

export type OcrSummary = {
  /** Mean word confidence 0-100, or null when no words were recognised. */
  meanConfidence: number | null;
  wordCount: number;
  /** Words below LOW_CONFIDENCE, in reading order, for the user to check. */
  lowWords: string[];
};

/** Summarises recognised words. Empty words are ignored; confidence is clamped to 0-100. */
export function summarizeWords(words: readonly WordScore[]): OcrSummary {
  const used = words.filter((w) => w.text.trim() !== '');
  if (used.length === 0) return { meanConfidence: null, wordCount: 0, lowWords: [] };
  let total = 0;
  const lowWords: string[] = [];
  for (const w of used) {
    const c = Math.min(100, Math.max(0, Number.isFinite(w.confidence) ? w.confidence : 0));
    total += c;
    if (c < LOW_CONFIDENCE) lowWords.push(w.text);
  }
  return { meanConfidence: Math.round((total / used.length) * 10) / 10, wordCount: used.length, lowWords };
}
