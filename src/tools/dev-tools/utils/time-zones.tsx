import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { useUtilState } from '../kit';
import { formatZone, wallToInstant, zoneList } from '../logic/time-zones';

const TIME = /^(\d{2}):(\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export default function Util() {
  const [s, set] = useUtilState('time-zones', {
    date: '2025-03-09',
    time: '12:00',
    source: 'America/New_York',
    zones: ['UTC', 'Europe/London', 'Asia/Kolkata'] as string[],
    pick: 'Asia/Tokyo',
  });
  const zones = useMemo(() => zoneList(), []);
  const dm = DATE.exec(s.date);
  const tm = TIME.exec(s.time);
  const valid = dm && tm && Number(tm[1]) < 24 && Number(tm[2]) < 60;
  const wall = valid ? { y: Number(dm[1]), mo: Number(dm[2]), d: Number(dm[3]), h: Number(tm[1]), mi: Number(tm[2]) } : null;
  const inst = wall ? wallToInstant(wall, s.source) : null;
  const rows = inst ? [s.source, ...s.zones.filter((z) => z !== s.source)] : [];

  return (
    <div className="pk-stack">
      <p className="muted">Converts a wall-clock time in a source zone to other zones. Uses the browser's time zone database.</p>
      <div className="pk-row">
        <Field label="Date" error={s.date && !dm ? 'Use YYYY-MM-DD.' : undefined}>
          {(a) => <input {...a} className="pk-input" type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
        <Field label="Time (24-hour)" error={s.time && !tm ? 'Use HH:MM, such as 14:30.' : undefined}>
          {(a) => <input {...a} className="pk-input" type="time" value={s.time} onChange={(e) => set({ time: e.target.value })} />}
        </Field>
        <Field label="Source time zone">
          {(a) => (
            <select {...a} className="pk-select" value={s.source} onChange={(e) => set({ source: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {inst && !inst.exists && (
        <Notice kind="warn">
          {s.time} does not exist in {s.source} on {s.date}: clocks skip forward at that moment. Showing the instant after the change.
        </Notice>
      )}
      {inst && (
        <table className="dev-table">
          <caption>Target zones</caption>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              <th scope="col">Local time</th>
              <th scope="col">UTC offset</th>
              <th scope="col">Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => {
              const f = formatZone(inst.ms, z);
              return (
                <tr key={z}>
                  <th scope="row">{z}</th>
                  <td className="mono">{f.wall}</td>
                  <td className="mono">{f.offset}</td>
                  <td>
                    {z !== s.source && (
                      <Button size="sm" onClick={() => set({ zones: s.zones.filter((x) => x !== z) })}>
                        Remove {z}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="pk-row">
        <Field label="Add a target zone">
          {(a) => (
            <select {...a} className="pk-select" value={s.pick} onChange={(e) => set({ pick: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button disabled={s.zones.includes(s.pick)} onClick={() => set({ zones: [...s.zones, s.pick] })}>
          Add zone
        </Button>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ date: '2025-03-09', time: '12:00', source: 'America/New_York', zones: ['UTC', 'Europe/London', 'Asia/Kolkata'] })}>Load example</Button>
        <Button onClick={() => set({ date: '', time: '' })}>Clear</Button>
      </div>
    </div>
  );
}
