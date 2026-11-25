import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { toToolError } from '@/lib/errors';
import { formatBytes, outputName } from '@/lib/format';
import { computePeaks, type Peaks } from '@/engines/audio/peaks';
import { decodeSource, exportEdit, probeExportFormats, type FormatSupport, type Source } from '@/engines/audio-edit/client';
import { DEFAULT_SILENCE_DB, editClip, formatTime, parseTime, selectRange, type EditOptions } from '@/engines/audio-edit/dsp';
import { EXPORT_FORMATS, type ExportFormat } from '@/engines/audio-edit/messages';
import { Waveform } from './Waveform';
import './audio-edit.css';

type Stored = {
  selFor: string | null;
  startSec: number;
  endSec: number;
  format: ExportFormat;
  mono: boolean;
  gainDb: number;
  normalize: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  removeSilence: boolean;
  silenceDb: number;
};
const INITIAL: Stored = {
  selFor: null,
  startSec: 0,
  endSec: 0,
  format: 'wav',
  mono: false,
  gainDb: 0,
  normalize: false,
  fadeInSec: 0,
  fadeOutSec: 0,
  removeSilence: false,
  silenceDb: DEFAULT_SILENCE_DB,
};

const MIN_SELECTION = 0.05;
const PEAK_COLUMNS = 1200;
const LABEL: Record<ExportFormat, string> = { wav: 'WAV (16-bit PCM)', m4a: 'M4A (AAC)', webm: 'WebM (Opus)' };
const EXT: Record<ExportFormat, string> = { wav: 'wav', m4a: 'm4a', webm: 'webm' };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Loaded = { id: string; status: 'ok'; src: Source; peaks: Peaks } | { id: string; status: 'error'; message: string; next: string };

/** Text for a time field that the user is typing. Undefined means "show the committed value". */
function timeError(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  const v = parseTime(text);
  if (v === null) return 'Use mm:ss.s, for example 00:01.5.';
  if (v > max) return `Must be ${formatTime(max)} or less.`;
  return undefined;
}

function NumField({ label, value, min, max, step, hint, onChange }: { label: string; value: number; min: number; max: number; step: number; hint?: string; onChange: (n: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      {(p) => (
        <input
          {...p}
          type="number"
          className="pk-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange(clamp(n, min, max));
          }}
        />
      )}
    </Field>
  );
}

