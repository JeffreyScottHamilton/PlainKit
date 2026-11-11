import { useEffect, useState, useSyncExternalStore } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { useToolState } from '@/session/toolState';
import { keepAwake, REASON_TEXT, STOP_KEYS, type StopKey } from './controller';
import './keep-awake.css';

type Timer = 'off' | '15' | '30' | '60' | '120' | 'custom';
const TIMERS: { value: Timer; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
  { value: '120', label: '120 min' },
  { value: 'custom', label: 'Custom' },
];

/** Minutes for the chosen timer. null means no timer. */
function minutesFor(timer: Timer, custom: string): { ok: true; minutes: number | null } | { ok: false; message: string } {
  if (timer === 'off') return { ok: true, minutes: null };
  if (timer !== 'custom') return { ok: true, minutes: Number(timer) };
  const n = Number(custom);
  if (!Number.isInteger(n) || n < 1 || n > 1440) return { ok: false, message: 'Custom time must be a whole number of minutes from 1 to 1440.' };
  return { ok: true, minutes: n };
}

/** mm:ss, or h:mm:ss from one hour up. Whole seconds, rounded up so it never shows 0:00 early. */
function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function Tool() {
  const s = useSyncExternalStore(keepAwake.subscribe, keepAwake.getState);
  const [cfg, setCfg] = useToolState('keep-awake', { timer: 'off' as Timer, custom: '45' });
  const [now, setNow] = useState(() => Date.now());

  // Re-render each second only while a timer runs. The live region below does not announce this.
  useEffect(() => {
    if (s.endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [s.endsAt]);

  const chosen = minutesFor(cfg.timer, cfg.custom);
  const remaining = s.endsAt === null ? null : Math.max(0, s.endsAt - now);

  let detail: string;
  if (s.active) detail = remaining === null ? 'Until you stop it.' : `Time left: ${formatRemaining(remaining)}`;
  else if (s.reason === 'tab-hidden' && s.intent) detail = 'Released: tab hidden. It is requested again when this tab is visible.';
  else if (s.reason) detail = `Released: ${REASON_TEXT[s.reason]}.`;
  else detail = 'Not active. Choose a timer, then select Keep screen awake.';

  return (
    <ToolPage toolId="keep-awake">
      {!s.supported && <Notice kind="warn">This browser does not support Screen Wake Lock.</Notice>}

      <section className="ka" aria-labelledby="ka-status">
        <h2 id="ka-status">Status</h2>
        <p className="ka-state">
          <span className={`pk-status pk-status--${s.active ? 'complete' : 'canceled'}`}>{s.active ? 'Active' : 'Released'}</span>
        </p>
        <p className="ka-detail">{detail}</p>
        {s.error && (
          <Notice kind="error">
            <strong>Could not keep the screen awake.</strong> {s.error}. Try again, or check the browser or power settings.
          </Notice>
        )}
        {remaining !== null && s.active && <output className="ka-time mono">{formatRemaining(remaining)}</output>}
      </section>

      <section className="ka-controls" aria-labelledby="ka-set">
        <h2 id="ka-set">Settings</h2>
        <Segmented label="Timer" value={cfg.timer} options={TIMERS} onChange={(timer) => setCfg({ timer })} />
        {cfg.timer === 'custom' && (
          <Field label="Custom minutes" error={chosen.ok ? undefined : chosen.message} hint="1 to 1440 minutes">
            {(a) => (
              <input {...a} className="pk-input" type="number" min={1} max={1440} step={1} value={cfg.custom} onChange={(e) => setCfg({ custom: e.target.value })} disabled={s.intent} />
            )}
          </Field>
        )}
        <Field label="Stop key" hint="Ignored while you type in a field.">
          {(a) => (
            <select {...a} className="pk-select" value={s.stopKey} onChange={(e) => keepAwake.setStopKey(e.target.value as StopKey)}>
              {STOP_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {s.intent ? (
            <Button variant="primary" onClick={() => keepAwake.stop()}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" disabled={!s.supported || !chosen.ok} onClick={() => chosen.ok && keepAwake.start(chosen.minutes)}>
              Keep screen awake
            </Button>
          )}
        </div>
        <p className="ka-hint" aria-live="polite">
          {s.announcement}
        </p>
      </section>

      <p className="ka-limits">
        Works only while this tab is visible. It cannot move the mouse, change chat presence, or override system lock policies.
      </p>
    </ToolPage>
  );
}
