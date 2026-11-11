import { useMemo } from 'react';
import { Button, Notice } from '@/components/ui';
import { TextIn, TextOut, Panes, useUtilState } from '../kit';
import { sanitizeMarkdown } from '../logic/markdown';
import '../utils-a.css';

const EXAMPLE = '# Notes\n\n- Runs **locally**\n- *Sanitized* output\n\n[Plainkit](#)\n\n<script>alert("x")</script>\n';

export default function Util() {
  const [s, set] = useUtilState('markdown', { input: '' });
  // Only sanitizeMarkdown output reaches dangerouslySetInnerHTML; it throws instead of returning raw HTML.
  const r = useMemo(() => {
    if (s.input === '') return { ok: true as const, html: '' };
    try {
      return { ok: true as const, html: sanitizeMarkdown(s.input) };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, [s.input]);
  return (
    <div className="pk-stack">
      <div className="pk-row">
        <Button onClick={() => set({ input: EXAMPLE })}>Load example</Button>
        <Button variant="ghost" onClick={() => set({ input: '' })}>Clear</Button>
      </div>
      <TextIn label="Markdown" rows={8} value={s.input} onChange={(input) => set({ input })} />
      {!r.ok && <Notice kind="error">{r.message}</Notice>}
      <Notice kind="info">Scripts, event handler attributes, and javascript: links are removed. Images and embedded media are removed too, so the preview never loads remote files.</Notice>
      <Panes>
        <section className="pk-panel dev-md" aria-label="Rendered preview">
          {r.ok && r.html !== '' ? <div dangerouslySetInnerHTML={{ __html: r.html }} /> : <p className="muted">Preview appears here.</p>}
        </section>
        <TextOut label="Sanitized HTML" rows={10} value={r.ok ? r.html : ''} />
      </Panes>
    </div>
  );
}