export default function Tool() {
  const inputs = useToolInputs('audio-edit');
  const [st, set] = useToolState<Stored>('audio-edit', INITIAL);
  const asset = inputs[0];
  const blob = asset?.blob;
  const assetId = asset?.id;
  const jobs = useJobs('audio-edit').filter((j) => assetId !== undefined && j.inputIds.includes(assetId));

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [support, setSupport] = useState<FormatSupport | null>(null);
  const [draft, setDraft] = useState<{ start?: string; end?: string }>({});
  const [playing, setPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    void probeExportFormats().then(setSupport);
  }, []);

  const stopPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const n = nodeRef.current;
    nodeRef.current = null;
    if (n) {
      n.onended = null;
      try {
        n.stop();
      } catch {
        // Already stopped.
      }
      n.disconnect();
    }
    if (playheadRef.current) playheadRef.current.hidden = true;
    setPlaying(false);
  }, []);

  // Decode once per source. The original Blob is only read, never changed.
  useEffect(() => {
    if (!blob || !assetId) {
      setLoaded(null);
      return;
    }
    let live = true;
    setLoaded(null);
    decodeSource(blob).then(
      (src) => live && setLoaded({ id: assetId, status: 'ok', src, peaks: computePeaks(src.channels, PEAK_COLUMNS) }),
      (e: unknown) => {
        if (!live) return;
        const err = toToolError(e);
        setLoaded({ id: assetId, status: 'error', message: err.message, next: err.nextAction ?? 'Try a different file.' });
      },
    );
    return () => {
      live = false;
      stopPreview();
    };
  }, [blob, assetId, stopPreview]);

  useEffect(() => () => void audioRef.current?.close(), []);

  const cur = loaded && loaded.id === assetId ? loaded : null;
  const src = cur?.status === 'ok' ? cur.src : null;
  const peaks = cur?.status === 'ok' ? cur.peaks : null;
  const duration = src?.durationSec ?? 0;

  // Select the whole clip the first time a source is decoded.
  useEffect(() => {
    if (src && assetId && st.selFor !== assetId) set({ selFor: assetId, startSec: 0, endSec: src.durationSec });
  }, [src, assetId, st.selFor, set]);

  const startSec = st.selFor === assetId ? st.startSec : 0;
  const endSec = st.selFor === assetId ? st.endSec : duration;
  const selLen = endSec - startSec;
  const selOk = !!src && selLen >= MIN_SELECTION;

  const format: ExportFormat = support && !support[st.format].available ? 'wav' : st.format;
  const formatReason = support?.[format].available === false ? support[format].reason : undefined;
  const canExport = selOk && !!support && support[format].available;

  const setStart = (s: number) => set({ startSec: clamp(s, 0, Math.max(0, endSec - MIN_SELECTION)) });
  const setEnd = (e: number) => set({ endSec: clamp(e, Math.min(duration, startSec + MIN_SELECTION), duration) });

  const startErr = timeError(draft.start, duration);
  const endErr = timeError(draft.end, duration);
  const commit = (which: 'start' | 'end') => {
    const text = draft[which];
    if (text === undefined || timeError(text, duration)) return;
    const v = parseTime(text)!;
    if (which === 'start') setStart(v);
    else setEnd(v);
    setDraft((d) => ({ ...d, [which]: undefined }));
  };

  const opts: EditOptions = {
    fadeInSec: st.fadeInSec,
    fadeOutSec: st.fadeOutSec,
    gainDb: st.gainDb,
    normalize: st.normalize,
    removeSilence: st.removeSilence,
    silenceDb: st.silenceDb,
    mono: st.mono,
  };

  const exportNow = () => {
    if (!asset || !src || !canExport) return;
    const sr = src.sampleRate;
    const from = startSec;
    const to = endSec;
    enqueue({
      toolId: 'audio-edit',
      label: `Export ${asset.name}`,
      inputIds: [asset.id],
      heavy: true,
      run: async (ctx) => {
        const sel = selectRange(src.channels, sr, from, to);
        const r = await exportEdit(sel, sr, opts, format, ctx);
        const blobOut = new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: r.mime });
        return {
          outputs: [{ name: outputName(asset.name, opts.normalize ? 'normalized' : 'trimmed', EXT[format]), mime: r.mime, blob: blobOut }],
          warnings: r.warnings,
        };
      },
    });
  };

  // Preview: runs the same edit code as export, on the main thread, for the selection only.
  const play = async () => {
    if (!src || !selOk) return;
    stopPreview();
    setPreviewError(null);
    try {
      const { channels } = editClip(selectRange(src.channels, src.sampleRate, startSec, endSec), src.sampleRate, opts);
      const ctx = audioRef.current ?? (audioRef.current = new AudioContext());
      if (ctx.state === 'suspended') await ctx.resume();
      const buf = ctx.createBuffer(channels.length, channels[0]!.length, src.sampleRate);
      channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);
      node.onended = () => {
        if (nodeRef.current === node) stopPreview();
      };
      const t0 = ctx.currentTime;
      const span = endSec - startSec;
      nodeRef.current = node;
      node.start();
      setPlaying(true);
      // Playhead spans the selection. With silence removal the preview is shorter, so the playhead is scaled to fit.
      const tick = () => {
        const frac = Math.min(1, (ctx.currentTime - t0) / buf.duration);
        const el = playheadRef.current;
        if (el && duration > 0) {
          el.hidden = false;
          el.style.left = `${((startSec + frac * span) / duration) * 100}%`;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setPreviewError(toToolError(e).message);
    }
  };

  const settings = asset ? (
    <div className="pk-stack ae-settings">
      <h2>Export</h2>
      <fieldset className="ae-fieldset">
        <legend>Format</legend>
        {EXPORT_FORMATS.map((f) => {
          const s = support?.[f];
          const off = s?.available === false;
          return (
            <div key={f} className="ae-option">
              <label className="ae-check">
                <input
                  type="radio"
                  name="ae-format"
                  value={f}
                  checked={format === f}
                  disabled={!support || off}
                  aria-describedby={off ? `ae-why-${f}` : undefined}
                  onChange={() => set({ format: f })}
                />
                {LABEL[f]}
              </label>
              {off && (
                <p id={`ae-why-${f}`} className="ae-why">
                  {s?.reason}
                </p>
              )}
            </div>
          );
        })}
        {!support && <p className="ae-why">Checking which formats this browser can write.</p>}
      </fieldset>
      <Field label="Channels">
        {() => (
          <Segmented<'stereo' | 'mono'>
            label="Channels"
            value={st.mono ? 'mono' : 'stereo'}
            options={[
              { value: 'stereo', label: 'Stereo' },
              { value: 'mono', label: 'Mono' },
            ]}
            onChange={(v) => set({ mono: v === 'mono' })}
          />
        )}
      </Field>
      <h2>Edit</h2>
      <NumField label="Fade in (seconds)" value={st.fadeInSec} min={0} max={30} step={0.1} onChange={(n) => set({ fadeInSec: n })} />
      <NumField label="Fade out (seconds)" value={st.fadeOutSec} min={0} max={30} step={0.1} onChange={(n) => set({ fadeOutSec: n })} />
      <NumField label="Volume (dB)" value={st.gainDb} min={-24} max={24} step={0.5} hint="0 keeps the level. Negative is quieter." onChange={(n) => set({ gainDb: n })} />
      <label className="ae-check">
        <input type="checkbox" checked={st.normalize} onChange={(e) => set({ normalize: e.target.checked })} />
        Normalize to -1 dBFS peak
      </label>
      <label className="ae-check">
        <input type="checkbox" checked={st.removeSilence} onChange={(e) => set({ removeSilence: e.target.checked })} />
        Remove silence at start and end
      </label>
      <NumField
        label="Silence threshold (dBFS)"
        value={st.silenceDb}
        min={-80}
        max={-20}
        step={1}
        hint="Samples quieter than this count as silence."
        onChange={(n) => set({ silenceDb: n })}
      />
      {formatReason && <Notice kind="warn">{formatReason}</Notice>}
      <Button variant="primary" block disabled={!canExport} onClick={exportNow}>
        Export {LABEL[format].split(' ')[0]}
      </Button>
      {!canExport && <p className="ae-why">{!selOk ? 'Select at least 0.05 s to export.' : 'Choose a format this browser can write.'}</p>}
    </div>
  ) : undefined;

  return (
    <ToolPage toolId="audio-edit" settings={settings}>
      {asset ? (
        <>
          <section aria-labelledby="ae-src-h" className="ae-section">
            <h2 id="ae-src-h">Clip</h2>
            <p className="mono muted" title={asset.name}>
              {asset.name} · {asset.mime || 'unknown type'} · {formatBytes(asset.size)}
            </p>
            <div className="pk-row">
              <Button size="sm" variant="ghost" onClick={() => removeInput('audio-edit', asset.id)}>
                Remove from this tool
              </Button>
            </div>
            {!cur && <p className="muted" role="status">Reading audio in this browser.</p>}
            {cur?.status === 'error' && (
              <Notice kind="error">
                {cur.message} {cur.next}
              </Notice>
            )}
          </section>

          {src && peaks && (
            <section aria-labelledby="ae-sel-h" className="ae-section">
              <h2 id="ae-sel-h">Selection</h2>
              <Waveform
                peaks={peaks}
                duration={duration}
                startSec={startSec}
                endSec={endSec}
                onStart={(s) => set({ startSec: clamp(s, 0, Math.max(0, endSec - MIN_SELECTION)) })}
                onEnd={(e) => set({ endSec: clamp(e, Math.min(duration, startSec + MIN_SELECTION), duration) })}
                playheadRef={playheadRef}
              />
              <p className="muted">
                Selected {selLen.toFixed(1)} s of {duration.toFixed(1)} s. Drag the handles, or focus one and use the arrow keys (Shift for 1 s steps).
              </p>
              <div className="ae-times">
                <Field label="Start time" error={startErr} hint={startErr ? undefined : 'mm:ss.s'}>
                  {(p) => (
                    <input
                      {...p}
                      className="pk-input"
                      inputMode="decimal"
                      value={draft.start ?? formatTime(startSec)}
                      onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                      onBlur={() => commit('start')}
                      onKeyDown={(e) => e.key === 'Enter' && commit('start')}
                    />
                  )}
                </Field>
                <Field label="End time" error={endErr} hint={endErr ? undefined : 'mm:ss.s'}>
                  {(p) => (
                    <input
                      {...p}
                      className="pk-input"
                      inputMode="decimal"
                      value={draft.end ?? formatTime(endSec)}
                      onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                      onBlur={() => commit('end')}
                      onKeyDown={(e) => e.key === 'Enter' && commit('end')}
                    />
                  )}
                </Field>
              </div>
              <div className="pk-row">
                {playing ? (
                  <Button onClick={stopPreview}>Stop preview</Button>
                ) : (
                  <Button disabled={!selOk} onClick={() => void play()}>
                    Play selection
                  </Button>
                )}
              </div>
              {previewError && <Notice kind="error">{previewError}</Notice>}
            </section>
          )}

          <section aria-labelledby="ae-res-h" className="ae-section">
            <h2 id="ae-res-h">Results</h2>
            {jobs.length === 0 && <p className="muted">Exported files appear here.</p>}
            {jobs.map((j) => {
              if (j.state !== 'complete' || !j.result) return <JobStatus key={j.id} job={j} />;
              return (
                <div key={j.id} className="ae-result">
                  {j.result.warnings.map((w) => (
                    <Notice key={w} kind="warn">
                      {w}
                    </Notice>
                  ))}
                  <ul className="pk-assets">
                    {j.result.assets.map((out) => (
                      <AssetRow key={out.id} asset={out} exclude="audio-edit" />
                    ))}
                  </ul>
                </div>
              );
            })}
            {jobs.some(isActive) && <p className="muted">Exporting. You can leave this page and come back; the job keeps running.</p>}
          </section>
        </>
      ) : (
        <DropZone toolId="audio-edit" multiple={false} hint="Audio or video file. Trim, fade and export. Processed in this browser. Nothing is uploaded." />
      )}
    </ToolPage>
  );
}
