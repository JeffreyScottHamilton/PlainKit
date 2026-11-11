import { dropAllJobs, jobs, isActive } from '@/jobs/queue';
import { dropAllAssets, session } from './store';
import { resetToolStates } from './toolState';

/** What "Clear session" would lose, for the confirmation text. */
export function clearImpact() {
  return {
    running: jobs.get().filter(isActive).length,
    results: session.get().assets.filter((a) => a.origin === 'generated').length,
    files: session.get().assets.length,
  };
}

/** Cancels jobs, revokes previews, releases file references and tool state. Engine/model caches are separate. */
export function clearSession() {
  dropAllJobs();
  dropAllAssets();
  resetToolStates();
}
