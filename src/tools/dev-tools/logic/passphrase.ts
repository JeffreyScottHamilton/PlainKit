import { WORDS } from '../data/words';
import { randomInt } from './sort-lines';

export type PassOptions = { words: number; separator: string; capitalize: boolean; addNumber: boolean };
export type PassResult = { phrase: string; entropyBits: number; listSize: number };

export const WORD_LIST_SIZE = WORDS.length;

export function generatePassphrase(o: PassOptions, source?: () => number): PassResult {
  if (!Number.isInteger(o.words) || o.words < 3 || o.words > 12) throw new RangeError('Word count must be 3 to 12.');
  const picked: string[] = [];
  for (let i = 0; i < o.words; i++) {
    const w = WORDS[randomInt(WORDS.length, source)]!;
    picked.push(o.capitalize ? w[0]!.toUpperCase() + w.slice(1) : w);
  }
  if (o.addNumber) picked.push(String(randomInt(100, source)).padStart(2, '0'));
  // Entropy is for the words only, using the real list length. The optional number adds log2(100) bits.
  const bits = o.words * Math.log2(WORDS.length) + (o.addNumber ? Math.log2(100) : 0);
  return { phrase: picked.join(o.separator), entropyBits: bits, listSize: WORDS.length };
}
