export type DateFormat = 'iso' | 'long' | 'us';

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'iso', label: '2026-11-25' },
  { value: 'long', label: '25 Nov 2026' },
  { value: 'us', label: '11/25/2026' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date. ASCII only, so it is always safe to write with Helvetica. */
export function formatDate(d: Date, f: DateFormat): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (f === 'iso') return `${y}-${p2(m)}-${p2(day)}`;
  if (f === 'long') return `${day} ${MONTHS[m - 1]} ${y}`;
  return `${p2(m)}/${p2(day)}/${y}`;
}
