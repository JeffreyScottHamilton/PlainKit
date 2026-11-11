export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

/** Percentage change from a to b, e.g. -42 means 42% smaller. */
export function percentChange(from: number, to: number): number {
  return from === 0 ? 0 : Math.round(((to - from) / from) * 1000) / 10;
}

/** photo.jpg + "compressed" + "webp" -> photo-compressed.webp. Strips path separators and control chars. */
export function outputName(inputName: string, suffix: string, ext?: string): string {
  const clean = inputName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const oldExt = dot > 0 ? clean.slice(dot + 1) : '';
  const e = ext ?? oldExt;
  return `${base}${suffix ? `-${suffix}` : ''}${e ? `.${e}` : ''}`;
}

export function uid(): string {
  return crypto.randomUUID();
}
