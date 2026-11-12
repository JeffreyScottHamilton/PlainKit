import { useEffect, useId, useReducer } from 'react';
import { ToolPage } from '@/components/ToolPage';
import { DropZone } from '@/components/DropZone';
import { AssetRow, AssetThumb } from '@/components/AssetList';
import { JobStatus } from '@/components/JobStatus';
import { Button, Notice } from '@/components/ui';
import { removeAsset, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import { cancelJob, enqueue, isActive, useJobs } from '@/jobs/queue';
import type { Job } from '@/jobs/types';
import { formatBytes, outputName } from '@/lib/format';
import { readMetadata, type MetadataReport } from '@/engines/metadata/read';
import { cleanFile, verdictOf } from '@/engines/metadata/clean';
import './metadata.css';

type Stored = { keepIcc: boolean; keepOrientation: boolean; jobByInput: Record<string, string> };
const INITIAL: Stored = { keepIcc: true, keepOrientation: true, jobByInput: {} };

const UNREADABLE: MetadataReport = { format: null, cleanable: false, hasLocation: false, present: [], groups: [], structureError: 'The file could not be read.' };
/** Reports per Blob (WeakMap: released with the asset). */
const reports = new WeakMap<Blob, MetadataReport>();

/** Reads metadata for each asset once. Missing key = still reading. */
function useReports(assets: readonly SessionAsset[]): ReadonlyMap<string, MetadataReport> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let alive = true;
    for (const a of assets) {
      if (reports.has(a.blob)) continue;
      void readMetadata(a.blob)
        .catch(() => UNREADABLE)
        .then((r) => {
          reports.set(a.blob, r);
          if (alive) bump();
        });
    }
    return () => {
      alive = false;
    };
  }, [assets]);
  return new Map(assets.flatMap((a) => (reports.has(a.blob) ? [[a.id, reports.get(a.blob)!] as const] : [])));
}

/** What would be removed, in plain words. */
function plan(r: MetadataReport, st: Stored): string {
  const removed = r.present.length ? r.present.join(', ') : 'no removable metadata found';
  const kept = ['image data', st.keepIcc ? 'color profile' : '', st.keepOrientation ? 'rotation' : ''].filter(Boolean).join(', ');
  return `Would remove: ${removed}. Keeps: ${kept}.`;
}

