import { useMemo, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { JobResult } from '@/components/JobResult';
import { isPdf } from '@/components/KindTabs';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { removeAsset, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import { formatBytes, outputName } from '@/lib/format';
import { rasterizePdf, rewritePdf } from '@/engines/pdf/raster';

type State = { method: 'rewrite' | 'flatten'; dpi: number; quality: number; jobByInput: Record<string, string> };

export function PdfCompress({ tabs }: { tabs?: ReactNode }) {
  const all = useToolInputs('compress');
  const inputs = useMemo(() => all.filter(isPdf), [all]);
  const jobs = useJobs('compress');
  const [st, set] = useToolState<State>('compress:pdf', { method: 'rewrite', dpi: 150, quality: 70, jobByInput: {} });

  const run = () => {
    const next = { ...st.jobByInput };
    for (const a of inputs) {
      const prev = jobs.find((j) => j.id === next[a.id]);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      next[a.id] = enqueue({
        toolId: 'compress',
        label: `Compress ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const pdf = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });
          if (st.method === 'rewrite') {
            ctx.onProgress({ stage: 'processing' });
            const r = await rewritePdf(new Uint8Array(await a.blob.arrayBuffer()));
            return { outputs: [{ name: outputName(a.name, 'compressed', 'pdf'), mime: 'application/pdf', blob: pdf(r.bytes) }], warnings: [`Verified: ${r.pageCount} pages. Lossless: page content is unchanged and text stays selectable. Digital signatures are invalidated.`] };
          }
          const r = await rasterizePdf(a.blob, { dpi: st.dpi, quality: st.quality / 100 }, ctx);
          return { outputs: [{ name: outputName(a.name, 'flattened', 'pdf'), mime: 'application/pdf', blob: pdf(r.bytes) }], warnings: [`Verified: ${r.pageCount} pages, each now a JPEG picture at ${st.dpi} DPI. Text can no longer be selected or searched, and links and form fields are gone.`, ...r.warnings] };
        },
      });
    }
    set({ jobByInput: next });
  };

  return (
    <ToolPage
      toolId="compress"
      tabs={tabs}
      settings={
        <>
          <h2>PDF compression</h2>
          <div className="pk-field">
            <span className="pk-label">Method</span>
            <Segmented label="Method" value={st.method} options={[{ value: 'rewrite', label: 'Rewrite' }, { value: 'flatten', label: 'Flatten to images' }]} onChange={(method) => set({ method })} />
            <span className="pk-hint">
              {st.method === 'rewrite'
                ? 'Lossless. Repacks the file. Often saves only a little, and sometimes nothing.'
                : 'Lossy. Turns every page into a picture. Good for scans. Text stops being selectable.'}
            </span>
          </div>
          {st.method === 'flatten' && (
            <>
              <Field label="Resolution">
                {(a) => (
                  <select {...a} className="pk-select" value={st.dpi} onChange={(e) => set({ dpi: Number(e.target.value) })}>
                    <option value={96}>96 DPI (smallest)</option>
                    <option value={150}>150 DPI</option>
                    <option value={200}>200 DPI</option>
                  </select>
                )}
              </Field>
              <Field label={`JPEG quality: ${st.quality}`}>{(a) => <input {...a} type="range" className="pk-range" min={30} max={95} value={st.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />}</Field>
            </>
          )}
          <Button variant="primary" block disabled={inputs.length === 0} onClick={run}>
            {inputs.length > 1 ? `Compress ${inputs.length} files` : 'Compress'}
          </Button>
        </>
      }
    >
      {st.method === 'flatten' && <Notice kind="warn">Flattening cannot be undone in the output file: text, links and form fields are replaced by pictures. Your original stays in the session.</Notice>}
      {inputs.length === 0 ? (
        <DropZone toolId="compress" accept="application/pdf,.pdf" />
      ) : (
        <>
          {inputs.map((a) => (
            <article key={a.id} aria-label={a.name} className="pk-stack" style={{ gap: 8, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <div className="pk-row" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="pk-asset__name" title={a.name}>{a.name}</div>
                  <div className="mono muted">{formatBytes(a.size)}</div>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Remove ${a.name} from this tool`} onClick={() => removeInput('compress', a.id)}>
                  Remove
                </Button>
              </div>
              <JobResult job={jobs.find((j) => j.id === st.jobByInput[a.id])} source={a} exclude="compress" expectSmaller />
            </article>
          ))}
          <DropZone toolId="compress" compact accept="application/pdf,.pdf" />
        </>
      )}
    </ToolPage>
  );
}
