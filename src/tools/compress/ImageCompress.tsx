import { isImage } from '@/components/KindTabs';
import { useState, useMemo, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow, downloadAsset } from '@/components/AssetList';
import { JobBadge, JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeAsset, removeInput, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { formatBytes, outputName, percentChange } from '@/lib/format';
import { encodeImage } from '@/engines/image/client';
import { useEncoderSupport, useSniffed } from '@/engines/image/hooks';
import type { EncodeResult } from '@/engines/image/types';
import {
  buildOptions,
  extOf,
  formatChange,
  inputIssue,
  isCompressInput,
  NAME_OF,
  OUTPUT_CHOICES,
  OUTPUT_LABEL,
  outputFor,
  parseMaxDimension,
  targetBytesFrom,
  type CompressSettings,
  type FormatChoice,
} from './logic';
import './compress.css';

type Stored = CompressSettings & { selectedId: string | null; jobByInput: Record<string, string> };
const INITIAL: Stored = {
  mode: 'quality',
  quality: 80,
  targetValue: '500',
  targetUnit: 'KB',
  format: 'keep',
  maxDimension: '',
  background: '#ffffff',
  selectedId: null,
  jobByInput: {},
};

/** Engine details for each output, keyed by its blob (WeakMap: released with the asset). */
const details = new WeakMap<Blob, { result: EncodeResult; targetBytes: number | null }>();

export function ImageCompress({ tabs }: { tabs?: ReactNode }) {
  const allInputs = useToolInputs('compress');
  const inputs = useMemo(() => allInputs.filter(isImage), [allInputs]);
  const [st, set] = useToolState<Stored>('compress', INITIAL);
  const sniffed = useSniffed(inputs);
  const support = useEncoderSupport();
  const jobs = useJobs('compress');
  const selected = inputs.find((a) => a.id === st.selectedId) ?? inputs[0];

  const jobFor = (a: SessionAsset): Job | undefined => {
    const id = st.jobByInput[a.id];
    return id ? jobs.find((j) => j.id === id) : undefined;
  };

  const runnable = inputs.filter((a) => inputIssue(sniffed.get(a.id)) === undefined && sniffed.has(a.id));
  const targetErr = st.mode === 'target' && targetBytesFrom(st.targetValue, st.targetUnit) === null ? 'Enter a size above 0.' : undefined;
  const maxErr = parseMaxDimension(st.maxDimension) === 'invalid' ? 'Enter whole pixels, or leave empty.' : undefined;
  const settingsOk = !targetErr && !maxErr;

  const runnableMimes = runnable.map((a) => sniffed.get(a.id)).filter(isCompressInput);
  const pngOnly = runnableMimes.length > 0 && runnableMimes.every((m) => m === 'image/png');
  const qualityApplies = st.format === 'keep' ? !pngOnly : st.format !== 'image/png';
  const backgroundShown = st.format === 'image/jpeg' || (st.format === 'keep' && runnableMimes.includes('image/jpeg'));

  const removeFromTool = (a: SessionAsset) => {
    const j = jobFor(a);
    if (j && isActive(j)) cancelJob(j.id);
    removeInput('compress', a.id);
    set({
      jobByInput: Object.fromEntries(Object.entries(st.jobByInput).filter(([k]) => k !== a.id)),
      selectedId: st.selectedId === a.id ? null : st.selectedId,
    });
  };

  const compress = () => {
    const next = { ...st.jobByInput };
    for (const a of runnable) {
      const mime = sniffed.get(a.id);
      if (!isCompressInput(mime)) continue;
      const built = buildOptions(st, outputFor(st.format, mime));
      if (!built.ok) return;
      // Retry replaces the previous result for this input; the original is never touched.
      const prev = jobFor(a);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      const { options, targetBytes } = built;
      next[a.id] = enqueue({
        toolId: 'compress',
        label: `Compress ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const res = await encodeImage(a.blob, options, ctx);
          details.set(res.blob, { result: res, targetBytes });
          return { outputs: [{ name: outputName(a.name, 'compressed', extOf(res.mime)), mime: res.mime, blob: res.blob }], warnings: res.warnings };
        },
      });
    }
    set({ jobByInput: next, selectedId: selected?.id ?? null });
  };

  const formatOptions: { value: FormatChoice; label: string }[] = [
    { value: 'keep', label: 'Keep original' },
    ...OUTPUT_CHOICES.filter((m) => support?.encodable[m]).map((m) => ({ value: m, label: OUTPUT_LABEL[m] })),
  ];
  const count = runnable.length;
  const selectedOut = selected ? outputOf(jobFor(selected)) : undefined;

  return (
    <ToolPage
      tabs={tabs}
      toolId="compress"
      settings={
        <div className="pk-stack">
          <h2>Compression</h2>
          <Segmented<CompressSettings['mode']>
            label="Compression mode"
            value={st.mode}
            options={[
              { value: 'quality', label: 'Quality' },
              { value: 'target', label: 'Target size' },
            ]}
            onChange={(mode) => set({ mode })}
          />
          <p className="cmp-hint">Target size picks the quality for you. Quality and exact size are not both guaranteed.</p>

          {st.mode === 'quality' ? (
            <Field label="Quality" hint={qualityApplies ? undefined : 'PNG is lossless: quality does not apply. Reduce dimensions instead.'}>
              {(p) => (
                <div className="cmp-range">
                  <input {...p} type="range" className="pk-range" min={1} max={100} value={st.quality} disabled={!qualityApplies} onChange={(e) => set({ quality: Number(e.target.value) })} />
                  <output className="mono" htmlFor={p.id}>
                    {st.quality}
                  </output>
                </div>
              )}
            </Field>
          ) : (
            <Field label="Target size" error={targetErr} hint={pngOnly || st.format === 'image/png' ? 'PNG is lossless: target size can only reduce dimensions.' : undefined}>
              {(p) => (
                <div className="cmp-row">
                  <input {...p} className="pk-input" inputMode="decimal" value={st.targetValue} onChange={(e) => set({ targetValue: e.target.value })} />
                  <select aria-label="Target size unit" className="pk-select" value={st.targetUnit} onChange={(e) => set({ targetUnit: e.target.value as CompressSettings['targetUnit'] })}>
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>
              )}
            </Field>
          )}

          <Field label="Output format" hint={support ? 'Only formats this browser can write are listed.' : 'Checking which formats this browser can write.'}>
            {(p) => (
              <select {...p} className="pk-select" value={st.format} onChange={(e) => set({ format: e.target.value as FormatChoice })}>
                {formatOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Max dimension (px)" error={maxErr} hint="Longest side. Never enlarges.">
            {(p) => <input {...p} className="pk-input" inputMode="numeric" placeholder="Original" value={st.maxDimension} onChange={(e) => set({ maxDimension: e.target.value })} />}
          </Field>

          {backgroundShown && (
            <Field label="Background color" hint="Fills transparent areas, since JPEG has no transparency.">
              {(p) => <input {...p} type="color" className="cmp-color" value={st.background} onChange={(e) => set({ background: e.target.value })} />}
            </Field>
          )}

          <p className="cmp-hint">Re-encoding removes metadata.</p>

          <Button variant="primary" block disabled={count === 0 || !settingsOk} onClick={compress}>
            {count > 1 ? `Compress ${count} files` : 'Compress'}
          </Button>
        </div>
      }
    >
      {inputs.length === 0 ? (
        <DropZone toolId="compress" />
      ) : (
        <>
          {selected && <Compare key={selected.id} orig={selected} out={selectedOut} />}
          {selectedOut && (
            <Button variant="primary" onClick={() => downloadAsset(selectedOut)} className="cmp-download">
              Download result
            </Button>
          )}

          <section aria-labelledby="cmp-files">
            <h2 id="cmp-files">Files · {inputs.length}</h2>
            <ul className="pk-assets">
              {inputs.map((a) => {
                const issue = inputIssue(sniffed.get(a.id));
                const detected = sniffed.get(a.id);
                return (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    exclude="compress"
                    detail={issue ?? (detected ? `Detected ${NAME_OF[detected]}` : 'Checking format')}
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
            <DropZone toolId="compress" compact multiple />
          </section>

          <section aria-labelledby="cmp-results" className="cmp-results">
            <h2 id="cmp-results">Results</h2>
            {inputs.map((a) => (
              <ResultBlock key={a.id} input={a} job={jobFor(a)} />
            ))}
          </section>
        </>
      )}
    </ToolPage>
  );
}

function outputOf(job: Job | undefined): SessionAsset | undefined {
  return job?.state === 'complete' ? job.result?.assets[0] : undefined;
}

function Compare({ orig, out }: { orig: SessionAsset; out?: SessionAsset }) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="cmp">
      <div className="cmp__stage pk-checker">
        <img className="cmp__img" src={assetUrl(orig)} alt={`Original: ${orig.name}`} />
        {out && <img className="cmp__img cmp__img--over" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} src={assetUrl(out)} alt="" aria-hidden />}
        {out && <div className="cmp__line" style={{ left: `${pos}%` }} aria-hidden />}
        <span className="cmp__tag cmp__tag--l mono">Original · {formatBytes(orig.size)}</span>
        {out && <span className="cmp__tag cmp__tag--r mono">Result · {formatBytes(out.size)}</span>}
      </div>
      {out && (
        <input
          type="range"
          className="pk-range"
          min={0}
          max={100}
          value={pos}
          aria-label="Compare original and result"
          aria-valuetext={`Original ${pos}%, result ${100 - pos}%`}
          onChange={(e) => setPos(Number(e.target.value))}
        />
      )}
    </figure>
  );
}

function ResultBlock({ input, job }: { input: SessionAsset; job: Job | undefined }) {
  if (!job) return null;
  const out = outputOf(job);
  const d = out ? details.get(out.blob) : undefined;
  const pct = out ? percentChange(input.size, out.size) : 0;
  return (
    <article className="cmp-result" aria-label={input.name}>
      <div className="pk-row" style={{ justifyContent: 'space-between' }}>
        <h3 className="cmp-name">{input.name}</h3>
        <JobBadge job={job} />
      </div>
      {job.state !== 'complete' && <JobStatus job={job} />}
      {out && (
        <>
          <p className="mono">
            {formatBytes(input.size)} → {formatBytes(out.size)} · {formatChange(pct)}
            {d ? ` · ${d.result.width} × ${d.result.height} px` : ''}
          </p>
          {out.size > input.size && (
            <Notice kind="warn">
              Result is larger than the original ({formatChange(pct)}). Keep the original, or lower quality / dimensions.
            </Notice>
          )}
          {d?.result.targetMet === false && d.targetBytes !== null && (
            <Notice kind="warn">
              Could not reach {formatBytes(d.targetBytes)}. Smallest achieved: {formatBytes(out.size)}.
            </Notice>
          )}
          {job.result?.warnings.length ? (
            <ul className="cmp-warnings">
              {job.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <ul className="pk-assets">
            <AssetRow
              asset={out}
              exclude="compress"
              detail={d?.result.quality !== null && d?.result.quality !== undefined ? `quality ${Math.round(d.result.quality * 100)}` : undefined}
            />
          </ul>
        </>
      )}
    </article>
  );
}
