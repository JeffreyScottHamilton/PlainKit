import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { useUtilState } from '../kit';
import { contrastRatio, parseColor, rgbToHsl, toHex, type Rgba } from '../logic/color';
import '../utils-a.css';

const rgbText = (c: Rgba) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
const cssOf = (c: Rgba) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={label} error={error} hint="Hex (#RGB, #RRGGBB, #RRGGBBAA), rgb(), or hsl().">
      {(a) => <input {...a} className="pk-input mono" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function Verdict({ label, ratio, need }: { label: string; ratio: number; need: number }) {
  const pass = ratio >= need;
  return (
    <li className="dev-row-item">
      <span style={{ minWidth: 180 }}>{label}</span>
      <span className="mono">need {need}:1</span>
      <strong className={pass ? 'dev-add' : 'dev-del'}>{pass ? 'Pass' : 'Fail'}</strong>
    </li>
  );
}

export default function Util() {
  const [s, set] = useUtilState('color', { a: '#1E90FF', b: '#FFFFFF' });
  const pa = useMemo(() => parseColor(s.a), [s.a]);
  const pb = useMemo(() => parseColor(s.b), [s.b]);
  const bothOk = pa.ok && pb.ok;
  const ratio = bothOk ? contrastRatio(pa.color, pb.color) : 0;
  return (
    <div className="pk-stack">
      <div className="pk-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <ColorField label="Color" value={s.a} onChange={(a) => set({ a })} error={!pa.ok ? pa.message : undefined} />
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <ColorField label="Second color (for contrast)" value={s.b} onChange={(b) => set({ b })} error={!pb.ok ? pb.message : undefined} />
        </div>
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ a: '#1E90FF', b: '#FFFFFF' })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ a: '' })}>Clear</Button>
      </div>
      {pa.ok && (
        <div className="pk-row" style={{ alignItems: 'flex-start' }}>
          <div className="dev-swatch" style={{ background: cssOf(pa.color) }} aria-hidden />
          <dl className="dev-kv">
            <dt>HEX</dt>
            <dd className="mono">{toHex(pa.color, pa.hadAlpha)}</dd>
            <dt>RGB</dt>
            <dd className="mono">{rgbText(pa.color)}</dd>
            <dt>HSL</dt>
            <dd className="mono">
              {(() => {
                const h = rgbToHsl(pa.color.r, pa.color.g, pa.color.b);
                return `hsl(${h.h}, ${h.s}%, ${h.l}%)`;
              })()}
            </dd>
            {pa.hadAlpha && (
              <>
                <dt>Alpha</dt>
                <dd className="mono">{pa.color.a.toFixed(3)}</dd>
              </>
            )}
          </dl>
        </div>
      )}
      {bothOk && (
        <section className="pk-stack" aria-label="Contrast">
          <p>
            Contrast ratio: <strong className="mono">{ratio.toFixed(2)}:1</strong>
          </p>
          <ul className="dev-list">
            <Verdict label="AA normal text" ratio={ratio} need={4.5} />
            <Verdict label="AAA normal text" ratio={ratio} need={7} />
            <Verdict label="AA large text" ratio={ratio} need={3} />
            <Verdict label="AAA large text" ratio={ratio} need={4.5} />
          </ul>
          <Notice kind="info">Alpha is ignored for contrast. Colors are not composited.</Notice>
        </section>
      )}
    </div>
  );
}
