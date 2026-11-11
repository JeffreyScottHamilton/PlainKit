import { useMemo } from 'react';
import { Button, Notice } from '@/components/ui';
import { Field } from '@/components/ui';
import { useUtilState } from '../kit';
import { describeCron, nextRuns, parseCron } from '../logic/cron';

const EXAMPLE = '*/15 9-17 * * 1-5';

export default function Util() {
  const [s, set] = useUtilState('cron', { input: EXAMPLE });
  // Next runs depend on the current time, so they are recomputed only when the expression changes.
  const r = useMemo(() => {
    const p = parseCron(s.input);
    if (!p.ok) return p;
    return { ok: true as const, description: describeCron(s.input), runs: nextRuns(p.spec, new Date(), 5) };
  }, [s.input]);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="pk-stack">
      <p className="muted">Five fields: minute, hour, day of month, month, day of week. Supports *, lists (1,3), ranges (9-17), and steps (*/15, 1-10/2).</p>
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <Field label="Cron expression" error={r.ok ? undefined : r.message}>
        {(a) => <input {...a} className="pk-input mono" value={s.input} spellCheck={false} onChange={(e) => set({ input: e.target.value })} />}
      </Field>
      {r.ok && (
        <>
          <p>{r.description}</p>
          <section className="pk-stack" aria-label="Next runs">
            <h3 style={{ margin: 0, fontSize: 15 }}>Next 5 runs</h3>
            {r.runs.length === 0 && <p className="muted">No run found in the next five years.</p>}
            <ol>
              {r.runs.map((d) => (
                <li key={d.getTime()} className="mono">
                  {d.toLocaleString()}
                </li>
              ))}
            </ol>
            <Notice kind="info">Times are in your local time zone ({zone}). The day-of-month and day-of-week rule: if both are restricted, a day matches when either matches (standard cron behavior).</Notice>
          </section>
        </>
      )}
    </div>
  );
}
