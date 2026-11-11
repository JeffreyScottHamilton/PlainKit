import { Button, CopyButton, Field } from '@/components/ui';
import { useUtilState } from '../kit';
import { commandPreview, DEFAULT_MODE, parseOctal, parseSymbolic, toOctal, toSymbolic, type Mode } from '../logic/chmod';

type Who = 'owner' | 'group' | 'other';
const WHO: { key: Who; label: string }[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'group', label: 'Group' },
  { key: 'other', label: 'Other' },
];
const BITS = [
  { bit: 4, label: 'read' },
  { bit: 2, label: 'write' },
  { bit: 1, label: 'execute' },
];
const SPECIAL = [
  { bit: 4, label: 'Set user ID (setuid, 4)' },
  { bit: 2, label: 'Set group ID (setgid, 2)' },
  { bit: 1, label: 'Sticky (1)' },
];

export default function Util() {
  const [s, set] = useUtilState('chmod', { mode: DEFAULT_MODE as Mode, oct: '755', sym: 'rwxr-xr-x', file: 'deploy.sh' });
  const oct = parseOctal(s.oct);
  const sym = parseSymbolic(s.sym);
  const octErr = s.oct.trim() && !oct.ok ? oct.error : undefined;
  const symErr = s.sym.trim() && !sym.ok ? sym.error : undefined;

  const apply = (m: Mode) => set({ mode: m, oct: toOctal(m), sym: toSymbolic(m) });
  const toggle = (key: keyof Mode, bit: number) => {
    const next = { ...s.mode, [key]: s.mode[key] ^ bit };
    apply(next);
  };
  const cmd = commandPreview(s.mode, s.file);

  return (
    <div className="pk-stack">
      <p className="muted">Builds a Unix permission mode from checkboxes, octal, or symbolic text. The command is a preview only.</p>
      <table className="dev-table">
        <thead>
          <tr>
            <th scope="col">Who</th>
            {BITS.map((b) => (
              <th key={b.label} scope="col">
                {b.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WHO.map((w) => (
            <tr key={w.key}>
              <th scope="row">{w.label}</th>
              {BITS.map((b) => (
                <td key={b.label}>
                  <label className="pk-check">
                    <input
                      type="checkbox"
                      aria-label={`${w.label} ${b.label}`}
                      checked={(s.mode[w.key] & b.bit) !== 0}
                      onChange={() => toggle(w.key, b.bit)}
                    />
                    {b.label}
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <fieldset className="pk-row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pk-label">Special bits</legend>
        {SPECIAL.map((sp) => (
          <label key={sp.bit} className="pk-check">
            <input type="checkbox" checked={(s.mode.special & sp.bit) !== 0} onChange={() => toggle('special', sp.bit)} />
            {sp.label}
          </label>
        ))}
      </fieldset>
      <div className="pk-row">
        <Field label="Octal" hint="3 or 4 digits, such as 755 or 4755" error={octErr}>
          {(a) => (
            <input
              {...a}
              className="pk-input mono"
              value={s.oct}
              spellCheck={false}
              onChange={(e) => {
                const r = parseOctal(e.target.value);
                set(r.ok ? { oct: e.target.value, mode: r.mode, sym: toSymbolic(r.mode) } : { oct: e.target.value });
              }}
            />
          )}
        </Field>
        <Field label="Symbolic" hint="Nine characters, such as rwxr-xr-x" error={symErr}>
          {(a) => (
            <input
              {...a}
              className="pk-input mono"
              value={s.sym}
              spellCheck={false}
              onChange={(e) => {
                const r = parseSymbolic(e.target.value);
                set(r.ok ? { sym: e.target.value, mode: r.mode, oct: toOctal(r.mode) } : { sym: e.target.value });
              }}
            />
          )}
        </Field>
        <Field label="File name (optional)">{(a) => <input {...a} className="pk-input" value={s.file} onChange={(e) => set({ file: e.target.value })} />}</Field>
      </div>
      <div className="pk-row">
        <span className="mono" aria-label="Command preview">
          {cmd}
        </span>
        <CopyButton text={cmd} label="Copy command" />
      </div>
      <div className="pk-row">
        <Button onClick={() => set({ mode: { special: 0, owner: 7, group: 5, other: 5 }, oct: '755', sym: 'rwxr-xr-x', file: 'deploy.sh' })}>Load example</Button>
        <Button onClick={() => apply(DEFAULT_MODE)}>Reset to 755</Button>
      </div>
    </div>
  );
}
