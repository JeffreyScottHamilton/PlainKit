import { describe, expect, it } from 'vitest';
import { PRESETS, presetById } from './presets';

describe('presets', () => {
  it('has unique ids and positive sizes', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) {
      expect(p.widthMm).toBeGreaterThan(0);
      expect(p.heightMm).toBeGreaterThan(0);
    }
  });
  it('keeps head and eye ranges inside the photo height', () => {
    for (const p of PRESETS) {
      if (p.headHeightMm) expect(p.headHeightMm[0]).toBeLessThan(p.headHeightMm[1]);
      if (p.headHeightMm) expect(p.headHeightMm[1]).toBeLessThanOrEqual(p.heightMm);
      if (p.eyeLineFromBottomMm) expect(p.eyeLineFromBottomMm[1]).toBeLessThanOrEqual(p.heightMm);
    }
  });
  it('marks every preset as not re-checked', () => {
    for (const p of PRESETS) expect(p.lastChecked).toBeNull();
  });
  it('links every official source over https; only the custom size has none', () => {
    for (const p of PRESETS) {
      if (p.id === 'custom') {
        expect(p.sourceUrl).toBe('');
        continue;
      }
      expect(new URL(p.sourceUrl).protocol).toBe('https:');
    }
  });
  it('finds presets by id', () => {
    expect(presetById('uk-passport')?.widthMm).toBe(35);
    expect(presetById('nope')).toBeUndefined();
  });
});
