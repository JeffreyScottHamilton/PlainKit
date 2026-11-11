import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { useUtilState } from '../kit';
import { addToDate, diffDates, fmtYmd, parseDate, type AddUnit } from '../logic/date-calc';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Util() {
  const [s, set] = useUtilState('date-calc', {
    a: '2024-02-28',
    b: '2024-03-01',
    inclusive: false,
    base: '2024-02-29',
    amount: '1',
    unit: 'days' as AddUnit,
  });
  const da = useMemo(() => parseDate(s.a || ''), [s.a]);
  const db = useMemo(() => parseDate(s.b || ''), [s.b]);
  const diff = da.ok && db.ok ? diffDates(da.ms, db.ms, s.inclusive) : null;
  const base = parseDate(s.base || '');
  const amount = Number(s.amount);
  const amountOk = s.amount.trim() !== '' && Number.isInteger(amount);
  const added = base.ok && amountOk ? addToDate(base.ms, amount, s.unit) : null;
  return (
    <div className="pk-stack">
      <p className="muted">
        Date arithmetic uses UTC calendar days, so daylight saving time changes never shift a date by an hour or a day.
      </p>
      <h3>Difference between two dates</h3>
      <div className="pk-row">
        <Field label="From" error={s.a && !da.ok ? da.error : undefined}>
          {(p) => <input {...p} className="pk-input" type="date" value={s.a} onChange={(e) => set({ a: e.target.value })} />}
        </Field>
        <Field label="To" error={s.b && !db.ok ? db.error : undefined}>
          {(p) => <input {...p} className="pk-input" type="date" value={s.b} onChange={(e) => set({ b: e.target.value })} />}
        </Field>
        <label className="pk-check">
          <input type="checkbox" checked={s.inclusive} onChange={(e) => set({ inclusive: e.target.checked })} />
          Include both dates
        </label>
      </div>
      {diff && (
        <table className="dev-table">
          <tbody>
            <tr>
              <th scope="row">Days</th>
              <td className="mono">{diff.days}</td>
            </tr>
            <tr>
              <th scope="row">Weeks and days</th>
              <td className="mono">
                {diff.weeks} weeks, {diff.weekDays} days
              </td>
            </tr>
            <tr>
              <th scope="row">Years, months, days</th>
              <td className="mono">
                {diff.ymd.y} y {diff.ymd.m} m {diff.ymd.d} d
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {diff && diff.order === 'earlier' && <p className="muted">The second date is earlier than the first.</p>}
      <h3>Add or subtract</h3>
      <div className="pk-row">
        <Field label="Start date" error={s.base && !base.ok ? base.error : undefined}>
          {(p) => <input {...p} className="pk-input" type="date" value={s.base} onChange={(e) => set({ base: e.target.value })} />}
        </Field>
        <Field label="Amount" hint="Whole number. Use a minus sign to subtract." error={s.amount && !amountOk ? 'Enter a whole number, such as 3 or -2.' : undefined}>
          {(p) => <input {...p} className="pk-input" type="number" step={1} value={s.amount} onChange={(e) => set({ amount: e.target.value })} />}
        </Field>
        <Field label="Unit">
          {(p) => (
            <select {...p} className="pk-select" value={s.unit} onChange={(e) => set({ unit: e.target.value as AddUnit })}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          )}
        </Field>
      </div>
      {added !== null && (
        <p aria-live="polite">
          Result: <strong className="mono">{fmtYmd(added)}</strong> ({WEEKDAYS[new Date(added).getUTCDay()]})
        </p>
      )}
      {added !== null && (s.unit === 'months' || s.unit === 'years') && (
        <Notice kind="info">Months and years stop at the last day of the target month, so Feb 29 plus 1 year is Feb 28.</Notice>
      )}
      <div className="pk-row">
        <Button onClick={() => set({ a: '2024-02-28', b: '2024-03-01', inclusive: false, base: '2024-02-29', amount: '1', unit: 'days' })}>Load example</Button>
      </div>
    </div>
  );
}
