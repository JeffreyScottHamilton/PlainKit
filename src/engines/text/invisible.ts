// Invisible and unusual code points: detection with positions, and rule-based cleanup.
// Positions are code-point indexes (astral characters count once), with 1-based line:column.

export type Action = 'remove' | 'space' | 'keep';

export type Rule = {
  id: string;
  label: string;
  /** Inclusive [from, to] code-point ranges. */
  ranges: [number, number][];
  /** Default behaviour when the user has not changed the toggle. */
  defaultOn: boolean;
  /** Action when the toggle is on. 'keep' means detect-only (never offered for removal). */
  action: Action;
  explain: string;
};

const C0_C1: [number, number][] = [
  [0x0000, 0x0008], [0x000b, 0x000c], [0x000e, 0x001f], [0x007f, 0x009f],
];

export const RULES: Rule[] = [
  { id: 'zwsp', label: 'Zero-width space', ranges: [[0x200b, 0x200b]], defaultOn: true, action: 'remove', explain: 'Invisible; often pasted from web pages and can split words for search.' },
  { id: 'wj', label: 'Word joiner', ranges: [[0x2060, 0x2060]], defaultOn: true, action: 'remove', explain: 'Invisible; prevents line breaks and rarely has a visible role.' },
  { id: 'bom', label: 'Byte order mark (BOM)', ranges: [[0xfeff, 0xfeff]], defaultOn: true, action: 'remove', explain: 'Removed wherever it appears, including at the very start of the text.' },
  { id: 'shy', label: 'Soft hyphen', ranges: [[0x00ad, 0x00ad]], defaultOn: true, action: 'remove', explain: 'Only shows a hyphen at a line break; invisible in most text.' },
  { id: 'tags', label: 'Tag characters', ranges: [[0xe0000, 0xe007f]], defaultOn: true, action: 'remove', explain: 'Hidden language tags with no visible form; often used to hide text.' },
  { id: 'ops', label: 'Invisible operators', ranges: [[0x2061, 0x2064]], defaultOn: true, action: 'remove', explain: 'Invisible math operators with no visible effect in prose.' },
  { id: 'controls', label: 'Stray control characters', ranges: C0_C1, defaultOn: true, action: 'remove', explain: 'Non-printing control codes. Tab, line feed and carriage return are never touched.' },
  { id: 'zwnj', label: 'Zero-width non-joiner (ZWNJ)', ranges: [[0x200c, 0x200c]], defaultOn: false, action: 'remove', explain: 'Needed in Persian and some Indic scripts to keep letters apart.' },
  { id: 'zwj', label: 'Zero-width joiner (ZWJ)', ranges: [[0x200d, 0x200d]], defaultOn: false, action: 'remove', explain: 'Joins emoji such as family or profession sequences, and Indic conjuncts.' },
  { id: 'bidi', label: 'Bidirectional controls', ranges: [[0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]], defaultOn: false, action: 'remove', explain: 'Set text direction in Arabic, Hebrew and mixed-direction text. Removing them can reorder text.' },
  { id: 'spaces', label: 'Unusual spaces (NBSP and others)', ranges: [[0x00a0, 0x00a0], [0x2000, 0x200a], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]], defaultOn: false, action: 'space', explain: 'Keep the non-breaking look. When on, these become a normal space, which can change line breaks.' },
  { id: 'vs', label: 'Variation selectors', ranges: [[0xfe00, 0xfe0f], [0xe0100, 0xe01ef]], defaultOn: false, action: 'remove', explain: 'Choose emoji or text presentation, such as ❤️ versus ❤. Removing them changes how symbols look.' },
  { id: 'hangul', label: 'Hangul filler', ranges: [[0x115f, 0x1160], [0x3164, 0x3164], [0xffa0, 0xffa0]], defaultOn: false, action: 'remove', explain: 'Placeholder letters in Korean text and layout. Removing them can change spacing.' },
  { id: 'mvs', label: 'Mongolian vowel separator', ranges: [[0x180e, 0x180e]], defaultOn: false, action: 'remove', explain: 'Deprecated; still used in some Mongolian text for shaping.' },
  { id: 'cgj', label: 'Combining grapheme joiner', ranges: [[0x034f, 0x034f]], defaultOn: false, action: 'keep', explain: 'A combining mark. Shown for information only and never offered for removal.' },
];

