export const UUID_MIN = 1;
export const UUID_MAX = 100;

export function uuidV4(): string {
  return crypto.randomUUID();
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp, version 7, RFC variant, random remainder. */
export function uuidV7(nowMs: number, fill: (b: Uint8Array) => void = (b) => crypto.getRandomValues(b)): string {
  const b = new Uint8Array(16);
  fill(b);
  let ms = Math.floor(nowMs);
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatUuid(id: string, upper: boolean, hyphens: boolean): string {
  const s = hyphens ? id : id.replace(/-/g, '');
  return upper ? s.toUpperCase() : s;
}

export function validCount(n: number): boolean {
  return Number.isInteger(n) && n >= UUID_MIN && n <= UUID_MAX;
}
