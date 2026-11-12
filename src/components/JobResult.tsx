import type { Job } from '@/jobs/types';
import type { SessionAsset } from '@/session/types';
import { formatBytes, percentChange } from '@/lib/format';
import { AssetRow } from './AssetList';
import { JobStatus } from './JobStatus';
import { Notice } from './ui';

/** Status, size change, notes and output rows for one job. Shared by the simpler conversion panels. */
export function JobResult({ job, source, exclude, expectSmaller }: { job: Job | undefined; source?: SessionAsset; exclude: string; expectSmaller?: boolean }) {
  if (!job) return null;
  const outs = job.result?.assets ?? [];
  const total = outs.reduce((n, a) => n + a.size, 0);
  const change = source && outs.length === 1 ? percentChange(source.size, total) : null;
  return (
    <div className="pk-stack" style={{ gap: 8 }}>
      <JobStatus job={job} />
      {job.result && (
        <>
          {source && change !== null && (
            <p className="mono">
              {formatBytes(source.size)} → {formatBytes(total)} ({change > 0 ? '+' : '−'}
              {Math.abs(change)}%)
            </p>
          )}
          {expectSmaller && source && total >= source.size && <Notice kind="warn">The result is not smaller than the original. Keep the original, or try the other method or lower settings.</Notice>}
          {job.result.warnings.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 24, fontSize: 13, color: 'var(--text-2)' }}>
              {job.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <ul className="pk-assets" aria-label="Results">
            {outs.map((a) => (
              <AssetRow key={a.id} asset={a} exclude={exclude} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
