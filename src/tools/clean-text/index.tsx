import { useMemo, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { downloadAsset } from '@/components/AssetList';
import { Button, CopyButton, Field, Notice } from '@/components/ui';
import { RULES, cleanup, codeName, countByRule, defaultEnabled, hex, markerLabel, ruleFor, scan, type Finding } from '@/engines/text/invisible';
import { addGenerated } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { outputName } from '@/lib/format';
import './clean-text.css';

type State = { text: string; enabled: string[]; source: string; sourceId: string; show: boolean };
const INITIAL: State = { text: '', enabled: [...defaultEnabled()], source: '', sourceId: '', show: false };
const TABLE_LIMIT = 500;

export default function Tool() {
  const [st, setSt] = useToolState<State>('clean-text', INITIAL);
  const enabled = useMemo(() => new Set(st.enabled), [st.enabled]);

  const findings = useMemo(() => scan(st.text), [st.text]);
  const counts = useMemo(() => countByRule(findings), [findings]);
  const result = useMemo(() => cleanup(st.text, enabled), [st.text, enabled]);
  const afterFindings = useMemo(() => scan(result.text).length, [result.text]);
  const chars = useMemo(() => Array.from(st.text).length, [st.text]);
  const byIndex = useMemo(() => new Map(findings.map((f) => [f.index, f])), [findings]);

  const toggle = (id: string, on: boolean) => setSt({ enabled: on ? [...st.enabled, id] : st.enabled.filter((x) => x !== id) });

  const download = () => {
    const asset = addGenerated({
      name: outputName(st.source || 'text', 'clean', 'txt'),
      mime: 'text/plain',
      blob: new Blob([result.text], { type: 'text/plain' }),
      parentIds: st.sourceId ? [st.sourceId] : [],
    });
    downloadAsset(asset);
  };

  return (
    <ToolPage
      toolId="clean-text"
      settings={
        <fieldset className="ct-rules">
          <legend>Cleanup rules</legend>
          {RULES.map((r) => {
            const n = counts[r.id] ?? 0;
            const id = `ct-rule-${r.id}`;
            const label = r.action === 'space' ? `Convert ${r.label.toLowerCase()} to a normal space` : `Remove ${r.label.toLowerCase()}`;
            const off = r.action === 'keep';
            return (
              <div key={r.id} className="ct-rule">
                <label className="pk-check" htmlFor={id}>
                  <input id={id} type="checkbox" checked={!off && enabled.has(r.id)} disabled={off} onChange={(e) => toggle(r.id, e.target.checked)} />
                  <span>
                    {off ? r.label : label} <span className="mono">({n} found)</span>
                  </span>
                </label>
                <p className="ct-explain">
                  {off ? 'Not offered for removal. ' : `${r.defaultOn ? 'Removed by default. ' : 'Kept by default. '}`}
                  {r.explain}
                </p>
              </div>
            );
          })}
        </fieldset>
      }
    >
      <section className="ct-section" aria-labelledby="ct-in-h">
        <h2 id="ct-in-h">Text</h2>
        <p className="ct-statement">This cannot prove text was written by AI and does not remove every kind of watermark.</p>
        <DropZone
          toolId="clean-text"
          multiple={false}
          hint="Reads one text file in this browser. The file stays unchanged."
          onAdded={(assets) => {
            const a = assets[0];
            if (!a) return;
            void a.blob.text().then((t) => setSt({ text: t, source: a.name, sourceId: a.id }));
          }}
        />
        <Field label="Text to check">
          {(a) => <textarea {...a} className="pk-textarea" rows={7} spellCheck={false} value={st.text} onChange={(e) => setSt({ text: e.target.value, source: '', sourceId: '' })} />}
        </Field>
        <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="mono">
            Before: {chars} characters, {findings.length} invisible
          </span>
          <span className="mono">
            After: {Array.from(result.text).length} characters, {afterFindings} invisible
          </span>
          <Button size="sm" aria-pressed={st.show} onClick={() => setSt({ show: !st.show })}>
            {st.show ? 'Hide invisibles' : 'Show invisibles'}
          </Button>
        </div>
      </section>

      {st.show && (
        <section className="ct-section" aria-labelledby="ct-show-h">
          <h2 id="ct-show-h">Invisibles marked in the text</h2>
          <div className="ct-view">
            {renderMarked(st.text, byIndex)}
          </div>
        </section>
      )}

      <section className="ct-section" aria-labelledby="ct-find-h">
        <h2 id="ct-find-h">Findings</h2>
        {findings.length === 0 ? (
          <Notice kind="success">No invisible or unusual characters found.</Notice>
        ) : (
          <>
            <p className="ct-explain">Index counts code points from 0. Line and column start at 1.</p>
            <div className="ct-table-wrap">
              <table className="ct-table">
                <thead>
                  <tr>
                    <th scope="col">Position</th>
                    <th scope="col">Character</th>
                    <th scope="col">Name</th>
                    <th scope="col">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.slice(0, TABLE_LIMIT).map((f) => (
                    <FindingRow key={f.index} f={f} />
                  ))}
                </tbody>
              </table>
            </div>
            {findings.length > TABLE_LIMIT && <p className="ct-explain">Showing the first {TABLE_LIMIT} of {findings.length}.</p>}
          </>
        )}
      </section>

      <section className="ct-section" aria-labelledby="ct-out-h">
        <h2 id="ct-out-h">Cleaned text</h2>
        <Field label="Output">{(a) => <textarea {...a} className="pk-textarea" rows={7} readOnly spellCheck={false} value={result.text} />}</Field>
        <div className="pk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <CopyButton text={result.text} label="Copy" />
          <Button size="sm" disabled={result.text === ''} onClick={download}>
            Download .txt
          </Button>
          <span className="mono muted">
            {result.removed} removed · {result.converted} converted
          </span>
        </div>
      </section>
    </ToolPage>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const rule = ruleFor(f.cp);
  const what = !rule
    ? ''
    : rule.action === 'keep'
      ? 'Not offered for removal'
      : rule.defaultOn
        ? 'Removed by default'
        : 'Kept by default';
  return (
    <tr>
      <td className="mono">
        {f.index} · {f.line}:{f.column}
      </td>
      <td>
        <span className="ct-mark">⟦{markerLabel(f.cp)}⟧</span> <span className="mono">{hex(f.cp)}</span>
      </td>
      <td>{codeName(f.cp)}</td>
      <td>{what}</td>
    </tr>
  );
}

/** Text with each flagged character shown as a visible marker. Built from React text nodes only, never innerHTML. */
function renderMarked(text: string, byIndex: Map<number, Finding>) {
  const out: ReactNode[] = [];
  let plain = '';
  let i = 0;
  for (const ch of text) {
    const f = byIndex.get(i);
    if (f) {
      if (plain) out.push(plain);
      plain = '';
      out.push(
        <span key={`m${i}`} className="ct-mark" title={`${f.name} ${f.hex}`}>
          ⟦{markerLabel(f.cp)}⟧
        </span>,
      );
    } else {
      plain += ch;
    }
    i++;
  }
  if (plain) out.push(plain);
  return out;
}
