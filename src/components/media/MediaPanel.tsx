import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { isMedia } from '@/components/KindTabs';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeAsset, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import { formatBytes, outputName, percentChange } from '@/lib/format';
import { toToolError } from '@/lib/errors';
import { inspectMedia, probeWritable, transcodeMedia } from '@/engines/media/client';
import { CONTAINERS, WARN_BYTES, containerById, describe, type ContainerId, type MediaInfo, type QualityPreset, type Writable } from '@/engines/media/containers';
import './media.css';

type State = { container: ContainerId | ''; quality: QualityPreset; maxHeight: number; audioKbps: number; selectedId: string | null; jobByInput: Record<string, string> };
const INITIAL: State = { container: '', quality: 'medium', maxHeight: 0, audioKbps: 128, selectedId: null, jobByInput: {} };

/** Audio and video conversion (mode "convert") or re-encoding to a smaller file (mode "compress"). */
export function MediaPanel({ toolId, mode, tabs }: { toolId: 'convert' | 'compress'; mode: 'convert' | 'compress'; tabs?: ReactNode }) {
  const all = useToolInputs(toolId);
  const inputs = useMemo(() => all.filter(isMedia), [all]);
  const jobs = useJobs(toolId);
  const [st, set] = useToolState<State>(`${toolId}:media`, INITIAL);
  const [writable, setWritable] = useState<Writable[] | null>(null);
  const [info, setInfo] = useState<Record<string, MediaInfo | string>>({});
  const selected = inputs.find((a) => a.id === st.selectedId) ?? inputs[0];

  useEffect(() => {
    const ctl = new AbortController();
    probeWritable(ctl.signal).then(setWritable, () => setWritable([]));
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    for (const a of inputs) {
      if (info[a.id]) continue;
      inspectMedia(a.blob, ctl.signal).then(
        (i) => setInfo((m) => ({ ...m, [a.id]: i })),
        (e) => ctl.signal.aborted || setInfo((m) => ({ ...m, [a.id]: toToolError(e).message })),
      );
    }
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  const selInfo = selected ? info[selected.id] : undefined;
  const hasVideo = typeof selInfo === 'object' && Boolean(selInfo.video);
  const hasAudio = typeof selInfo === 'object' && Boolean(selInfo.audio);
  // Only formats that make sense for this file: no audio formats for a silent video, no video formats for audio.
  const options = useMemo(() => (writable ?? []).map((w) => containerById(w.id)).filter((c) => (c.kind === 'audio' ? hasAudio : hasVideo)), [writable, hasVideo, hasAudio]);
  const fallback = options.find((c) => (hasVideo ? c.kind === 'video' : c.kind === 'audio'))?.id ?? '';
  const container = (options.some((c) => c.id === st.container) ? st.container : fallback) as ContainerId | '';
  const target = container ? containerById(container) : undefined;
  const verb = mode === 'compress' ? 'Compress' : 'Convert';

  const run = () => {
    if (!container || !target) return;
    const next = { ...st.jobByInput };
    for (const a of inputs) {
      const prev = jobs.find((j) => j.id === next[a.id]);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      next[a.id] = enqueue({
        toolId,
        label: `${verb} ${a.name}`,
        inputIds: [a.id],
        heavy: true,
        run: async (ctx) => {
          const r = await transcodeMedia(
            a.blob,
            { container, force: mode === 'compress', quality: mode === 'compress' ? st.quality : undefined, maxHeight: mode === 'compress' ? st.maxHeight : 0, audioBitrate: mode === 'compress' ? st.audioKbps * 1000 : undefined },
            ctx,
          );
          const summary = r.verified ? `Verified (duration and tracks): ${describe(r.info)}` : `Not verified: the output is ${r.info.durationSec.toFixed(1)} s but the source is ${r.sourceSec.toFixed(1)} s.`;
          return { outputs: [{ name: outputName(a.name, mode === 'compress' ? 'compressed' : 'converted', target.ext), mime: target.mime, blob: new Blob([r.bytes], { type: target.mime }) }], warnings: [summary, ...r.warnings] };
        },
      });
    }
    set({ jobByInput: next });
  };

  const settings = (
    <>
      <h2>{mode === 'compress' ? 'Compression' : 'Conversion'}</h2>
      {writable === null ? (
        <p className="muted">Checking what this browser can write…</p>
      ) : writable.length === 0 ? (
        <Notice kind="warn">This browser cannot write audio or video files here (WebCodecs is not available). Try a current Chrome, Edge or Safari.</Notice>
      ) : (
        <>
          <Field label="Output format" hint="Only formats this browser can write are listed.">
            {(a) => (
              <select {...a} className="pk-select" value={container} onChange={(e) => set({ container: e.target.value as ContainerId })}>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.kind === 'audio' && hasVideo ? ' (audio only)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {mode === 'compress' && (
            <>
              <div className="pk-field">
                <span className="pk-label">Quality</span>
                <Segmented label="Quality" value={st.quality} options={[{ value: 'low', label: 'Smaller' }, { value: 'medium', label: 'Balanced' }, { value: 'high', label: 'Better' }]} onChange={(quality) => set({ quality })} />
                <span className="pk-hint">Sets the bitrate. The file is always re-encoded, which loses some quality.</span>
              </div>
              {hasVideo && target?.kind === 'video' && (
                <Field label="Maximum height" hint="Never enlarges.">
                  {(a) => (
                    <select {...a} className="pk-select" value={st.maxHeight} onChange={(e) => set({ maxHeight: Number(e.target.value) })}>
                      <option value={0}>Original</option>
                      <option value={1080}>1080 px</option>
                      <option value={720}>720 px</option>
                      <option value={480}>480 px</option>
                    </select>
                  )}
                </Field>
              )}
              {hasAudio && (
              <Field label="Audio bitrate">
                {(a) => (
                  <select {...a} className="pk-select" value={st.audioKbps} onChange={(e) => set({ audioKbps: Number(e.target.value) })}>
                    {[64, 96, 128, 192].map((k) => (
                      <option key={k} value={k}>
                        {k} kbps
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              )}
            </>
          )}
          {mode === 'convert' && <p className="pk-hint">Tracks are copied when the new format allows it. Otherwise they are re-encoded, which loses some quality.</p>}
          <Button variant="primary" block disabled={!container || inputs.length === 0} onClick={run}>
            {inputs.length > 1 ? `${verb} ${inputs.length} files` : verb}
          </Button>
          <p className="pk-hint">Runs on this device. The result is built in memory, so very large files can fail.</p>
        </>
      )}
    </>
  );

  return (
    <ToolPage toolId={toolId} tabs={tabs} settings={settings}>
      {inputs.length === 0 ? (
        <DropZone toolId={toolId} accept="video/*,audio/*,.mkv,.mov,.flac,.m4a,.aac,.ogg" hint="Audio and video files are processed in this browser." />
      ) : (
        <>
          {selected && (
            <div className="pk-preview media-preview">
              {selected.mime.startsWith('audio/') ? <audio controls src={assetUrl(selected)} aria-label={`Preview of ${selected.name}`} /> : <video controls src={assetUrl(selected)} aria-label={`Preview of ${selected.name}`} />}
            </div>
          )}
          <section aria-label="Files" className="media-files">
            {inputs.map((a) => {
              const i = info[a.id];
              const job = jobs.find((j) => j.id === st.jobByInput[a.id]);
              const out = job?.result?.assets[0];
              const change = out ? percentChange(a.size, out.size) : 0;
              return (
                <article key={a.id} aria-label={a.name} className="media-file">
                  <div className="pk-row" style={{ justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="pk-asset__name" title={a.name}>
                        {a.name}
                      </div>
                      <div className="mono muted">
                        {formatBytes(a.size)} · {i === undefined ? 'Inspecting…' : typeof i === 'string' ? i : describe(i)}
                      </div>
                    </div>
                    <div className="pk-row">
                      {inputs.length > 1 && (
                        <Button size="sm" variant="ghost" aria-pressed={selected?.id === a.id} onClick={() => set({ selectedId: a.id })}>
                          Preview
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" aria-label={`Remove ${a.name} from this tool`} onClick={() => removeInput(toolId, a.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  {a.size > WARN_BYTES && <Notice kind="warn">This file is over 500 MB. It may run out of memory, especially on a phone.</Notice>}
                  {job && <JobStatus job={job} />}
                  {out && job?.result && (
                    <>
                      <p className="mono">
                        {formatBytes(a.size)} → {formatBytes(out.size)} ({change === 0 ? '' : change > 0 ? '+' : '−'}
                        {Math.abs(change)}%)
                      </p>
                      {mode === 'compress' && out.size >= a.size && <Notice kind="warn">The result is not smaller than the original. Keep the original, or choose Smaller or a lower height.</Notice>}
                      <ul className="media-notes">
                        {job.result.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                      <ul className="pk-assets">
                        <AssetRow asset={out} exclude={toolId} />
                      </ul>
                    </>
                  )}
                </article>
              );
            })}
          </section>
          <DropZone toolId={toolId} compact accept="video/*,audio/*,.mkv,.mov,.flac,.m4a,.aac,.ogg" />
        </>
      )}
      {mode === 'convert' && writable && writable.length > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          Writable here: {writable.map((w) => containerById(w.id).label).join(', ')}. Not offered: {CONTAINERS.filter((c) => !writable.some((w) => w.id === c.id)).map((c) => c.label).join(', ') || 'none'}.
        </p>
      )}
    </ToolPage>
  );
}