const NAMES: Record<number, string> = {
  0x200b: 'ZERO WIDTH SPACE', 0x2060: 'WORD JOINER', 0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)', 0x00ad: 'SOFT HYPHEN',
  0x200c: 'ZERO WIDTH NON-JOINER', 0x200d: 'ZERO WIDTH JOINER', 0x200e: 'LEFT-TO-RIGHT MARK', 0x200f: 'RIGHT-TO-LEFT MARK',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING', 0x202b: 'RIGHT-TO-LEFT EMBEDDING', 0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE', 0x202e: 'RIGHT-TO-LEFT OVERRIDE', 0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE', 0x2068: 'FIRST STRONG ISOLATE', 0x2069: 'POP DIRECTIONAL ISOLATE',
  0x00a0: 'NO-BREAK SPACE', 0x202f: 'NARROW NO-BREAK SPACE', 0x205f: 'MEDIUM MATHEMATICAL SPACE', 0x3000: 'IDEOGRAPHIC SPACE',
  0x2061: 'FUNCTION APPLICATION', 0x2062: 'INVISIBLE TIMES', 0x2063: 'INVISIBLE SEPARATOR', 0x2064: 'INVISIBLE PLUS',
  0x115f: 'HANGUL CHOSEONG FILLER', 0x1160: 'HANGUL JUNGSEONG FILLER', 0x3164: 'HANGUL FILLER', 0xffa0: 'HALFWIDTH HANGUL FILLER',
  0x180e: 'MONGOLIAN VOWEL SEPARATOR', 0x034f: 'COMBINING GRAPHEME JOINER', 0x0009: 'TAB', 0x000a: 'LINE FEED', 0x000d: 'CARRIAGE RETURN',
};

const SHORT: Record<number, string> = {
  0x200b: 'ZWSP', 0x2060: 'WJ', 0xfeff: 'BOM', 0x00ad: 'SHY', 0x200c: 'ZWNJ', 0x200d: 'ZWJ', 0x200e: 'LRM', 0x200f: 'RLM',
  0x00a0: 'NBSP', 0x202f: 'NNBSP', 0x3000: 'IDEO-SP', 0x034f: 'CGJ', 0x180e: 'MVS', 0x3164: 'HFILL',
};

export function codeName(cp: number): string {
  if (NAMES[cp]) return NAMES[cp]!;
  if (cp >= 0xe0000 && cp <= 0xe007f) return 'TAG CHARACTER';
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return 'VARIATION SELECTOR';
  if (cp >= 0x2000 && cp <= 0x200a) return 'SPACE';
  if (cp <= 0x9f) return 'CONTROL CHARACTER';
  return 'INVISIBLE CHARACTER';
}

export function hex(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Short visible marker for a code point, e.g. ZWSP, or U+XXXX when it has none. */
export function markerLabel(cp: number): string {
  if (SHORT[cp]) return SHORT[cp];
  if (cp >= 0xe0000 && cp <= 0xe007f) return 'TAG';
  if (cp >= 0x2000 && cp <= 0x200a) return 'SPACE';
  return hex(cp);
}

export function ruleFor(cp: number): Rule | undefined {
  return RULES.find((r) => r.ranges.some(([a, b]) => cp >= a && cp <= b));
}

export type Finding = { index: number; line: number; column: number; cp: number; hex: string; name: string; ruleId: string };

/** Find every flagged code point. Tab, LF and CR are never flagged. */
export function scan(text: string): Finding[] {
  const out: Finding[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const rule = cp === 0x09 || cp === 0x0a || cp === 0x0d ? undefined : ruleFor(cp);
    if (rule) out.push({ index, line, column, cp, hex: hex(cp), name: codeName(cp), ruleId: rule.id });
    if (cp === 0x0a) {
      line++;
      column = 1;
    } else column++;
    index++;
  }
  return out;
}

export function countByRule(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.ruleId] = (counts[f.ruleId] ?? 0) + 1;
  return counts;
}

/** Rule ids that are on by default. */
export function defaultEnabled(): Set<string> {
  return new Set(RULES.filter((r) => r.defaultOn).map((r) => r.id));
}

export type CleanupResult = { text: string; removed: number; converted: number };

/** Applies every enabled rule. Enabled rules with action 'keep' are ignored. Running it twice changes nothing more. */
export function cleanup(text: string, enabled: ReadonlySet<string>): CleanupResult {
  let removed = 0;
  let converted = 0;
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const rule = cp === 0x09 || cp === 0x0a || cp === 0x0d ? undefined : ruleFor(cp);
    if (rule && enabled.has(rule.id) && rule.action !== 'keep') {
      if (rule.action === 'remove') {
        removed++;
        continue;
      }
      converted++;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return { text: out, removed, converted };
}
