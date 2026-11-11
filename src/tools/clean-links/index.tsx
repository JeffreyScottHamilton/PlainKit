import { useMemo } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { CopyButton, Field, Notice } from '@/components/ui';
import { cleanText, type CleanOptions, type LinkResult } from '@/engines/links/clean';
import { useToolState } from '@/session/toolState';
import './clean-links.css';

type State = {
  text: string;
  /** Lines (1-based) where the user chose "Clean anyway" on a signed link. */
  cleanAnyway: number[];
  /** Per line: segment indexes the user restored. */
  restored: Record<string, number[]>;
};

type Valid = Extract<LinkResult, { ok: true }>;
const INITIAL: State = { text: '', cleanAnyway: [], restored: {} };

export default function Tool() {
  const [st, setSt] = useToolState<State>('clean-links', INITIAL);

  const results = useMemo(() => {
    const opts: Record<number, CleanOptions> = {};
    for (const line of st.cleanAnyway) opts[line] = { ...opts[line], cleanAnyway: true };
    for (const [line, idx] of Object.entries(st.restored)) opts[Number(line)] = { ...opts[Number(line)], restored: new Set(idx) };
    return cleanText(st.text, opts);
  }, [st.text, st.cleanAnyway, st.restored]);

  const valid = results.filter((r): r is Valid => r.ok);
  const invalid = results.length - valid.length;
  const changed = valid.filter((r) => r.applied).length;

  /** Editing the input resets per-line choices, because line numbers move. */
  const setText = (text: string) => setSt({ text, cleanAnyway: [], restored: {} });
  const setCleanAnyway = (line: number, on: boolean) =>
    setSt({
      cleanAnyway: on ? [...st.cleanAnyway, line] : st.cleanAnyway.filter((l) => l !== line),
      restored: { ...st.restored, [line]: [] },
    });
  const setRestore = (line: number, index: number, on: boolean) => {
    const cur = st.restored[String(line)] ?? [];
    setSt({ restored: { ...st.restored, [String(line)]: on ? [...cur, index] : cur.filter((i) => i !== index) } });
  };

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
            : `${valid.length} ${valid.length === 1 ? 'link' : 'links'} · ${changed} with parameters removed${invalid ? ` · ${invalid} invalid` : ''}`}
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
          {results.map((r) =>
            r.ok ? (
              <ValidItem
                key={r.line}
                r={r}
                cleanAnyway={st.cleanAnyway.includes(r.line)}
                restored={st.restored[String(r.line)] ?? []}
                onCleanAnyway={(on) => setCleanAnyway(r.line, on)}
                onRestore={(index, on) => setRestore(r.line, index, on)}
              />
            ) : (
              <li key={r.line} className="cl-item cl-item--invalid">
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
  cleanAnyway: boolean;
  restored: number[];
  onCleanAnyway: (on: boolean) => void;
  onRestore: (index: number, on: boolean) => void;
};

function ValidItem({ r, cleanAnyway, restored, onCleanAnyway, onRestore }: ItemProps) {
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
      <h3 className="cl-line">Line {r.line}</h3>
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
