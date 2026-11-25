import { useEffect, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { JobStatus } from '@/components/JobStatus';
import { Button, CopyButton, Field, Notice } from '@/components/ui';
import { addGenerated, assetUrl, removeInput, sendTo, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, useJobs } from '@/jobs/queue';
import { formatBytes, outputName } from '@/lib/format';
import { FIRST_USE_BYTES, LOW_CONFIDENCE } from '@/engines/ocr/model';
import { isEngineLoaded, recognize, stopEngine, type PageText } from '@/engines/ocr/runner';
import { hasWasmSimd } from '@/engines/ocr/support';

type Stored = { grayscale: boolean; autoContrast: boolean; upscale: boolean; pages: string };
const INITIAL: Stored = { grayscale: true, autoContrast: true, upscale: true, pages: '' };

/** Per-output detail (page results), keyed by the output blob. Released with the asset. */
const details = new WeakMap<Blob, PageText[]>();

const PDF_MIME = 'application/pdf';

/** Joins page texts. A header is added only when there is more than one page. */
function joinPages(results: PageText[]): string {
  if (results.length === 1) return results[0]!.text;
  return results.map((r) => `--- Page ${r.page} ---\n${r.text}`).join('\n\n');
}

export default function Tool() {
  const inputs = useToolInputs('ocr');
  const [st, set] = useToolState<Stored>('ocr', INITIAL);
  const jobs = useJobs('ocr');
  const asset = inputs[0];
  const isPdf = asset?.mime === PDF_MIME;
  const supported = hasWasmSimd();

  // One model in memory at a time: release the engine when the tool is left.
  useEffect(() => () => void stopEngine(), []);

  const run = () => {
    if (!asset) return;
    const opts = { grayscale: st.grayscale, autoContrast: st.autoContrast, upscale: st.upscale };
    enqueue({
      toolId: 'ocr',
      label: `Read text from ${asset.name}`,
      inputIds: [asset.id],
      heavy: true,
      run: async (ctx) => {
        const { results, warnings } = await recognize(asset.blob, isPdf ? 'pdf' : 'image', st.pages, opts, ctx);
        if (results.every((r) => r.text === '')) warnings.push('No text was found. Try a sharper image, or turn off the options that change the picture.');
        const blob = new Blob([joinPages(results)], { type: 'text/plain' });
        details.set(blob, results);
        return { outputs: [{ name: outputName(asset.name, 'text', 'txt'), mime: 'text/plain', blob }], warnings };
      },
    });
  };

  const settings = (
    <div className="pk-stack">
      <h2>Clean-up</h2>
      <label className="pk-row">
        <input type="checkbox" checked={st.grayscale} onChange={(e) => set({ grayscale: e.target.checked })} /> Grayscale
      </label>
      <label className="pk-row">
        <input type="checkbox" checked={st.autoContrast} onChange={(e) => set({ autoContrast: e.target.checked })} /> Auto-contrast
      </label>
      <label className="pk-row">
        <input type="checkbox" checked={st.upscale} onChange={(e) => set({ upscale: e.target.checked })} /> Enlarge small images 2×
      </label>
      {isPdf && (
        <Field label="Pages" hint="Blank or “all” reads every page. Examples: 1-3, 5, 8-.">
          {(p) => <input {...p} className="pk-input" value={st.pages} placeholder="all" onChange={(e) => set({ pages: e.target.value })} />}
        </Field>
      )}
      {!isEngineLoaded() && (
        <Notice kind="info">
          The first run downloads the text recognition engine and English model, about {formatBytes(FIRST_USE_BYTES)} ({FIRST_USE_BYTES.toLocaleString('en-US')} bytes), from this site. Your files never leave this device.
        </Notice>
      )}
      <Button variant="primary" block disabled={!asset || !supported} onClick={run}>
        Read text
      </Button>
    </div>
  );

  return (
    <ToolPage toolId="ocr" settings={settings}>
      <DropZone toolId="ocr" multiple={false} compact hint="One image or PDF. Screenshots, photos and scans work best." />
      {!supported && <Notice kind="error">This browser cannot run the text recognition engine (WebAssembly SIMD is missing). Use a current Chrome, Edge, Firefox or Safari.</Notice>}
      {asset && (
        <section aria-labelledby="ocr-src-h" className="pk-stack">
          <h2 id="ocr-src-h">Source</h2>
          <p className="mono muted">
            {asset.name} · {asset.mime} · {formatBytes(asset.size)}
          </p>
          {!isPdf && <img src={assetUrl(asset)} alt="" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain' }} />}
          <div className="pk-row">
            <Button size="sm" variant="ghost" onClick={() => removeInput('ocr', asset.id)}>
              Remove from this tool
            </Button>
          </div>
        </section>
      )}
      <section aria-labelledby="ocr-res-h" className="pk-stack">
        <h2 id="ocr-res-h">Text</h2>
        {jobs.length === 0 && <p className="muted">Recognised text appears here. Check it before you use it: low-confidence words are listed below it.</p>}
        {jobs.map((j) => {
          if (j.state !== 'complete' || !j.result) return <JobStatus key={j.id} job={j} />;
          const out = j.result.assets[0];
          if (!out) return null;
          return <ResultView key={j.id} blob={out.blob} name={out.name} parentId={j.inputIds[0] ?? ''} warnings={j.result.warnings} />;
        })}
      </section>
    </ToolPage>
  );
}

function ResultView({ blob, name, parentId, warnings }: { blob: Blob; name: string; parentId: string; warnings: string[] }) {
  const [text, setText] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    void blob.text().then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
  }, [blob]);

  if (text === null) return <p className="muted">Loading text…</p>;
  const pages = details.get(blob) ?? [];
  const low = pages.flatMap((p) => p.summary.lowWords);
  const mean = pages.length ? pages.reduce((a, p) => a + (p.summary.meanConfidence ?? 0), 0) / pages.length : null;

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sendClean = () => {
    const out = addGenerated({ name: outputName(name, 'clean', 'txt'), mime: 'text/plain', blob: new Blob([text], { type: 'text/plain' }), parentIds: [parentId] });
    sendTo('clean-text', [out.id]);
    setSent(true);
  };

  return (
    <div className="pk-stack">
      {warnings.map((w) => (
        <Notice key={w} kind="warn">
          {w}
        </Notice>
      ))}
      <p className="muted">
        {mean === null ? 'Confidence unavailable.' : `Mean confidence ${mean.toFixed(1)}%.`}
        {low.length > 0 && ` ${low.length} word${low.length === 1 ? '' : 's'} below ${LOW_CONFIDENCE}%: ${low.slice(0, 20).join(', ')}${low.length > 20 ? ' …' : ''}`}
      </p>
      <label className="pk-stack">
        <span>Recognised text (editable)</span>
        <textarea className="pk-input" rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <div className="pk-row">
        <CopyButton text={text} label="Copy text" />
        <Button size="sm" onClick={download}>
          Download .txt
        </Button>
        <Button size="sm" onClick={sendClean} disabled={sent}>
          {sent ? 'Sent to Clean text' : 'Send to Clean text'}
        </Button>
      </div>
    </div>
  );
}
