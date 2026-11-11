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

export function parseSymbolic(s: string): ModeResult {
  const t = s.trim();
  if (!/^[rwxsStT-]{9}$/.test(t)) return { ok: false, error: 'Symbolic mode needs 9 characters like rwxr-xr-x (s, S, t, T allowed in execute positions).' };
  const bit = (i: number, letter: string, special: string, specialUpper: string) => {
    const c = t[i]!;
    const r = i === 0 || i === 3 || i === 6 ? 'r' : i === 1 || i === 4 || i === 7 ? 'w' : 'x';
    if (c === r) return 4 >> (i % 3);
    if (c === '-') return 0;
    if (c === letter) return 1;
    if (c === special) return 1;
    if (c === specialUpper) return 0;
    return -1;
  };
  const sum = (from: number) => {
    let total = 0;
    for (let k = 0; k < 3; k++) {
      const i = from + k;
      const c = t[i]!;
      const r = 4 >> k;
      const rwx = k === 0 ? 'r' : k === 1 ? 'w' : 'x';
      if (c === rwx) total += r;
      else if (c !== '-' && !(k === 2 && 'sStT'.includes(c))) return -1;
    }
    return total;
  };
  void bit;
  const owner = sum(0);
  const group = sum(3);
  const other = sum(6);
  if (owner < 0 || group < 0 || other < 0) return { ok: false, error: 'Symbolic mode has an invalid character. Use r, w, x, -, or s, S, t, T in execute positions.' };
  const special = (t[2] === 's' || t[2] === 'S' ? 4 : 0) | (t[5] === 's' || t[5] === 'S' ? 2 : 0) | (t[8] === 't' || t[8] === 'T' ? 1 : 0);
  const xSpecial = (t[2] === 's' || t[2] === 'S') && !(owner & 1) && t[2] === 's';
  const x = { owner: owner + (t[2] === 's' ? 1 : 0), group: group + (t[5] === 's' ? 1 : 0), other: other + (t[8] === 't' ? 1 : 0) };
  void xSpecial;
  return { ok: true, mode: { special, owner: x.owner, group: x.group, other: x.other } };
}

/** Shell-quotes the file name only when it contains characters the shell would split or expand. */
export function commandPreview(m: Mode, file: string): string {
  const name = file.trim() || 'file';
  const q = /^[\w./-]+$/.test(name) ? name : `'${name.replace(/'/g, "'\\''")}'`;
  return `chmod ${toOctal(m)} ${q}`;
}
