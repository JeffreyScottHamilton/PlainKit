import { useMemo } from 'react';
import { Button, CopyButton, Field, Notice, Segmented } from '@/components/ui';
import { useUtilState } from '../kit';
import { generatePassphrase } from '../logic/passphrase';

// Generated values are not stored: the phrase lives only in this component's memory and is cleared on unmount.
export default function Util() {
  const [s, set] = useUtilState('passphrase', { words: 4, separator: '-', capitalize: false, addNumber: false, seed: 0 });
  const result = useMemo(
    () => generatePassphrase({ words: s.words, separator: s.separator, capitalize: s.capitalize, addNumber: s.addNumber }),
    // seed changes only when the user asks for a new phrase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.words, s.separator, s.capitalize, s.addNumber, s.seed],
  );
  return (
    <div className="pk-stack">
      <p className="muted">Random words from a built-in list, drawn with the browser's secure random source. Nothing is saved.</p>
      <Field label={`Words: ${s.words}`}>
        {(a) => <input {...a} className="pk-range" type="range" min={3} max={12} value={s.words} onChange={(e) => set({ words: Number(e.target.value) })} />}
      </Field>
      <div className="pk-row">
        <Segmented
          label="Separator"
          value={s.separator}
          options={[
            { value: '-', label: 'Hyphen' },
            { value: ' ', label: 'Space' },
            { value: '.', label: 'Dot' },
            { value: '_', label: 'Underscore' },
          ]}
          onChange={(v) => set({ separator: v })}
        />
        <label className="pk-check">
          <input type="checkbox" checked={s.capitalize} onChange={(e) => set({ capitalize: e.target.checked })} />
          Capitalize words
        </label>
        <label className="pk-check">
          <input type="checkbox" checked={s.addNumber} onChange={(e) => set({ addNumber: e.target.checked })} />
          Add a two-digit number
        </label>
      </div>
      <div className="pk-row">
        <output className="mono" aria-live="polite" style={{ wordBreak: 'break-word' }}>
          {result.phrase}
        </output>
        <CopyButton text={result.phrase} label="Copy" />
        <Button onClick={() => set({ seed: s.seed + 1 })}>New passphrase</Button>
      </div>
      <Notice kind="info">
        About {result.entropyBits.toFixed(1)} bits of entropy: {s.words} words from a list of {result.listSize} words
        {s.addNumber ? `, plus a two-digit number (${Math.log2(100).toFixed(1)} bits)` : ''}. Entropy assumes the words were drawn uniformly at random.
      </Notice>
      <Button onClick={() => set({ seed: s.seed + 1, words: 4, separator: '-', capitalize: false, addNumber: false })}>Load example</Button>
    </div>
  );
}
