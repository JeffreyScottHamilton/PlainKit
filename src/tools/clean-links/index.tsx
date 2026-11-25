import { useMemo } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { CopyButton, Field, Notice } from '@/components/ui';
import { cleanText, type CleanOptions, type LinkResult } from '@/engines/links/clean';
import { useToolState } from '@/session/toolState';
import './clean-links.css';

type State = {
  text: string;
  /** Result indexes where the user chose "Clean anyway" on a signed link. */
  cleanAnyway: number[];
  /** Per result index: segment indexes the user restored. */
  restored: Record<string, number[]>;
};

type Valid = Extract<LinkResult, { ok: true }>;
const INITIAL: State = { text: '', cleanAnyway: [], restored: {} };

export default function Tool() {
  const [st, setSt] = useToolState<State>('clean-links', INITIAL);

  const results = useMemo(() => {
    const opts: Record<number, CleanOptions> = {};
    for (const i of st.cleanAnyway) opts[i] = { ...opts[i], cleanAnyway: true };
    for (const [i, idx] of Object.entries(st.restored)) opts[Number(i)] = { ...opts[Number(i)], restored: new Set(idx) };
    return cleanText(st.text, opts);
  }, [st.text, st.cleanAnyway, st.restored]);

  const valid = results.filter((r): r is Valid => r.ok);
  const unwrapped = valid.filter((r) => r.unwrappedFrom !== null).length;
  const invalid = results.length - valid.length;
  const changed = valid.filter((r) => r.applied).length;

  /** Editing the input resets per-link choices, because link positions move. */
  const setText = (text: string) => setSt({ text, cleanAnyway: [], restored: {} });
  const setCleanAnyway = (item: number, on: boolean) =>
    setSt({
      cleanAnyway: on ? [...st.cleanAnyway, item] : st.cleanAnyway.filter((i) => i !== item),
      restored: { ...st.restored, [item]: [] },
    });
  const setRestore = (item: number, index: number, on: boolean) => {
    const cur = st.restored[String(item)] ?? [];
    setSt({ restored: { ...st.restored, [String(item)]: on ? [...cur, index] : cur.filter((i) => i !== index) } });
  };

  // Lines with several links get "link 1", "link 2" labels so each one is easy to tell apart.
  const linkNumber = useMemo(() => {
    const perLine = new Map<number, number>();
    for (const r of results) perLine.set(r.line, (perLine.get(r.line) ?? 0) + 1);
    const seen = new Map<number, number>();
    return results.map((r) => {
      const n = (seen.get(r.line) ?? 0) + 1;
      seen.set(r.line, n);
      return (perLine.get(r.line) ?? 0) > 1 ? n : undefined;
    });
  }, [results]);

  return (
    <ToolPage toolId="clean-links">
      <section className="cl-input" aria-labelledby="cl-in-h">
        <h2 id="cl-in-h">Links</h2>
        <Field label="URLs, one per line" hint="Links are only parsed as text. Nothing is fetched or opened.">
          {(a) => (
            <textarea
              {...a}
              className="pk-textarea"
              rows={6}
              spellCheck={false}
              value={st.text}
              placeholder="https://example.com/post?utm_source=newsletter&id=7#comments"
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <p className="cl-summary">
          {results.length === 0
            ? 'Paste one or more links.'
            : `${valid.length} ${valid.length === 1 ? 'link' : 'links'} · ${changed} with parameters removed${unwrapped ? ` · ${unwrapped} unwrapped from redirects` : ''}${invalid ? ` · ${invalid} invalid` : ''}`}
        </p>
        {valid.length > 1 && (
          <div>
            <CopyButton text={valid.map((r) => r.cleaned).join('\n')} label="Copy all cleaned" />
          </div>
        )}
      </section>

      <section className="cl-results" aria-labelledby="cl-out-h">
        <h2 id="cl-out-h">Results</h2>
        {results.length === 0 && <p className="cl-note">Results appear here as you paste.</p>}
        <ol className="cl-list">
          {results.map((r, i) =>
            r.ok ? (
              <ValidItem
                key={i}
                r={r}
                label={linkNumber[i]}
                cleanAnyway={st.cleanAnyway.includes(i)}
                restored={st.restored[String(i)] ?? []}
                onCleanAnyway={(on) => setCleanAnyway(i, on)}
                onRestore={(index, on) => setRestore(i, index, on)}
              />
            ) : (
              <li key={i} className="cl-item cl-item--invalid">
                <h3 className="cl-line">Line {r.line}</h3>
                <Notice kind="error">
                  {r.message} <code className="cl-url">{r.input}</code>
                </Notice>
              </li>
            ),
          )}
        </ol>
      </section>
    </ToolPage>
  );
}

type ItemProps = {
  r: Valid;
  /** 1-based number of this link on its line, when the line has several. */
  label?: number;
  cleanAnyway: boolean;
  restored: number[];
  onCleanAnyway: (on: boolean) => void;
  onRestore: (index: number, on: boolean) => void;
};

function ValidItem({ r, label, cleanAnyway, restored, onCleanAnyway, onRestore }: ItemProps) {
  // Signed links: nothing is removed unless the user explicitly chose "Clean anyway".
  const removing = !r.signed || cleanAnyway;
  const cleanAnywayBox = (
    <label className="pk-check">
      <input type="checkbox" checked={cleanAnyway} onChange={(e) => onCleanAnyway(e.target.checked)} />
      Clean anyway
    </label>
  );

  return (
    <li className="cl-item">
      <h3 className="cl-line">
        Line {r.line}
        {label !== undefined ? `, link ${label}` : ''}
      </h3>
      {r.unwrappedFrom && <Notice>Taken from the redirect on {r.unwrappedFrom}. The real destination is cleaned here.</Notice>}
      {!r.httpLike && <Notice>Not an http or https address. Shown as text only.</Notice>}
      <div className="cl-pair">
        <span className="cl-label">Original</span>
        <code className="cl-url">{r.input}</code>
      </div>
      <div className="cl-pair">
        <span className="cl-label">Cleaned</span>
        <code className="cl-url">{r.cleaned}</code>
      </div>

      {r.candidates.length === 0 && <p className="cl-note">Nothing to remove.</p>}

      {r.candidates.length > 0 && r.signed && !cleanAnyway && (
        <Notice kind="warn">
          This looks like a signed link. Changing it can break it. Nothing was removed.
          <div className="cl-anyway">{cleanAnywayBox}</div>
        </Notice>
      )}

      {r.candidates.length > 0 && (
        <ul className="cl-removed" aria-label={`Parameters for line ${r.line}`}>
          {r.candidates.map((c) => (
            <li key={c.index} className="cl-param">
              {removing ? (
                <label className="pk-check">
                  <input type="checkbox" checked={restored.includes(c.index)} onChange={(e) => onRestore(c.index, e.target.checked)} />
                  Restore <code>{c.key}</code>
                </label>
              ) : (
                <span>
                  Would remove <code>{c.key}</code>
                </span>
              )}
              <span className="cl-reason">{c.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {r.candidates.length > 0 && removing && !r.applied && <p className="cl-note">All removable parameters were restored.</p>}
      {r.signed && cleanAnyway && <div className="cl-anyway">{cleanAnywayBox}</div>}

      <div>
        <CopyButton text={r.cleaned} label="Copy cleaned" />
      </div>
    </li>
  );
}
