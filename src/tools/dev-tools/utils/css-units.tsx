import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { useUtilState } from '../kit';
import { convertCss, UNITS, type Unit } from '../logic/css-units';

const EXAMPLE = { value: '1.5', unit: 'rem' as Unit, root: '16', parent: '16', vw: '1280', vh: '800' };

export default function Util() {
  const [s, set] = useUtilState('css-units', { ...EXAMPLE });
  const num = (x: string) => (x.trim() === '' ? NaN : Number(x));
  const r = useMemo(
    () => convertCss(num(s.value), s.unit, { rootPx: num(s.root), parentPx: num(s.parent), viewportW: num(s.vw), viewportH: num(s.vh) }),
    [s.value, s.unit, s.root, s.parent, s.vw, s.vh],
  );
  const input = (label: string, key: 'value' | 'root' | 'parent' | 'vw' | 'vh', hint?: string) => (
    <Field label={label} hint={hint}>
      {(a) => <input {...a} className="pk-input" type="number" step="any" value={s[key]} onChange={(e) => set({ [key]: e.target.value })} />}
    </Field>
  );
  return (
    <div className="pk-stack">
      <p className="muted">Converts a length between CSS units. Root, parent, and viewport sizes set the relative units.</p>
      <div className="pk-row">
        {input('Value', 'value')}
        <Field label="Unit">
          {(a) => (
            <select {...a} className="pk-select" value={s.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="pk-row">
        {input('Root font size (px)', 'root', 'Used by rem')}
        {input('Parent font size (px)', 'parent', 'Used by em')}
        {input('Viewport width (px)', 'vw', 'Used by vw')}
        {input('Viewport height (px)', 'vh', 'Used by vh')}
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ ...EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ value: '', unit: 'px' })}>Clear value</Button>
      </div>
      {!r.ok && <Notice kind="error">{r.error}</Notice>}
      {r.ok && (
        <table className="dev-table">
          <caption>Same length in every unit</caption>
          <thead>
            <tr>
              <th scope="col">Unit</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.unit}>
                <th scope="row">{row.unit}</th>
                <td className="mono">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
