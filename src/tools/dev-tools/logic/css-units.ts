export const UNITS = ['px', 'rem', 'em', 'pt', 'pc', 'in', 'cm', 'mm', 'vw', 'vh'] as const;
export type Unit = (typeof UNITS)[number];
export type CssContext = { rootPx: number; parentPx: number; viewportW: number; viewportH: number };
export type CssResult = { ok: true; rows: { unit: Unit; value: string }[] } | { ok: false; error: string };

/** Absolute px per unit. em uses the parent size, rem the root size, vw/vh the viewport. */
function pxPer(unit: Unit, c: CssContext): number {
  switch (unit) {
    case 'px':
      return 1;
    case 'rem':
      return c.rootPx;
    case 'em':
      return c.parentPx;
    case 'pt':
      return 4 / 3;
    case 'pc':
      return 16;
    case 'in':
      return 96;
    case 'cm':
      return 96 / 2.54;
    case 'mm':
      return 96 / 25.4;
    case 'vw':
      return c.viewportW / 100;
    case 'vh':
      return c.viewportH / 100;
  }
}

const fmt = (n: number) => String(Number(n.toFixed(4)));

export function convertCss(value: number, from: Unit, c: CssContext): CssResult {
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a number, such as 1.5.' };
  if (!(c.rootPx > 0 && c.parentPx > 0 && c.viewportW > 0 && c.viewportH > 0)) return { ok: false, error: 'Root, parent, and viewport sizes must be greater than 0.' };
  const px = value * pxPer(from, c);
  return { ok: true, rows: UNITS.map((u) => ({ unit: u, value: fmt(px / pxPer(u, c)) })) };
}
