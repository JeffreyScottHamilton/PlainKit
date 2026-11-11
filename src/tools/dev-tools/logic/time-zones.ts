export const FALLBACK_ZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai',
  'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

/** Full IANA list when the browser provides it, otherwise a short built-in list. */
export function zoneList(): string[] {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONES;
}

export type Wall = { y: number; mo: number; d: number; h: number; mi: number };

/** Wall-clock fields as they read in a zone, expressed as if they were UTC. */
function wallAsUtc(ms: number, zone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

export const offsetMs = (ms: number, zone: string): number => wallAsUtc(ms, zone) - Math.floor(ms / 1000) * 1000;

/**
 * Converts a wall time in a zone to an instant with the iterative offset method.
 * exists is false for a wall time skipped by a DST change; the result is then the instant after the jump.
 */
export function wallToInstant(w: Wall, zone: string): { ms: number; exists: boolean } {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
  const t1 = guess - offsetMs(guess, zone);
  const t2 = guess - offsetMs(t1, zone);
  return { ms: t2, exists: wallAsUtc(t2, zone) === guess };
}

export function formatZone(ms: number, zone: string): { wall: string; offset: string } {
  const w = new Date(wallAsUtc(ms, zone)).toISOString().slice(0, 16).replace('T', ' ');
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return { wall: w, offset };
}
