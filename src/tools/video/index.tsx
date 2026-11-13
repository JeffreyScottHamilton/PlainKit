import { useEffect, useRef, useState } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { assetUrl, removeInput, setInputs, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import type { EngineResult } from '@/jobs/types';
import { ToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { formatTimecode, resolveTrim } from '@/engines/video/timecode';
import { inspectVideo, outputOptions, type Inspection, type OutputId, type OutputOption } from '@/engines/video/inspect';
import { runTrim, SIZE_WARN_BYTES, SIZE_WARN_TEXT, trimDetails } from '@/engines/video/trim';
import { saveHls, hlsDetails } from '@/engines/video/hls-save';
import { checkLink, downloadMedia, validateLink, type LinkCheck } from '@/engines/video/link';
import './video.css';

type Stored = { trimFor: string | null; startText: string; endText: string; format: OutputId; linkText: string; variant: number };
const INITIAL: Stored = { trimFor: null, startText: '', endText: '', format: 'mp4', linkText: '', variant: 0 };

const errText = (e: unknown) => (e instanceof ToolError ? { message: e.message, next: e.nextAction } : { message: e instanceof Error ? e.message : 'Something went wrong.', next: 'Try again.' });

export default function Tool() {
  const inputs = useToolInputs('video');
  const [st, set] = useToolState<Stored>('video', INITIAL);
  const source = inputs[0];
  const insp = useInspection(source);
  const outputs = useOutputs(insp?.ok ? insp.info : null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const duration = insp?.ok ? insp.info.durationSec : 0;

  // Start with the whole clip when a new source is inspected.
  useEffect(() => {
    if (source && insp?.ok && st.trimFor !== source.id) set({ trimFor: source.id, startText: formatTimecode(0), endText: formatTimecode(insp.info.durationSec) });
  }, [source, insp, st.trimFor, set]);

  const trim = insp?.ok && duration > 0 ? resolveTrim(st.startText, st.endText, duration) : null;
  const chosen = outputs?.find((o) => o.id === st.format && o.available) ?? outputs?.find((o) => o.available) ?? null;
  const canExport = !!source && !!trim?.ok && !!chosen;

  const exportTrim = () => {
    if (!source || !trim?.ok || !chosen) return;
    const { start, end } = trim;
    enqueue({
      toolId: 'video',
      label: `Trim ${source.name}`,
      inputIds: [source.id],
      heavy: true,
      run: (ctx) => runTrim(source.blob, source.name, { startSec: start, endSec: end, output: chosen }, ctx),
    });
  };

  const settings = source && insp?.ok ? (
    <div className="pk-stack">
      <h2>Output</h2>
      {outputs && (
        <>
          {outputs.filter((o) => !o.available).map((o) => (
            <Notice key={o.id} kind="warn">
              This browser cannot write {o.label}.
            </Notice>
          ))}
          {outputs.some((o) => o.available) ? (
            <Field label="Format" hint="Copies without re-encoding when possible; otherwise re-encodes.">
              {() => (
                <Segmented<OutputId>
                  label="Output format"
                  value={chosen?.id ?? 'mp4'}
                  options={outputs.filter((o) => o.available).map((o) => ({ value: o.id, label: o.label }))}
                  onChange={(v) => set({ format: v })}
                />
              )}
            </Field>
          ) : (
            <Notice kind="error">This browser cannot write MP4 or WebM, so trimming is not available here.</Notice>
          )}
        </>
      )}
      <Button variant="primary" block disabled={!canExport} onClick={exportTrim}>
        Trim and save
      </Button>
    </div>
  ) : undefined;

  return (
    <ToolPage toolId="video" settings={settings}>
      {!source && <DropZone toolId="video" multiple={false} hint="Video file. Trimmed in this browser. Nothing is uploaded." />}

      {source && (
        <section aria-labelledby="vd-src-h" className="vd-section">
          <h2 id="vd-src-h">Trim a local video</h2>
          <p className="mono muted">{source.name} · {formatBytes(source.size)}</p>
          <video ref={videoRef} controls preload="metadata" src={assetUrl(source)} className="vd-video" aria-label={`Preview of ${source.name}`}>
            Your browser cannot play this file. Trimming can still be tried.
          </video>
          {source.size > SIZE_WARN_BYTES && <Notice kind="warn">{SIZE_WARN_TEXT}</Notice>}
          {!insp && <p className="muted">Inspecting the file…</p>}
          {insp && !insp.ok && (
            <Notice kind="error">
              <strong>This file cannot be trimmed here.</strong>
              <div>{insp.reason}</div>
              <div>Try MP4 or WebM, or a different file.</div>
            </Notice>
          )}
          {insp?.ok && (
            <>
              <dl className="vd-facts" aria-label="File details">
                <dt>Container</dt>
                <dd>{insp.info.container} ({insp.info.mimeType})</dd>
                <dt>Duration</dt>
                <dd>{duration.toFixed(2)} s</dd>
                <dt>Video</dt>
                <dd>
                  {insp.info.videoCodec ?? 'unknown codec'} · {insp.info.width}×{insp.info.height}
                  {insp.info.frameRate ? ` · ${insp.info.frameRate} fps` : ''}
                </dd>
                <dt>Audio</dt>
                <dd>{insp.info.audio ? `${insp.info.audio.codec ?? 'unknown'} · ${insp.info.audio.channels} ch · ${insp.info.audio.sampleRate} Hz` : 'none'}</dd>
              </dl>
              <div className="vd-times">
                <Field label="Start (mm:ss.mmm)" error={trim && !trim.ok && trim.field === 'start' ? trim.error : undefined}>
                  {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.startText} onChange={(e) => set({ startText: e.target.value })} />}
                </Field>
                <Field label="End (mm:ss.mmm)" error={trim && !trim.ok && trim.field === 'end' ? trim.error : undefined}>
                  {(p) => <input {...p} className="pk-input" inputMode="decimal" value={st.endText} onChange={(e) => set({ endText: e.target.value })} />}
                </Field>
              </div>
              <div className="vd-row">
                <Button size="sm" onClick={() => set({ startText: formatTimecode(videoRef.current?.currentTime ?? 0) })}>Set start from playhead</Button>
                <Button size="sm" onClick={() => set({ endText: formatTimecode(videoRef.current?.currentTime ?? duration) })}>Set end from playhead</Button>
              </div>
              <div className="vd-times">
                <Field label="Start position" hint="Slider alternative to the start field.">
                  {(p) => (
                    <input
                      {...p}
                      type="range"
                      className="vd-range"
                      min={0}
                      max={duration}
                      step={0.001}
                      value={trim?.ok ? trim.start : 0}
                      aria-valuetext={formatTimecode(trim?.ok ? trim.start : 0)}
                      onChange={(e) => set({ startText: formatTimecode(Number(e.target.value)) })}
                    />
                  )}
                </Field>
                <Field label="End position" hint="Slider alternative to the end field.">
                  {(p) => (
                    <input
                      {...p}
                      type="range"
                      className="vd-range"
                      min={0}
                      max={duration}
                      step={0.001}
                      value={trim?.ok ? trim.end : duration}
                      aria-valuetext={formatTimecode(trim?.ok ? trim.end : duration)}
                      onChange={(e) => set({ endText: formatTimecode(Number(e.target.value)) })}
                    />
                  )}
                </Field>
              </div>
              <div className="vd-row">
                <Button size="sm" variant="ghost" onClick={() => removeInput('video', source.id)}>Remove from this tool</Button>
              </div>
            </>
          )}
          <TrimResults sourceId={source.id} />
        </section>
      )}

      <LinkSection set={set} linkText={st.linkText} variant={st.variant} />
    </ToolPage>
  );
}

function useInspection(asset: SessionAsset | undefined): Inspection | null {
  const [res, setRes] = useState<{ id: string; r: Inspection } | null>(null);
  useEffect(() => {
    if (!asset) return;
    let live = true;
    inspectVideo(asset.blob).then(
      (r) => live && setRes({ id: asset.id, r }),
      (e: unknown) => live && setRes({ id: asset.id, r: { ok: false, reason: `Could not read this file. ${errText(e).message}` } }),
    );
    return () => {
      live = false;
    };
  }, [asset]);
  return asset && res?.id === asset.id ? res.r : null;
}

function useOutputs(info: { width: number; height: number } | null): OutputOption[] | null {
  const [opts, setOpts] = useState<OutputOption[] | null>(null);
  const key = info ? `${info.width}x${info.height}` : '';
  useEffect(() => {
    if (!info) return;
    let live = true;
    outputOptions(info.width, info.height).then((o) => live && setOpts(o));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return info ? opts : null;
}

function TrimResults({ sourceId }: { sourceId: string }) {
  const jobs = useJobs('video').filter((j) => j.inputIds.includes(sourceId));
  if (jobs.length === 0) return null;
  return (
    <section aria-labelledby="vd-res-h" className="vd-section">
      <h2 id="vd-res-h">Trimmed results</h2>
      {jobs.map((j) => {
        if (j.state !== 'complete' || !j.result) return <JobStatus key={j.id} job={j} />;
        return (
          <div key={j.id} className="vd-result">
            {j.result.assets.map((out) => {
              const d = trimDetails.get(out.blob);
              const detail = d ? `${d.durationSec.toFixed(2)} s · ${d.width}×${d.height}` : undefined;
              return (
                <div key={out.id} className="vd-result">
                  <ul className="pk-assets">
                    <AssetRow asset={out} exclude="video" detail={detail} />
                  </ul>
                  {d && (
                    <>
                      <p className="vd-link-note">{d.mode === 'copied' ? 'Copied without re-encoding; cuts land on the nearest keyframe.' : 'Re-encoded.'}</p>
                      {d.verified ? <p className="vd-verified">Verified: duration {d.durationSec.toFixed(2)} s</p> : <Notice kind="warn">The duration could not be verified against the requested range.</Notice>}
                    </>
                  )}
                  <video controls preload="metadata" src={assetUrl(out)} aria-label={`Preview of ${out.name}`}>
                    Your browser cannot play this file.
                  </video>
                  {j.result!.warnings.map((w) => (
                    <Notice key={w} kind="warn">
                      {w}
                    </Notice>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
      {jobs.some((j) => isActive(j)) && <p className="muted">Working. You can leave this page and come back; the job keeps running.</p>}
    </section>
  );
}

type LinkStore = { linkText: string; variant: number };
function LinkSection({ set, linkText, variant }: { set: (p: Partial<LinkStore>) => void; linkText: string; variant: number }) {
  const [check, setCheck] = useState<LinkCheck | null>(null);
  const [checkErr, setCheckErr] = useState<{ message: string; next?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const v = linkText.trim() ? validateLink(linkText) : null;
  const url = v?.ok ? v.url : null;
  const linkErr = v && !v.ok && v.kind !== 'empty' ? v.message : undefined;
  const jobs = useJobs('video').filter((j) => j.inputIds.length === 0);

  const onText = (t: string) => {
    set({ linkText: t, variant: 0 });
    setCheck(null);
    setCheckErr(null);
  };

  const doCheck = async () => {
    if (!url) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setChecking(true);
    setCheck(null);
    setCheckErr(null);
    try {
      setCheck(await checkLink(url, c.signal));
    } catch (e) {
      if (!c.signal.aborted) setCheckErr(errText(e));
    } finally {
      setChecking(false);
    }
  };

  const download = () => {
    if (!url || !check || check.kind === 'hls-error') return;
    const isHls = check.kind === 'hls-master' || check.kind === 'hls-media';
    enqueue({
      toolId: 'video',
      label: `Save ${check.name}`,
      inputIds: [],
      heavy: true,
      run: async (ctx): Promise<EngineResult> => {
        if (isHls) return saveHls(url, check.kind === 'hls-master' ? variant : undefined, ctx);
        const f = await downloadMedia(url, ctx);
        return { outputs: [f], warnings: [] };
      },
    });
  };

  const canDownload = !!check && check.kind !== 'hls-error' && !(check.kind === 'hls-master' && variant >= check.variants.length);

  return (
    <section aria-labelledby="vd-link-h" className="vd-section">
      <h2 id="vd-link-h">Save from a link</h2>
      <Notice kind="info">Needs network access: this contacts the site in the link.</Notice>
      <Field label="Direct media link (https://)" error={linkErr} hint={linkErr ? undefined : 'A direct video, audio or HLS (.m3u8) link. Platform video pages are not supported.'}>
        {(p) => (
          <input {...p} type="url" className="pk-input" inputMode="url" autoComplete="off" spellCheck={false} value={linkText} onChange={(e) => onText(e.target.value)} />
        )}
      </Field>
      {url && (
        <Notice kind="info">
          Your browser will request this file directly from {url.host}. That site will see your IP address. Nothing passes through a Plainkit server.
        </Notice>
      )}
      <div className="vd-row">
        <Button disabled={!url || checking} onClick={doCheck}>
          {checking ? 'Checking…' : 'Check link'}
        </Button>
        <Button variant="primary" disabled={!canDownload} onClick={download}>
          Download
        </Button>
      </div>
      {checkErr && (
        <Notice kind="error">
          <strong>{checkErr.message}</strong>
          {checkErr.next && <div>{checkErr.next}</div>}
        </Notice>
      )}
      {check?.kind === 'media' && (
        <p className="muted">
          Direct file from {check.host}: {check.mime}
          {check.size ? `, ${formatBytes(check.size)}` : ', size unknown'}. Saved as {check.name}.
        </p>
      )}
      {check?.kind === 'hls-error' && <Notice kind="error">{check.message}</Notice>}
      {check?.kind === 'hls-media' && (
        <p className="muted">
          HLS playlist from {check.host}: {check.segments} segments, {check.totalSec.toFixed(2)} s in total. Segments will be requested from: {check.hosts.join(', ')}. Saved as {check.name}.
        </p>
      )}
      {check?.kind === 'hls-master' && (
        <Field label="Quality" hint={`The playlist lists these qualities, served from: ${check.hosts.join(', ')}. Pick one.`}>
          {(p) => (
            <select {...p} className="pk-select" value={variant} onChange={(e) => set({ variant: Number(e.target.value) })}>
              {check.variants.map((vt, i) => (
                <option key={i} value={i}>
                  {vt.label} · {Math.round(vt.bandwidth / 1000)} kbps
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {jobs.map((j) => {
        if (j.state !== 'complete' || !j.result) return <JobStatus key={j.id} job={j} />;
        return (
          <div key={j.id} className="vd-result">
            {j.result.assets.map((out) => {
              const hd = hlsDetails.get(out.blob);
              return (
                <div key={out.id} className="vd-result">
                  <ul className="pk-assets">
                    <AssetRow asset={out} exclude="video" />
                  </ul>
                  {hd && (
                    <p className="vd-link-note">
                      {hd.kind === 'mp4' ? (hd.verified ? 'Remuxed to MP4 (duration verified).' : 'Remuxed to MP4 (duration not verified).') : 'Joined .ts file. Some players cannot open it.'}
                    </p>
                  )}
                  <div className="vd-row">
                    <Button size="sm" onClick={() => setInputs('video', [out.id])}>
                      Trim this file
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
