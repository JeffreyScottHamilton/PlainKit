import { useEffect, useMemo, useState, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { JobResult } from '@/components/JobResult';
import { isDocument, isImage, isPdf } from '@/components/KindTabs';
import { Button, Field, Notice } from '@/components/ui';
import { removeAsset, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import { ToolError } from '@/lib/errors';
import { formatBytes, outputName } from '@/lib/format';
import { imagesToPdf, renderPages, type PageSize } from '@/engines/pdf/raster';
import { docKind, TARGETS, TARGET_LABEL, unsupportedMessage, type DocTarget } from '@/engines/docs/kinds';
import type { SourceKind } from '@/engines/docs/convert';
import { convertInWorker } from '@/engines/docs/client';
import type { SessionAsset } from '@/session/types';

type State = {
  pageSize: PageSize;
  format: 'image/png' | 'image/jpeg';
  dpi: number;
  pdfJob: string | null;
  jobByInput: Record<string, string>;
  docPages: 'a4' | 'letter';
  targetByInput: Record<string, DocTarget>;
  docJobByInput: Record<string, string>;
};
const INITIAL: State = { pageSize: 'image', format: 'image/png', dpi: 150, pdfJob: null, jobByInput: {}, docPages: 'a4', targetByInput: {}, docJobByInput: {} };
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.docx,.txt,.md,.markdown,.html,.htm,.doc,.odt,.rtf,.pages';

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

/** What a file is for the worker, or null when it is not a document this tool converts. */
function sourceOf(a: SessionAsset): SourceKind | null {
  if (isPdf(a)) return 'pdf';
  const k = docKind(a.name, a.mime);
  return k && k !== 'unsupported' ? k : null;
}
const targetsOf = (k: SourceKind): readonly DocTarget[] => (k === 'pdf' ? ['txt'] : TARGETS[k]);

/** A converted HTML file, shown as the browser would show it, after DOMPurify. No scripts, frames or remote requests. */
function HtmlPreview({ asset }: { asset: SessionAsset }) {
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    asset.blob.text().then((t) => {
      if (!live) return;
      setHtml(DOMPurify.isSupported ? DOMPurify.sanitize(t, { FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'link', 'meta', 'base'], FORBID_ATTR: ['style'] }) : null);
    });
    return () => {
      live = false;
    };
  }, [asset]);
  if (html === undefined) return null;
  if (html === null) return <Notice kind="warn">The preview is unavailable in this browser. The HTML file is still ready to download.</Notice>;
  return <div role="region" aria-label={`Preview of ${asset.name}`} style={{ maxHeight: 320, overflow: 'auto', background: 'var(--input)', padding: 16, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DocConvert({ tabs }: { tabs?: ReactNode }) {
  const all = useToolInputs('convert');
  const images = useMemo(() => all.filter(isImage), [all]);
  const pdfs = useMemo(() => all.filter(isPdf), [all]);
  // Rows that convert to text or another document format: PDFs (text out) and document files.
  const textFiles = useMemo(() => all.filter((a) => isPdf(a) || isDocument(a)), [all]);
  const jobs = useJobs('convert');
  const [st, set] = useToolState<State>('convert:doc', INITIAL);
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

  const convertDoc = (a: SessionAsset, kind: SourceKind) => {
    const target = st.targetByInput[a.id] ?? targetsOf(kind)[0]!;
    replace(st.docJobByInput[a.id]);
    const id = enqueue({
      toolId: 'convert',
      label: `Convert ${a.name} to ${TARGET_LABEL[target]}`,
      inputIds: [a.id],
      heavy: true,
      run: async (ctx) => {
        const r = await convertInWorker({ kind, name: a.name, blob: a.blob, target, pageSize: st.docPages }, { signal: ctx.signal, onProgress: ctx.onProgress });
        return { outputs: [{ name: outputName(a.name, 'converted', r.ext), mime: r.blob.type, blob: r.blob }], warnings: r.warnings };
      },
    });
    set({ docJobByInput: { ...st.docJobByInput, [a.id]: id } });
  };

  const hasDocFiles = all.some((a) => isImage(a) || isPdf(a) || isDocument(a));

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
          <h2>Text documents</h2>
          <Field label="Page size for PDF output">
            {(a) => (
              <select {...a} className="pk-select" value={st.docPages} onChange={(e) => set({ docPages: e.target.value as State['docPages'] })}>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            )}
          </Field>
        </>
      }
    >
      <Notice>
        Supported: DOCX, TXT, Markdown and HTML to PDF, text, Markdown or HTML. PDF to text. Images to one PDF, and PDF pages to PNG or JPEG pictures. Legacy .doc, .odt, .rtf, Pages, Excel and PowerPoint files are not supported.
      </Notice>
      {!hasDocFiles ? (
        <DropZone toolId="convert" accept={ACCEPT} />
      ) : (
        <>
          <section aria-label="Files">
            <ul className="pk-assets">
              {[...images, ...pdfs, ...textFiles.filter((a) => !isPdf(a))].map((a) => (
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
          {textFiles.map((a) => {
            const kind = sourceOf(a);
            if (!kind) {
              return (
                <Notice key={a.id} kind="warn">
                  {a.name}: {unsupportedMessage(a.name)}
                </Notice>
              );
            }
            const options = targetsOf(kind);
            const target = st.targetByInput[a.id] ?? options[0]!;
            const job = jobs.find((j) => j.id === st.docJobByInput[a.id]);
            return (
              <section key={a.id} aria-label={`Convert ${a.name}`} className="pk-stack" style={{ gap: 8 }}>
                <div className="pk-stack" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <Field label={`Output for ${a.name}`}>
                    {(p) => (
                      <select {...p} className="pk-select" value={target} onChange={(e) => set({ targetByInput: { ...st.targetByInput, [a.id]: e.target.value as DocTarget } })}>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {TARGET_LABEL[o]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Button variant="primary" onClick={() => convertDoc(a, kind)}>
                    {kind === 'pdf' ? 'Extract text' : 'Convert'}
                  </Button>
                </div>
                <JobResult job={job} exclude="convert" />
                {job?.state === 'complete' && target === 'html' && job.result?.assets[0] && <HtmlPreview asset={job.result.assets[0]} />}
              </section>
            );
          })}
          <DropZone toolId="convert" compact accept={ACCEPT} />
        </>
      )}
    </ToolPage>
  );
}
