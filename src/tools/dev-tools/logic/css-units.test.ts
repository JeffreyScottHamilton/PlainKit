import { describe, expect, it } from 'vitest';
import { convertCss, type CssContext } from './css-units';

const ctx: CssContext = { rootPx: 16, parentPx: 20, viewportW: 1280, viewportH: 800 };
const find = (r: ReturnType<typeof convertCss>, unit: string) => {
  if (!r.ok) throw new Error(r.error);
  return r.rows.find((row) => row.unit === unit)?.value;
};

describe('css units', () => {
  it('converts rem using the root font size', () => {
    const r = convertCss(1.5, 'rem', ctx);
    expect(find(r, 'px')).toBe('24');
    expect(find(r, 'rem')).toBe('1.5');
    expect(find(convertCss(24, 'px', ctx), 'rem')).toBe('1.5');
  });

  it('uses the parent size for em and the viewport for vw', () => {
    expect(find(convertCss(2, 'em', ctx), 'px')).toBe('40');
    expect(find(convertCss(10, 'vw', ctx), 'px')).toBe('128');
  });

  it('rejects non-numeric values and non-positive contexts', () => {
    expect(convertCss(NaN, 'px', ctx)).toEqual({ ok: false, error: 'Enter a number, such as 1.5.' });
    expect(convertCss(1, 'px', { ...ctx, rootPx: 0 }).ok).toBe(false);
  });
});
