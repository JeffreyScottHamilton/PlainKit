import { useMemo, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { JobResult } from '@/components/JobResult';
import { isImage, isPdf } from '@/components/KindTabs';
import { Button, Field, Notice } from '@/components/ui';
import { removeAsset, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import { ToolError } from '@/lib/errors';
import { formatBytes, outputName } from '@/lib/format';
import { imagesToPdf, renderPages, type PageSize } from '@/engines/pdf/raster';
import type { SessionAsset } from '@/session/types';

type State = { pageSize: PageSize; format: 'image/png' | 'image/jpeg'; dpi: number; pdfJob: string | null; jobByInput: Record<string, string> };
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf';

/** JPEG and PNG go in untouched; anything else the browser can decode is re-encoded to PNG first. */
async function embeddable(a: SessionAsset): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' }> {
  if (a.mime === 'image/jpeg' || a.mime === 'image/png') return { bytes: new Uint8Array(await a.blob.arrayBuffer()), mime: a.mime };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(a.blob, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('decode', `${a.name} could not be read as an image.`, 'Use JPEG, PNG or WebP.');
  }
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')?.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new ToolError('encode', `${a.name} could not be prepared for the PDF.`, 'Convert it to PNG first.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png' };
}

export function DocConvert({ tabs }: { tabs?: ReactNode }) {
  const all = useToolInputs('convert');
  const images = useMemo(() => all.filter(isImage), [all]);
  const pdfs = useMemo(() => all.filter(isPdf), [all]);
  const jobs = useJobs('convert');
  const [st, set] = useToolState<State>('convert:doc', { pageSize: 'image', format: 'image/png', dpi: 150, pdfJob: null, jobByInput: {} });
  const replace = (id: string | null | undefined) => {
    const prev = jobs.find((j) => j.id === id);
    if (prev && isActive(prev)) cancelJob(prev.id);
    prev?.result?.assets.forEach((x) => removeAsset(x.id));
  };

  const makePdf = () => {
    replace(st.pdfJob);
    const list = images;
    const pdfJob = enqueue({
      toolId: 'convert',
      label: `Make a PDF from ${list.length} image${list.length === 1 ? '' : 's'}`,
      inputIds: list.map((a) => a.id),
      heavy: true,
      run: async (ctx) => {
        const parts = [];
        for (const [i, a] of list.entries()) {
          if (ctx.signal.aborted) throw new DOMException('Canceled', 'AbortError');
          ctx.onProgress({ stage: 'processing', fraction: i / list.length, message: a.name });
          parts.push(await embeddable(a));
        }
        ctx.onProgress({ stage: 'exporting' });
        const bytes = await imagesToPdf(parts, st.pageSize, 36);
        return { outputs: [{ name: outputName(list[0]!.name, 'images', 'pdf'), mime: 'application/pdf', blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }], warnings: [`Verified: ${list.length} page${list.length === 1 ? '' : 's'}, in the order listed. JPEG and PNG images are embedded without re-encoding.`] };
      },
    });
    set({ pdfJob });
  };

  const toImages = () => {
    const next = { ...st.jobByInput };
    const ext = st.format === 'image/png' ? 'png' : 'jpg';
    for (const a of pdfs) {
      replace(next[a.id]);
      next[a.id] = enqueue({
        toolId: 'convert',
        label: `Convert ${a.name} to images`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const outputs: { name: string; mime: string; blob: Blob }[] = [];
          const r = await renderPages(a.blob, { dpi: st.dpi, format: st.format, quality: 0.9 }, ctx, (p, i) => {
            outputs.push({ name: outputName(a.name, `page-${String(i + 1).padStart(3, '0')}`, ext), mime: st.format, blob: p.blob });
          });
          return { outputs, warnings: [`${r.pageCount} page${r.pageCount === 1 ? '' : 's'} rendered at ${st.dpi} DPI. These are pictures of the pages: text is not selectable.`, ...r.warnings] };
        },
      });
    }
    set({ jobByInput: next });
  };

  return (
    <ToolPage
      toolId="convert"
      tabs={tabs}
      settings={
        <>
          <h2>Images to PDF</h2>
          <Field label="Page size" hint="A4 and Letter never enlarge the image.">
            {(a) => (
              <select {...a} className="pk-select" value={st.pageSize} onChange={(e) => set({ pageSize: e.target.value as PageSize })}>
                <option value="image">Same as each image</option>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            )}
          </Field>
          <Button variant="primary" block disabled={images.length === 0} onClick={makePdf}>
            Make PDF{images.length > 1 ? ` from ${images.length} images` : ''}
          </Button>
          <h2>PDF to images</h2>
          <Field label="Image format">
            {(a) => (
              <select {...a} className="pk-select" value={st.format} onChange={(e) => set({ format: e.target.value as State['format'] })}>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
              </select>
            )}
          </Field>
          <Field label="Resolution">
            {(a) => (
              <select {...a} className="pk-select" value={st.dpi} onChange={(e) => set({ dpi: Number(e.target.value) })}>
                <option value={72}>72 DPI (screen)</option>
                <option value={150}>150 DPI</option>
                <option value={300}>300 DPI (print)</option>
              </select>
            )}
          </Field>
          <Button block disabled={pdfs.length === 0} onClick={toImages}>
            Convert PDF to images
          </Button>
        </>
      }
    >
      <Notice>Supported: images to one PDF, and PDF pages to PNG or JPEG pictures. Word, Excel, PowerPoint, EPUB and text extraction are not supported.</Notice>
      {all.filter((a) => isImage(a) || isPdf(a)).length === 0 ? (
        <DropZone toolId="convert" accept={ACCEPT} />
      ) : (
        <>
          <section aria-label="Files">
            <ul className="pk-assets">
              {[...images, ...pdfs].map((a) => (
                <li key={a.id} className="pk-asset">
                  <div className="pk-asset__meta">
                    <div className="pk-asset__name" title={a.name}>{a.name}</div>
                    <div className="mono muted">{a.mime} · {formatBytes(a.size)}</div>
                  </div>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${a.name} from this tool`} onClick={() => removeInput('convert', a.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <JobResult job={jobs.find((j) => j.id === st.pdfJob)} exclude="convert" />
          {pdfs.map((a) => (
            <JobResult key={a.id} job={jobs.find((j) => j.id === st.jobByInput[a.id])} exclude="convert" />
          ))}
          <DropZone toolId="convert" compact accept={ACCEPT} />
        </>
      )}
    </ToolPage>
  );
}
