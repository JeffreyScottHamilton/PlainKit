import { useMemo } from 'react';
import { Button, Segmented } from '@/components/ui';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { spacesToTabs, tabsToSpaces, type Width } from '../logic/tabs-spaces';

const EXAMPLE = '\tfunction run() {\n\t\tif (ok) {\n\t\t\treturn\ta;\n\t\t}\n\t}';

export default function Util() {
  const [s, set] = useUtilState('tabs-spaces', { text: '', dir: 'tabs-spaces' as 'tabs-spaces' | 'spaces-tabs', width: '4' as '2' | '4' | '8', leading: true });
  const w = Number(s.width) as Width;
  const r = useMemo(() => {
    if (s.dir === 'tabs-spaces') {
      const t = tabsToSpaces(s.text, w, s.leading);
      return { output: t.output, count: t.tabs, label: 'tabs expanded' };
    }
    const t = spacesToTabs(s.text, w, s.leading);
    return { output: t.output, count: t.changedLines, label: 'lines changed' };
  }, [s.text, s.dir, w, s.leading]);
  return (
    <div className="pk-stack">
      <p className="muted">Converts tabs to spaces, or spaces to tabs, using tab stops at the width you choose.</p>
      <div className="pk-row">
        <Segmented
          label="Direction"
          value={s.dir}
          options={[
            { value: 'tabs-spaces', label: 'Tabs to spaces' },
            { value: 'spaces-tabs', label: 'Spaces to tabs' },
          ]}
          onChange={(v) => set({ dir: v })}
        />
        <Segmented
          label="Tab width"
          value={s.width}
          options={[
            { value: '2', label: '2' },
            { value: '4', label: '4' },
            { value: '8', label: '8' },
          ]}
          onChange={(v) => set({ width: v })}
        />
        <label className="pk-check">
          <input type="checkbox" checked={s.leading} onChange={(e) => set({ leading: e.target.checked })} />
          Leading indentation only
        </label>
      </div>
      <Panes>
        <TextIn label="Text" value={s.text} onChange={(v) => set({ text: v })} rows={10} />
        <TextOut label="Result" value={r.output} rows={10} />
      </Panes>
      <p className="muted" aria-live="polite">
        {r.count} {r.label}.
      </p>
      <div className="pk-row">
        <Button onClick={() => set({ text: EXAMPLE })}>Load example</Button>
        <Button onClick={() => set({ text: '' })}>Clear</Button>
      </div>
    </div>
  );
}
