export type CipherMode = 'shift' | 'rot13' | 'rot47';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Letters shift within their case; everything else is unchanged. */
export function shiftLetters(text: string, shift: number): string {
  const k = mod(shift, 26);
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + mod(c.charCodeAt(0) - base + k, 26));
  });
}

/** ROT47 rotates printable ASCII 33 to 126. Applying it twice gives the original. */
export function rot47(text: string): string {
  return text.replace(/[!-~]/g, (c) => String.fromCharCode(33 + mod(c.charCodeAt(0) - 33 + 47, 94)));
}

export function caesar(text: string, mode: CipherMode, shift: number): string {
  if (mode === 'rot13') return shiftLetters(text, 13);
  if (mode === 'rot47') return rot47(text);
  return shiftLetters(text, shift);
}
