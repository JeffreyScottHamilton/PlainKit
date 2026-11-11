import { Check, CircleAlert, Clock, Loader, Ban } from 'lucide-react';
import type { Job } from '@/jobs/types';
import { cancelJob, isActive } from '@/jobs/queue';
import { Button, Notice, Progress } from './ui';

const STAGE = { 'loading-engine': 'Downloading engine', inspecting: 'Inspecting', processing: 'Processing', exporting: 'Exporting' } as const;
const LABEL = { queued: 'Queued', running: 'Running', complete: 'Done', canceled: 'Canceled', failed: 'Failed' } as const;
const ICON = { queued: Clock, running: Loader, complete: Check, canceled: Ban, failed: CircleAlert } as const;

export function JobBadge({ job }: { job: Job }) {
  const Icon = ICON[job.state];
  return (
    <span className={`pk-status pk-status--${job.state}`}>
      <Icon aria-hidden /> {LABEL[job.state]}
    </span>
  );
}

/** Progress + cancel for an active job, error with next action for a failed one. */
export function JobStatus({ job }: { job: Job }) {
  if (isActive(job)) {
    const stage = job.state === 'queued' ? 'Waiting for another job to finish' : job.progress ? STAGE[job.progress.stage] : 'Starting';
    return (
      <div className="pk-stack" style={{ gap: 8 }}>
        <div className="pk-row" style={{ justifyContent: 'space-between' }}>
          <span>
            {stage}
            {job.progress?.message ? `: ${job.progress.message}` : ''}
            {typeof job.progress?.fraction === 'number' ? ` · ${Math.round(job.progress.fraction * 100)}%` : ''}
          </span>
          <Button size="sm" onClick={() => cancelJob(job.id)}>
            Cancel
          </Button>
        </div>
        <Progress fraction={job.state === 'running' ? job.progress?.fraction : undefined} label={`${job.label} progress`} />
      </div>
    );
  }
  if (job.state === 'failed' && job.error)
    return (
      <Notice kind="error">
        <strong>{job.error.message}</strong>
        {job.error.nextAction ? <div>{job.error.nextAction}</div> : null}
      </Notice>
    );
  if (job.state === 'canceled') return <Notice>Canceled. Your original file is unchanged.</Notice>;
  return null;
}
