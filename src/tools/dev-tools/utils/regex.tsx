import { useEffect, useState } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { callWorker } from '@/workers/rpc';
import { TextIn, useUtilState } from '../kit';
import { compileRegex, type RegexRequest, type RegexResult } from '../logic/regex';
import '../utils-a.css';

const EXAMPLE_PATTERN = '(\\d{4})-(\\d{2})-(\\d{2})';
const EXAMPLE_TEXT = 'Released 2026-01-05 and updated 2026-11-11.';
const TIME_LIMIT_MS = 1500;
const DEBOUNCE_MS = 200;
const FLAGS = [
  { key: 'i', label: 'Ignore case' },
  { key: 'm', label: 'Multiline' },
  { key: 's', label: 'Dot matches newline' },
  { key: 'u', label: 'Unicode' },
] as const;

type Run = { kind: 'idle' } | { kind: 'running' } | { kind: 'ok'; data: RegexResult } | { kind: 'error'; message: string } | { kind: 'stopped' };

const makeWorker = () => new Worker(new URL('../regex.worker.ts', import.meta.url), { type: 'module' });

export default function Util() {
  const [s, set] = useUtilState('regex', { pattern: '', text: '', i: false, m: false, s: false, u: false });
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const flags = FLAGS.filter((f) => s[f.key]).map((f) => f.key).join('');
  const pattern = s.pattern;
  const text = s.text;

  useEffect(() => {
    if (pattern === '') {
      setRun({ kind: 'idle' });
      return;
    }
    const compiled = compileRegex(pattern, flags);
    if (!compiled.ok) {
      setRun({ kind: 'error', message: compiled.message });
      return;
    }
    let cancel: (() => void) | undefined;
    // Debounce, then run the match in a worker that is terminated after TIME_LIMIT_MS.
    const debounce = window.setTimeout(() => {
      const ctl = new AbortController();
      let timedOut = false;
      let stopped = false;
      const limit = window.setTimeout(() => {
        timedOut = true;
        ctl.abort();
      }, TIME_LIMIT_MS);
      setRun({ kind: 'running' });
      const req: RegexRequest = { pattern, flags: compiled.flags, text };
      callWorker<RegexRequest, RegexResult>(makeWorker, req, { signal: ctl.signal })
        .then((data) => {
          if (!stopped) setRun({ kind: 'ok', data });
        })
        .catch((err: unknown) => {
          if (stopped) return;
          if (timedOut) setRun({ kind: 'stopped' });
          else setRun({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        })
        .finally(() => window.clearTimeout(limit));
      cancel = () => {
        stopped = true;
        window.clearTimeout(limit);
        ctl.abort();
      };
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(debounce);
      cancel?.();
    };
  }, [pattern, flags, text]);

  const inputError = run.kind === 'error' ? run.message : undefined;

  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Button onClick={() => set({ pattern: EXAMPLE_PATTERN, text: EXAMPLE_TEXT })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ pattern: '', text: '' })}>Clear</Button>
      </div>
      <Field label="Pattern" error={inputError}>
        {(a) => (
          <input
            {...a}
            className="pk-input mono"
            value={s.pattern}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => set({ pattern: e.target.value })}
          />
        )}
      </Field>
      <div className="pk-row">
        {FLAGS.map((f) => (
          <label key={f.key} className="pk-check">
            <input type="checkbox" checked={s[f.key]} onChange={(e) => set({ [f.key]: e.target.checked })} /> {f.label} <span className="muted mono">({f.key})</span>
          </label>
        ))}
      </div>
      <p className="muted">Matches are always global (every match is listed). The sticky y flag is not offered.</p>
      <TextIn label="Test text" rows={6} value={s.text} onChange={(text) => set({ text })} />
      {run.kind === 'stopped' && <Notice kind="error">Stopped: this pattern took too long (possible catastrophic backtracking).</Notice>}
      {run.kind === 'running' && <p className="muted" aria-live="polite">Matching…</p>}
      {run.kind === 'ok' && (
        <section className="pk-stack" aria-label="Matches">
          <p aria-live="polite">
            <strong>{run.data.count}</strong> {run.data.count === 1 ? 'match' : 'matches'}
            {run.data.truncated && ` (showing the first ${run.data.matches.length})`}
          </p>
          <ol className="dev-list">
            {run.data.matches.map((m, idx) => (
              <li key={`${m.index}-${idx}`} className="pk-panel" style={{ padding: 8 }}>
                <div className="dev-row-item">
                  <span className="mono muted">index {m.index}</span>
                  <span className="mono">{m.match === '' ? '(empty match)' : JSON.stringify(m.match)}</span>
                </div>
                {m.groups.map((g, gi) => (
                  <div key={gi} className="mono muted">
                    group {gi + 1}: {g === undefined ? 'undefined' : JSON.stringify(g)}
                  </div>
                ))}
                {m.named &&
                  Object.entries(m.named).map(([k, v]) => (
                    <div key={k} className="mono muted">
                      {k}: {v === undefined ? 'undefined' : JSON.stringify(v)}
                    </div>
                  ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
