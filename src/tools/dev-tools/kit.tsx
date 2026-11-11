import type { ReactNode } from 'react';
import { CopyButton, Field } from '@/components/ui';
import { useToolState } from '@/session/toolState';

/** Per-utility state kept in memory while the tab is open (not persisted, cleared with the session). */
export function useUtilState<T extends object>(utilId: string, initial: T) {
  return useToolState<T>(`dev:${utilId}`, initial);
}

export function TextIn(p: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; error?: string; hint?: ReactNode }) {
  return (
    <Field label={p.label} error={p.error} hint={p.hint}>
      {(a) => <textarea {...a} className="pk-textarea" rows={p.rows ?? 8} value={p.value} placeholder={p.placeholder} spellCheck={false} onChange={(e) => p.onChange(e.target.value)} />}
    </Field>
  );
}

export function TextOut(p: { label: string; value: string; rows?: number; hint?: ReactNode }) {
  return (
    <div className="pk-stack" style={{ gap: 4 }}>
      <Field label={p.label} hint={p.hint}>
        {(a) => <textarea {...a} className="pk-textarea" rows={p.rows ?? 8} value={p.value} readOnly spellCheck={false} />}
      </Field>
      <div>
        <CopyButton text={p.value} />
      </div>
    </div>
  );
}

/** Two panes side by side on wide screens, stacked on narrow ones. */
export function Panes({ children }: { children: ReactNode }) {
  return <div className="dev-panes">{children}</div>;
}
