import { Button, Field, Notice, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { caesar, type CipherMode } from '../logic/caesar';

const EXAMPLE = 'Hello, World! 123';

export default function Util() {
  const [s, set] = useUtilState('caesar', { text: '', mode: 'rot13' as CipherMode, shift: '3' });
  const n = Number(s.shift);
  const shiftOk = s.shift.trim() !== '' && Number.isInteger(n) && n >= -25 && n <= 25;
  const out = caesar(s.text, s.mode, shiftOk ? n : 0);
  return (
    <div className="pk-stack">
      <Notice kind="warn">Not encryption. Do not use for secrets.</Notice>
      <div className="pk-row">
        <Segmented
          label="Cipher"
          value={s.mode}
          options={[
            { value: 'shift', label: 'Shift' },
            { value: 'rot13', label: 'ROT13' },
            { value: 'rot47', label: 'ROT47' },
          ]}
          onChange={(v) => set({ mode: v })}
        />
        {s.mode === 'shift' && (
          <Field label="Shift (-25 to 25)" error={!shiftOk ? 'Enter a whole number from -25 to 25.' : undefined}>
            {(a) => <input {...a} className="pk-input" type="number" min={-25} max={25} step={1} value={s.shift} onChange={(e) => set({ shift: e.target.value })} />}
          </Field>
        )}
      </div>
      <p className="muted">Letters shift within their case. Other characters stay as they are. ROT47 covers printable ASCII.</p>
      <Panes>
        <TextIn label="Text" value={s.text} onChange={(v) => set({ text: v })} rows={8} />
        <TextOut label="Result" value={out} rows={8} />
      </Panes>
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
    </div>
  );
}
