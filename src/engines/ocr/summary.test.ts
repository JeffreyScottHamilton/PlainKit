import { describe, expect, it } from 'vitest';
import { summarizeWords } from './summary';

describe('summarizeWords', () => {
  it('returns null mean and no words for empty input', () => {
    expect(summarizeWords([])).toEqual({ meanConfidence: null, wordCount: 0, lowWords: [] });
  });

  it('ignores blank tokens', () => {
    expect(summarizeWords([{ text: '  ', confidence: 10 }]).wordCount).toBe(0);
  });

  it('averages confidence and lists words under the threshold in order', () => {
    const s = summarizeWords([
      { text: 'HELLO', confidence: 96 },
      { text: 'PLA1NKIT', confidence: 40 },
      { text: '2026', confidence: 59.9 },
    ]);
    expect(s.wordCount).toBe(3);
    expect(s.meanConfidence).toBe(65.3);
    expect(s.lowWords).toEqual(['PLA1NKIT', '2026']);
  });

  it('clamps out-of-range and non-finite confidence', () => {
    const s = summarizeWords([
      { text: 'a', confidence: 150 },
      { text: 'b', confidence: Number.NaN },
    ]);
    expect(s.meanConfidence).toBe(50);
    expect(s.lowWords).toEqual(['b']);
  });
});
