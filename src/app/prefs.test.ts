import { describe, expect, it } from 'vitest';
import { MAX_RECENTS, nextRecents, parsePrefs, resolveTheme } from './prefs';

describe('parsePrefs', () => {
  it('falls back to defaults for garbage', () => {
    expect(parsePrefs(null)).toEqual({ theme: 'dark', favorites: [], recents: [] });
    expect(parsePrefs([1, 2])).toEqual({ theme: 'dark', favorites: [], recents: [] });
    expect(parsePrefs({ theme: 'neon' }).theme).toBe('dark');
  });
  it('keeps valid theme and drops unknown or duplicate tool ids', () => {
    const p = parsePrefs({ theme: 'light', favorites: ['compress', 'nope', 'compress', 42], recents: ['pdf'] });
    expect(p).toEqual({ theme: 'light', favorites: ['compress'], recents: ['pdf'] });
  });
  it('caps recents at the maximum', () => {
    const p = parsePrefs({ recents: ['compress', 'convert', 'cutout', 'dev-tools', 'metadata', 'pdf'] });
    expect(p.recents).toHaveLength(MAX_RECENTS);
  });
});

describe('nextRecents', () => {
  it('moves a repeat visit to the front and caps the list at five', () => {
    expect(nextRecents(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(nextRecents(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});

describe('resolveTheme', () => {
  it('resolves system from the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });
});
