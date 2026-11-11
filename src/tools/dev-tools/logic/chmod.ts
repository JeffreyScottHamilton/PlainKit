export type Mode = { special: number; owner: number; group: number; other: number };
export type ModeResult = { ok: true; mode: Mode } | { ok: false; error: string };

export const DEFAULT_MODE: Mode = { special: 0, owner: 7, group: 5, other: 5 };

export function toOctal(m: Mode): string {
  const base = `${m.owner}${m.group}${m.other}`;
  return m.special ? `${m.special}${base}` : base;
}

/** setuid/setgid/sticky show in the execute slot: s/S for owner and group, t/T for other. */
export function toSymbolic(m: Mode): string {
  const trip = (bits: number, special: boolean, sLetter: string) => {
    const r = bits & 4 ? 'r' : '-';
    const w = bits & 2 ? 'w' : '-';
    const x = bits & 1;
    if (special) return r + w + (x ? sLetter : sLetter.toUpperCase());
    return r + w + (x ? 'x' : '-');
  };
  return trip(m.owner, !!(m.special & 4), 's') + trip(m.group, !!(m.special & 2), 's') + trip(m.other, !!(m.special & 1), 't');
}

export function parseOctal(s: string): ModeResult {
  const t = s.trim();
  if (!/^[0-7]{3,4}$/.test(t)) return { ok: false, error: 'Octal mode must be 3 or 4 digits from 0 to 7, such as 755 or 4755.' };
  const digits = t.padStart(4, '0').split('').map(Number);
  const [special, owner, group, other] = digits as [number, number, number, number];
  return { ok: true, mode: { special, owner, group, other } };
}

/** Reads rwxr-xr-x style text. Execute slots also accept s/S (owner, group) and t/T (other). */
export function parseSymbolic(s: string): ModeResult {
  const t = s.trim();
  const bad = { ok: false as const, error: 'Symbolic mode needs 9 characters like rwxr-xr-x. In execute slots use x, -, s, S (owner, group) or t, T (other).' };
  if (!/^[rwxsStT-]{9}$/.test(t)) return bad;
  const triple = (o: number, specialLetters: string) => {
    const [r, w, x] = [t[o], t[o + 1], t[o + 2]];
    if ((r !== 'r' && r !== '-') || (w !== 'w' && w !== '-')) return null;
    if (x !== 'x' && x !== '-' && !specialLetters.includes(x!)) return null;
    const digit = (r === 'r' ? 4 : 0) + (w === 'w' ? 2 : 0) + (x === '-' ? 0 : 1);
    return { digit, special: specialLetters.includes(x!) && (x === 's' || x === 'S' || x === 't' || x === 'T') };
  };
  const o = triple(0, 'sS');
  const g = triple(3, 'sS');
  const ot = triple(6, 'tT');
  if (!o || !g || !ot) return bad;
  const special = (o.special ? 4 : 0) | (g.special ? 2 : 0) | (ot.special ? 1 : 0);
  return { ok: true, mode: { special, owner: o.digit, group: g.digit, other: ot.digit } };
}

/** Shell-quotes the file name only when it contains characters the shell would split or expand. */
export function commandPreview(m: Mode, file: string): string {
  const name = file.trim() || 'file';
  const q = /^[\w./-]+$/.test(name) ? name : `'${name.replace(/'/g, "'\\''")}'`;
  return `chmod ${toOctal(m)} ${q}`;
}
