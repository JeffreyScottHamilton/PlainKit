export type LoremUnit = 'paragraphs' | 'sentences' | 'words';
export type LoremOutcome = { ok: true; text: string } | { ok: false; message: string };

const VOCAB = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
  'ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure ' +
  'dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non ' +
  'proident sunt in culpa qui officia deserunt mollit anim id est laborum'
).split(' ');

const LIMITS: Record<LoremUnit, [number, number]> = { paragraphs: [1, 50], sentences: [1, 200], words: [1, 2000] };
const START_WITH_LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

/** Deterministic: the same count and toggle always give the same text. */
export function generateLorem(unit: LoremUnit, count: number, startWithLorem: boolean): LoremOutcome {
  const [lo, hi] = LIMITS[unit];
  if (!Number.isInteger(count) || count < lo || count > hi) return { ok: false, message: `${unit} must be a whole number from ${lo} to ${hi}.` };
  let cursor = startWithLorem ? 0 : 11;
  const nextWord = () => VOCAB[cursor++ % VOCAB.length] ?? 'lorem';
  const sentence = (len: number) => {
    const words = Array.from({ length: len }, nextWord);
    const s = words.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  };
  if (unit === 'words') {
    const words = Array.from({ length: count }, nextWord).join(' ');
    return { ok: true, text: words };
  }
  if (unit === 'sentences') {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      out.push(i === 0 && startWithLorem ? START_WITH_LOREM : sentence(8 + ((i * 5) % 8)));
    }
    return { ok: true, text: out.join(' ') };
  }
  const paras: string[] = [];
  for (let p = 0; p < count; p++) {
    const n = 3 + ((p * 2) % 3);
    const sents: string[] = [];
    for (let s = 0; s < n; s++) {
      sents.push(p === 0 && s === 0 && startWithLorem ? START_WITH_LOREM : sentence(8 + ((s * 5 + p) % 8)));
    }
    paras.push(sents.join(' '));
  }
  return { ok: true, text: paras.join('\n\n') };
}
