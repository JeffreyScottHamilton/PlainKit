import { Button } from '@/components/ui';
import { isActive, useJobs } from '@/jobs/queue';
import { applyUpdate, pwa } from './pwa';

/** Shown when a new version has been downloaded. Never reloads by itself, and waits for running jobs. */
export function UpdateBanner() {
  const waiting = pwa.use((s) => s.updateWaiting);
  const busy = useJobs().some(isActive);
  if (!waiting) return null;
  return (
    <div className="update" role="status">
      <span>A new version of the app is ready.{busy ? ' Finish or cancel running jobs before updating.' : ' Reloading clears this session.'}</span>
      <Button size="sm" onClick={applyUpdate} disabled={busy}>
        Reload to update
      </Button>
    </div>
  );
}
