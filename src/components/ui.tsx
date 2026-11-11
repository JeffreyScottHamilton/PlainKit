import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Check, CircleAlert, Copy, Info } from 'lucide-react';
import './components.css';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; block?: boolean };
export function Button({ variant = 'secondary', size = 'md', block, className = '', type = 'button', ...rest }: BtnProps) {
  const cls = ['pk-btn', variant !== 'secondary' && `pk-btn--${variant}`, size === 'sm' && 'pk-btn--sm', block && 'pk-btn--block', className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}

/** Label + control. Pass a render function to receive the id for the control. */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode }) {
  const id = useId();
  const desc = hint || error ? `${id}-d` : undefined;
  return (
    <div className="pk-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': desc, 'aria-invalid': error ? true : undefined })}
      {(hint || error) && (
        <span id={desc} className="pk-hint" style={error ? { color: 'var(--error)' } : undefined}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="pk-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ICONS = { info: Info, warn: AlertTriangle, error: CircleAlert, success: Check };
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const Icon = ICONS[kind];
  return (
    <div className={`pk-notice pk-notice--${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** fraction undefined = indeterminate. Never invent a percentage. */
export function Progress({ fraction, label }: { fraction?: number; label: string }) {
  const known = typeof fraction === 'number';
  return (
    <div className={`pk-progress${known ? '' : ' pk-progress--indeterminate'}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? Math.round(fraction * 100) : undefined}>
      <div style={known ? { width: `${Math.round(fraction * 100)}%` } : undefined} />
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const t = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('fail');
    }
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setState('idle'), 1500);
  };
  return (
    <Button size={size} onClick={copy} disabled={!text}>
      {state === 'ok' ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}</span>
    </Button>
  );
}
