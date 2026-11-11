import { describe, expect, it } from 'vitest';
import { cleanup, countByRule, defaultEnabled, scan } from './invisible';

const ALL = new Set(['zwsp', 'wj', 'bom', 'shy', 'tags', 'ops', 'controls', 'zwnj', 'zwj', 'bidi', 'spaces', 'vs', 'hangul', 'mvs']);
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';

describe('defaults keep meaningful characters', () => {
  it('family emoji is unchanged by default', () => {
    const r = cleanup(FAMILY, defaultEnabled());
    expect(r.text).toBe(FAMILY);
    expect(r.removed).toBe(0);
  });

  it('Persian word with ZWNJ is unchanged by default', () => {
    const word = 'می‌خواهم';
    expect(cleanup(word, defaultEnabled()).text).toBe(word);
  });

  it('Arabic and Hebrew with RLM/LRM marks are unchanged by default', () => {
    const hebrew = 'שלום‏ עולם';
    const arabic = '‏مرحبا‎ بالعالم';
    expect(cleanup(hebrew, defaultEnabled()).text).toBe(hebrew);
    expect(cleanup(arabic, defaultEnabled()).text).toBe(arabic);
  });

  it('NBSP and variation selectors are kept by default', () => {
    const t = 'a b ❤️';
    expect(cleanup(t, defaultEnabled()).text).toBe(t);
  });
});

describe('default removals', () => {
  it('removes ZWSP, BOM (also at start), soft hyphen, tag chars and stray controls', () => {
    const input = '﻿a​b­c\u{E0041}d\u0007e\tf\nz';
    const r = cleanup(input, defaultEnabled());
    expect(r.text).toBe('abcde\tf\nz');
    expect(r.removed).toBe(5);
  });

  it('removes word joiner and invisible operators by default', () => {
    expect(cleanup('a⁠b⁢c', defaultEnabled()).text).toBe('abc');
  });
});

describe('scan positions', () => {
  it('uses code-point indexes and line:column with astral characters before the flagged one', () => {
    const text = '😀😀​\nab‍c';
    const f = scan(text);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ index: 2, line: 1, column: 3, cp: 0x200b, hex: 'U+200B', name: 'ZERO WIDTH SPACE', ruleId: 'zwsp' });
    expect(f[1]).toMatchObject({ index: 6, line: 2, column: 3, cp: 0x200d, ruleId: 'zwj' });
  });

  it('never flags tab, LF or CR', () => {
    expect(scan('a\tb\r\nc')).toEqual([]);
  });

  it('counts findings per rule', () => {
    expect(countByRule(scan('​​‍'))).toEqual({ zwsp: 2, zwj: 1 });
  });

  it('flags combining grapheme joiner as detect-only', () => {
    const f = scan('e͏x');
    expect(f[0]?.ruleId).toBe('cgj');
    expect(cleanup('e͏x', ALL).text).toBe('e͏x');
  });
});

describe('toggles', () => {
  it('turning ZWJ on removes it, leaving the family sequence broken', () => {
    const r = cleanup(FAMILY, new Set(['zwj']));
    expect(r.text).toBe('\u{1F468}\u{1F469}\u{1F467}');
  });

  it('bidi toggle removes direction controls only when on', () => {
    const t = 'abc‮def⁩';
    expect(cleanup(t, new Set()).text).toBe(t);
    expect(cleanup(t, new Set(['bidi'])).text).toBe('abcdef');
  });

  it('spaces toggle converts NBSP and other spaces to a normal space', () => {
    const r = cleanup('a b　c', new Set(['spaces']));
    expect(r.text).toBe('a b c');
    expect(r.converted).toBe(2);
  });

  it('variation selectors toggle removes them', () => {
    expect(cleanup('❤️', new Set(['vs'])).text).toBe('❤');
  });

  it('combining marks are never removed even when every rule is on', () => {
    expect(cleanup('é͏', ALL).text).toBe('é͏');
  });

  it('a disabled rule leaves its characters alone', () => {
    expect(cleanup('a​b', new Set(['zwj'])).text).toBe('a​b');
  });
});

describe('idempotence', () => {
  it('a second cleanup changes nothing', () => {
    const input = '﻿​Hello world⁠ \u{E0020}‮ ok\u0003';
    const once = cleanup(input, ALL).text;
    expect(cleanup(once, ALL).text).toBe(once);
  });
});
