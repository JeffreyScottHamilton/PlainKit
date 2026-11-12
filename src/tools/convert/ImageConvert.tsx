import { isImage } from '@/components/KindTabs';
import { useMemo, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobBadge, JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice } from '@/components/ui';
import { assetUrl, removeAsset, removeInput, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { formatBytes, outputName } from '@/lib/format';
import { encodeImage } from '@/engines/image/client';
import { useEncoderSupport, useInspected, useSniffed, type InspectState } from '@/engines/image/hooks';
import { NAME_OF } from '@/tools/compress/logic';
import type { ImageMime } from '@/engines/image/sniff';
import type { EncodeResult, OutputMime } from '@/engines/image/types';
import { CONVERT_INPUTS, CONVERT_OUTPUTS, isConvertInput, mayHaveAlpha, outputCol, targetsFor } from './matrix';
import './convert.css';

type Stored = {
  format: OutputMime;
  /** 1..100, used for JPEG and WebP. */
  quality: number;
  background: string;
  selectedId: string | null;
  jobByInput: Record<string, string>;
};
const INITIAL: Stored = { format: 'image/png', quality: 92, background: '#ffffff', selectedId: null, jobByInput: {} };

const details = new WeakMap<Blob, EncodeResult>();

function outputOf(job: Job | undefined): SessionAsset | undefined {
  return job?.state === 'complete' ? job.result?.assets[0] : undefined;
}

export function ImageConvert({ tabs }: { tabs?: ReactNode }) {
  const allInputs = useToolInputs('convert');
  const inputs = useMemo(() => allInputs.filter(isImage), [allInputs]);
  const [st, set] = useToolState<Stored>('convert', INITIAL);
  const sniffed = useSniffed(inputs);
  const support = useEncoderSupport();
  const jobs = useJobs('convert');
  const recognised = useMemo(() => inputs.filter((a) => isConvertInput(sniffed.get(a.id))), [inputs, sniffed]);
  const inspected = useInspected(recognised);
  const selected = inputs.find((a) => a.id === st.selectedId) ?? inputs[0];
  const target = outputCol(st.format);

  const jobFor = (a: SessionAsset): Job | undefined => {
    const id = st.jobByInput[a.id];
    return id ? jobs.find((j) => j.id === id) : undefined;
  };

  const issueOf = (a: SessionAsset): string | undefined => {
    const m = sniffed.get(a.id);
    if (m === undefined) return undefined;
    if (m === null) {
      return a.name.toLowerCase().endsWith('.svg')
        ? 'SVG conversion is not available yet.'
        : 'This file is not a supported image. Convert takes JPEG, PNG, WebP, GIF, BMP or AVIF.';
    }
    if (m === 'image/avif' && support && !support.avifDecodable) return 'This browser cannot decode AVIF.';
    if (!targetsFor(m).includes(st.format)) return `${NAME_OF[m]} is already ${target.label}. Choose another format.`;
    return undefined;
  };

  const runnable = inputs.filter((a) => sniffed.get(a.id) !== undefined && issueOf(a) === undefined);
  const anyAlphaInput = runnable.some((a) => {
    const m = sniffed.get(a.id);
    return !!m && mayHaveAlpha(m);
  });
  const lossy = st.format !== 'image/png';
  const backgroundShown = st.format === 'image/jpeg' && anyAlphaInput;

  const removeFromTool = (a: SessionAsset) => {
    const j = jobFor(a);
    if (j && isActive(j)) cancelJob(j.id);
    removeInput('convert', a.id);
    set({
      jobByInput: Object.fromEntries(Object.entries(st.jobByInput).filter(([k]) => k !== a.id)),
      selectedId: st.selectedId === a.id ? null : st.selectedId,
    });
  };

  const convert = () => {
    const next = { ...st.jobByInput };
    for (const a of runnable) {
      const m = sniffed.get(a.id);
      if (!m) continue;
      const prev = jobFor(a);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      const mode = lossy ? { kind: 'quality' as const, quality: st.quality / 100 } : { kind: 'quality' as const };
      const options = { mime: st.format, mode, background: st.background };
      next[a.id] = enqueue({
        toolId: 'convert',
        label: `Convert ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const res = await encodeImage(a.blob, options, ctx);
          details.set(res.blob, res);
          return { outputs: [{ name: outputName(a.name, 'converted', target.ext), mime: res.mime, blob: res.blob }], warnings: res.warnings };
        },
      });
    }
    set({ jobByInput: next, selectedId: selected?.id ?? null });
  };

  const count = runnable.length;

  return (
    <ToolPage
      tabs={tabs}
      toolId="convert"
      settings={
        <div className="pk-stack">
          <h2>Conversion</h2>
          <Field label="Output format" hint={support ? 'Only formats this browser can write are listed.' : 'Checking which formats this browser can write.'}>
            {(p) => (
              <select {...p} className="pk-select" value={st.format} onChange={(e) => set({ format: e.target.value as OutputMime })}>
                {CONVERT_OUTPUTS.filter((o) => !support || support.encodable[o.mime]).map((o) => (
                  <option key={o.mime} value={o.mime}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {lossy && (
            <Field label="Quality" hint="Higher keeps more detail and makes a larger file.">
              {(p) => (
                <div className="conv-range">
                  <input {...p} type="range" className="pk-range" min={1} max={100} value={st.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
                  <output className="mono">{st.quality}</output>
                </div>
              )}
            </Field>
          )}
          {backgroundShown && (
            <Field label="Background color" hint="Fills transparent areas, since JPEG has no transparency.">
              {(p) => <input {...p} type="color" className="conv-color" value={st.background} onChange={(e) => set({ background: e.target.value })} />}
            </Field>
          )}
          <Button variant="primary" block disabled={count === 0} onClick={convert}>
            {count > 1 ? `Convert ${count} files` : 'Convert'}
          </Button>
        </div>
      }
    >
      {inputs.length === 0 ? (
        <DropZone toolId="convert" />
      ) : (
        <>
          {selected && <Preview asset={selected} />}

          <section aria-labelledby="conv-files">
            <h2 id="conv-files">Files · {inputs.length}</h2>
            <ul className="pk-assets">
              {inputs.map((a) => {
                const m = sniffed.get(a.id);
                const issue = issueOf(a);
                return (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    exclude="convert"
                    detail={issue ?? (m ? `Detected ${NAME_OF[m]}` : 'Checking format')}
                    onRemove={removeFromTool}
                    extra={
                      <Button size="sm" variant="ghost" aria-pressed={selected?.id === a.id} onClick={() => set({ selectedId: a.id })}>
                        Preview <span className="sr-only">{a.name}</span>
                      </Button>
                    }
                  />
                );
              })}
            </ul>
            <div className="conv-notes">
              {inputs.map((a) => (
                <PreConvertNotes key={a.id} asset={a} sniffed={sniffed.get(a.id)} state={inspected.get(a.id)} target={st.format} />
              ))}
            </div>
            <DropZone toolId="convert" compact multiple />
          </section>

          <section aria-labelledby="conv-results" className="conv-results">
            <h2 id="conv-results">Results</h2>
            {inputs.map((a) => {
              const job = jobFor(a);
              if (!job) return null;
              const out = outputOf(job);
              const d = out ? details.get(out.blob) : undefined;
              return (
                <article key={a.id} className="conv-result" aria-label={a.name}>
                  <div className="pk-row" style={{ justifyContent: 'space-between' }}>
                    <h3 className="conv-name">{a.name}</h3>
                    <JobBadge job={job} />
                  </div>
                  {job.state !== 'complete' && <JobStatus job={job} />}
                  {out && (
                    <>
                      <p className="mono">
                        {formatBytes(a.size)} → {formatBytes(out.size)}
                        {d ? ` · ${d.width} × ${d.height} px` : ''}
                      </p>
                      {job.result?.warnings.length ? (
                        <ul className="conv-warnings">
                          {job.result.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                      <ul className="pk-assets">
                        <AssetRow asset={out} exclude="convert" />
                      </ul>
                    </>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}

      <section aria-labelledby="conv-matrix" className="conv-matrix">
        <h2 id="conv-matrix">Supported conversions</h2>
        <div className="conv-table-wrap">
          <table className="conv-table">
            <caption className="sr-only">Input formats and the output formats each can convert to</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                {CONVERT_OUTPUTS.map((o) => (
                  <th key={o.mime} scope="col">
                    {o.label}
                  </th>
                ))}
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {CONVERT_INPUTS.map((i) => (
                <tr key={i.mime}>
                  <th scope="row">{i.label}</th>
                  {CONVERT_OUTPUTS.map((o) => (
                    <td key={o.mime}>
                      {i.mime === o.mime ? 'Same' : targetsFor(i.mime).includes(o.mime) ? (i.needsAvifDecode && support && !support.avifDecodable ? 'Not here' : 'Yes') : 'No'}
                    </td>
                  ))}
                  <td>{i.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Audio, video, document and 3D conversions are not available yet.</p>
      </section>
    </ToolPage>
  );
}

function Preview({ asset }: { asset: SessionAsset }) {
  return (
    <figure className="pk-preview conv-preview">
      <img src={assetUrl(asset)} alt={`Preview of ${asset.name}`} />
    </figure>
  );
}

/** Warnings shown BEFORE converting, so the user can choose a background or accept the loss. */
function PreConvertNotes({ asset, sniffed, state, target }: { asset: SessionAsset; sniffed: ImageMime | null | undefined; state: InspectState | undefined; target: OutputMime }) {
  if (!sniffed) return null;
  const notes: string[] = [];
  if (sniffed !== asset.mime && asset.mime !== 'application/octet-stream') notes.push(`Named like ${asset.mime.replace('image/', '').toUpperCase()}, but the content is ${NAME_OF[sniffed]}. Using ${NAME_OF[sniffed]}.`);
  if (state?.ok) {
    if (state.info.hadAlpha && target === 'image/jpeg') notes.push('Transparent areas will be filled with the background color, because JPEG has no transparency.');
    if (sniffed === 'image/gif') notes.push('Only the first frame of a GIF is converted. Animation is not kept.');
    else if (state.info.animated) notes.push('This image is animated. Only the first frame is converted.');
  }
  return (
    <>
      {notes.map((n) => (
        <Notice key={n} kind="warn">
          {n}
        </Notice>
      ))}
      {state && !state.ok && (
        <Notice kind="error">
          <strong>{state.error.message}</strong>
          {state.error.nextAction ? <div>{state.error.nextAction}</div> : null}
        </Notice>
      )}
    </>
  );
}