function FileCard({ asset, report, job, st }: { asset: SessionAsset; report: MetadataReport | undefined; job: Job | undefined; st: Stored }) {
  const headId = useId();
  const out = job?.state === 'complete' ? job.result?.assets[0] : undefined;
  const verdict = out ? verdictOf(out.blob) : undefined;
  return (
    <li className="meta-file">
      <section aria-labelledby={headId} className="meta-file">
        <div className="meta-head">
          <AssetThumb asset={asset} />
          <div style={{ minWidth: 0 }}>
            <h2 id={headId} className="meta-name" title={asset.name}>
              {asset.name}
            </h2>
            <p className="mono muted" style={{ margin: 0, fontSize: 13 }}>
              {report?.format ?? asset.mime} · {formatBytes(asset.size)}
            </p>
          </div>
        </div>

        {!report && <p className="muted">Reading metadata…</p>}
        {report && !report.format && <Notice kind="error">This file is not a recognised JPEG, PNG, WebP, GIF, BMP or AVIF image. Nothing was read. Choose another file.</Notice>}
        {report?.format && (
          <>
            {report.hasLocation && <Notice kind="warn">This photo contains a location.</Notice>}
            {report.groups.length > 0 ? (
              <div className="meta-groups">
                {report.groups.map((g) => (
                  <div key={g.title}>
                    <h3>{g.title}</h3>
                    <dl className="meta-dl">
                      {g.fields.map((f) => (
                        <div key={f.name} style={{ display: 'contents' }}>
                          <dt>{f.name}</dt>
                          <dd>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No metadata fields were found by the reader.</p>
            )}
            {!report.cleanable && <Notice>Removing metadata from this format is not supported yet.</Notice>}
            {report.cleanable && report.structureError && <Notice kind="error">{report.structureError} Nothing will be removed from this file.</Notice>}
            {report.cleanable && !report.structureError && <p className="meta-hint">{plan(report, st)}</p>}
          </>
        )}

        {job && isActive(job) && <JobStatus job={job} />}
        {job && (job.state === 'failed' || job.state === 'canceled') && <JobStatus job={job} />}
        {out && (
          <>
            {verdict?.clean ? (
              <p className="meta-verified" style={{ color: 'var(--success)', margin: 0 }}>
                {verdict.keptOrientation
                  ? 'Verified: no GPS, XMP, IPTC or other EXIF found in the output. Only the rotation tag is kept.'
                  : 'Verified: no EXIF, GPS, XMP or IPTC found in the output'}
              </p>
            ) : (
              <Notice kind="warn">Not fully removed. Still present: {verdict?.remaining.join(', ') ?? 'unknown'}.</Notice>
            )}
            <ul className="pk-assets" style={{ margin: 0 }}>
              <AssetRow asset={out} exclude="metadata" />
            </ul>
          </>
        )}
      </section>
    </li>
  );
}

export default function Tool() {
  const inputs = useToolInputs('metadata');
  const [st, set] = useToolState<Stored>('metadata', INITIAL);
  const reports = useReports(inputs);
  const jobs = useJobs('metadata');
  const jobFor = (a: SessionAsset): Job | undefined => {
    const id = st.jobByInput[a.id];
    return id ? jobs.find((j) => j.id === id) : undefined;
  };
  const targets = inputs.filter((a) => {
    const r = reports.get(a.id);
    return !!r && r.cleanable && !r.structureError;
  });

  const removeMetadata = () => {
    const next = { ...st.jobByInput };
    for (const a of targets) {
      const r = reports.get(a.id)!;
      const prev = jobFor(a);
      if (prev && isActive(prev)) cancelJob(prev.id);
      prev?.result?.assets.forEach((x) => removeAsset(x.id));
      next[a.id] = enqueue({
        toolId: 'metadata',
        label: `Remove metadata from ${a.name}`,
        inputIds: [a.id],
        run: async () => {
          const { blob, verdict } = await cleanFile(a.blob, r.format!, { keepIcc: st.keepIcc, keepOrientation: st.keepOrientation });
          return {
            outputs: [{ name: outputName(a.name, 'clean'), mime: r.format!, blob }],
            warnings: verdict.clean ? [] : [`Still present: ${verdict.remaining.join(', ')}`],
          };
        },
      });
    }
    set({ jobByInput: next });
  };

  return (
    <ToolPage
      toolId="metadata"
      settings={
        <div className="pk-stack">
          <h2>Remove options</h2>
          <label className="meta-check">
            <input type="checkbox" checked={st.keepIcc} onChange={(e) => set({ keepIcc: e.target.checked })} /> Keep color profile
          </label>
          <p className="meta-hint">Removing the color profile can shift colors, especially on wide-color screens.</p>
          <label className="meta-check">
            <input type="checkbox" checked={st.keepOrientation} onChange={(e) => set({ keepOrientation: e.target.checked })} /> Keep rotation so the photo does not turn sideways
          </label>
          <p className="meta-hint">Keeps only the orientation tag. The rest of the EXIF block is removed.</p>
          <Button variant="primary" block disabled={targets.length === 0} onClick={removeMetadata} aria-describedby="meta-remove-hint">
            {targets.length > 1 ? `Remove metadata from ${targets.length} files` : 'Remove metadata'}
          </Button>
          <p id="meta-remove-hint" className="meta-hint">
            {inputs.length === 0 ? 'Add a file first.' : targets.length === 0 ? 'No selected file can have metadata removed in its format.' : 'Nothing changes until you click this. The original file is kept.'}
          </p>
        </div>
      }
    >
      <p className="meta-note">Lossless: the picture data is not re-encoded.</p>
      <p className="meta-note">This cannot remove identifying details visible in the picture, and may not cover every hidden field in every format.</p>
      {inputs.length === 0 ? (
        <DropZone toolId="metadata" />
      ) : (
        <>
          <DropZone toolId="metadata" compact hint="Add more files. Nothing is changed until you remove metadata." />
          <ul className="meta-files" aria-label="Files">
            {inputs.map((a) => (
              <FileCard key={a.id} asset={a} report={reports.get(a.id)} job={jobFor(a)} st={st} />
            ))}
          </ul>
        </>
      )}
    </ToolPage>
  );
}
