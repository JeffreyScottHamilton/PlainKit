import cronstrue from 'cronstrue';

type FieldSpec = { name: string; min: number; max: number; names?: Record<string, number> };
const FIELDS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 } },
  { name: 'day-of-week', min: 0, max: 7, names: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } },
];

export type CronSpec = { minutes: number[]; hours: number[]; doms: Set<number>; months: Set<number>; dows: Set<number>; domStar: boolean; dowStar: boolean };
export type CronParse = { ok: true; spec: CronSpec } | { ok: false; message: string };

function parseValue(tok: string, f: FieldSpec): number | null {
  const lower = tok.toLowerCase();
  if (f.names && lower in f.names) return f.names[lower] ?? null;
  return /^\d+$/.test(tok) ? Number(tok) : null;
}

function parseField(raw: string, f: FieldSpec): { ok: true; values: Set<number>; star: boolean } | { ok: false; message: string } {
  const values = new Set<number>();
  const star = raw.startsWith('*');
  for (const item of raw.split(',')) {
    if (item === '') return { ok: false, message: `${f.name}: empty item in list "${raw}".` };
    const [range = '', stepRaw, ...rest] = item.split('/');
    if (rest.length > 0) return { ok: false, message: `${f.name}: too many "/" in "${item}".` };
    let step = 1;
    if (stepRaw !== undefined) {
      if (!/^\d+$/.test(stepRaw) || Number(stepRaw) < 1) return { ok: false, message: `${f.name}: step must be a whole number of 1 or more, got "${stepRaw}".` };
      step = Number(stepRaw);
    }
    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = f.min;
      hi = f.name === 'day-of-week' ? 6 : f.max;
    } else if (range.includes('-')) {
      const [a = '', b = ''] = range.split('-');
      const va = parseValue(a, f);
      const vb = parseValue(b, f);
      if (va === null || vb === null) return { ok: false, message: `${f.name}: "${range}" is not a valid range.` };
      lo = va;
      hi = vb;
      if (lo > hi) return { ok: false, message: `${f.name}: range start ${a} is after end ${b}.` };
    } else {
      const v = parseValue(range, f);
      if (v === null) return { ok: false, message: `${f.name}: "${range}" is not a number or name.` };
      lo = v;
      hi = stepRaw !== undefined ? (f.name === 'day-of-week' ? 6 : f.max) : v;
    }
    if (lo < f.min || lo > f.max || hi < f.min || hi > f.max) return { ok: false, message: `${f.name} must be ${f.min}-${f.max}, got ${lo < f.min || lo > f.max ? lo : hi}.` };
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { ok: true, values, star };
}

export function parseCron(expr: string): CronParse {
  const parts = expr.trim().split(/\s+/).filter((p) => p !== '');
  if (parts.length !== 5) return { ok: false, message: `Expected 5 fields (minute hour day-of-month month day-of-week), found ${parts.length}.` };
  const parsed = parts.map((p, i) => parseField(p, FIELDS[i]!));
  for (const p of parsed) if (!p.ok) return p;
  const [mi, ho, dom, mo, dow] = parsed as { ok: true; values: Set<number>; star: boolean }[];
  const dows = new Set<number>();
  for (const v of dow!.values) dows.add(v === 7 ? 0 : v);
  return {
    ok: true,
    spec: {
      minutes: [...mi!.values].sort((a, b) => a - b),
      hours: [...ho!.values].sort((a, b) => a - b),
      doms: dom!.values,
      months: mo!.values,
      dows,
      domStar: dom!.star,
      dowStar: dow!.star,
    },
  };
}

function dayMatches(spec: CronSpec, d: Date): boolean {
  if (!spec.months.has(d.getMonth() + 1)) return false;
  const domOk = spec.doms.has(d.getDate());
  const dowOk = spec.dows.has(d.getDay());
  // Vixie cron rule: when both day fields are restricted, either may match; otherwise both must.
  return spec.domStar || spec.dowStar ? domOk && dowOk : domOk || dowOk;
}

/** Next `count` run times strictly after `from`, in local time. */
export function nextRuns(spec: CronSpec, from: Date, count: number): Date[] {
  const out: Date[] = [];
  const startMs = from.getTime();
  const y = from.getFullYear();
  const m = from.getMonth();
  const d0 = from.getDate();
  for (let dayOffset = 0; dayOffset < 366 * 5 && out.length < count; dayOffset++) {
    const day = new Date(y, m, d0 + dayOffset);
    if (!dayMatches(spec, day)) continue;
    for (const h of spec.hours) {
      for (const mi of spec.minutes) {
        const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0);
        if (t.getHours() !== h || t.getMinutes() !== mi) continue; // local time that does not exist (DST gap)
        if (t.getTime() <= startMs) continue;
        out.push(t);
        if (out.length === count) return out;
      }
    }
  }
  return out;
}

export function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { throwExceptionOnParseError: true });
  } catch {
    return 'No plain-English description available for this expression.';
  }
}
