import { useMemo } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { TextOut, useUtilState } from '../kit';
import { PW_COUNT_MAX, PW_MAX, PW_MIN, entropyBits, generatePassword, validatePassword, type PwOptions } from '../logic/password';

export default function Util() {
  // Only options and a regenerate counter are stored. Generated passwords live in memory for this render only.
  const [s, set] = useUtilState('password', { length: '16', count: '1', lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false, seed: 0, shown: true });
  const parsed: PwOptions = { length: Number(s.length), lower: s.lower, upper: s.upper, digits: s.digits, symbols: s.symbols, excludeAmbiguous: s.excludeAmbiguous };
  const count = Number(s.count);
  const optError = validatePassword(parsed);
  const countError = !Number.isInteger(count) || count < 1 || count > PW_COUNT_MAX ? `Enter a whole number from 1 to ${PW_COUNT_MAX}.` : undefined;
  const error = optError ?? countError;
  const passwords = useMemo(() => {
    if (!s.shown || error) return [];
    return Array.from({ length: count }, () => generatePassword(parsed));
  }, [s.shown, s.seed, s.length, s.count, s.lower, s.upper, s.digits, s.symbols, s.excludeAmbiguous, error]);
  return (
    <div className="pk-stack">
      <p className="muted">Generated with crypto.getRandomValues and rejection sampling (no modulo bias). Nothing is stored or sent.</p>
      <div className="pk-row">
        <Field label={`Length (${PW_MIN}-${PW_MAX})`}>
          {(a) => <input {...a} className="pk-input" type="number" min={PW_MIN} max={PW_MAX} step={1} value={s.length} onChange={(e) => set({ length: e.target.value })} />}
        </Field>
        <Field label={`Count (1-${PW_COUNT_MAX})`} error={countError}>
          {(a) => <input {...a} className="pk-input" type="number" min={1} max={PW_COUNT_MAX} step={1} value={s.count} onChange={(e) => set({ count: e.target.value })} />}
        </Field>
      </div>
      <div className="pk-row">
        <label className="pk-check"><input type="checkbox" checked={s.lower} onChange={(e) => set({ lower: e.target.checked })} /> Lowercase</label>
        <label className="pk-check"><input type="checkbox" checked={s.upper} onChange={(e) => set({ upper: e.target.checked })} /> Uppercase</label>
        <label className="pk-check"><input type="checkbox" checked={s.digits} onChange={(e) => set({ digits: e.target.checked })} /> Digits</label>
        <label className="pk-check"><input type="checkbox" checked={s.symbols} onChange={(e) => set({ symbols: e.target.checked })} /> Symbols</label>
        <label className="pk-check"><input type="checkbox" checked={s.excludeAmbiguous} onChange={(e) => set({ excludeAmbiguous: e.target.checked })} /> Exclude ambiguous (l, I, 1, O, 0, o)</label>
      </div>
      <div className="pk-row">
        <Button variant="primary" disabled={!!error} onClick={() => set((c) => ({ ...c, shown: true, seed: c.seed + 1 }))}>Generate</Button>
        <Button onClick={() => set({ length: '20', count: '1', lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false, shown: true })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ shown: false })}>Clear</Button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {passwords.length > 0 && (
        <>
          <TextOut label="Passwords" rows={Math.min(passwords.length, 8)} value={passwords.join('\n')} />
          <p aria-live="polite">Estimated entropy: {entropyBits(parsed).toFixed(1)} bits (length × log2 of pool size, assuming uniform random characters).</p>
        </>
      )}
    </div>
  );
}
