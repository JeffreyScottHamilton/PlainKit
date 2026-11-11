import { useId, useRef, useState } from 'react';
import { AssetList } from '@/components/AssetList';
import { Button } from '@/components/ui';
import { JobBadge } from '@/components/JobStatus';
import { clearImpact, clearSession } from '@/session/clear';
import { useAssets } from '@/session/store';
import { isActive, useJobs } from '@/jobs/queue';

type Impact = ReturnType<typeof clearImpact>;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function describeImpact(i: Impact): string {
  const parts: string[] = [];
  if (i.running) parts.push(`cancels ${count(i.running, 'running or queued job')}`);
  const removes = `removes ${count(i.files, 'file')}`;
  parts.push(i.results ? `${removes}, including ${count(i.results, 'result')}` : removes);
  return `This ${parts.join(' and ')}. Model caches are not affected.`;
}

/** Clears immediately unless running jobs or generated results would be lost; then asks first. */
export function ClearSessionButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [impact, setImpact] = useState<Impact | null>(null);

  const onClick = () => {
    const i = clearImpact();
    if (i.running === 0 && i.results === 0) {
      clearSession();
      return;
    }
    setImpact(i);
    dlg.current?.showModal();
  };

  return (
    <>
      <Button size={size} onClick={onClick}>
        Clear session
      </Button>
      <dialog ref={dlg} className="confirm" aria-labelledby={titleId} aria-describedby={descId}>
        <h2 id={titleId}>Clear this session?</h2>
        <p id={descId}>{impact ? describeImpact(impact) : ''}</p>
        <p className="muted confirm__note">Clearing releases this tab's references to files and results. It does not erase them from the device.</p>
        <div className="confirm__actions">
          <Button onClick={() => dlg.current?.close()}>Cancel</Button>
          <Button variant="danger" onClick={() => {
            clearSession();
            dlg.current?.close();
          }}>
            Clear session
          </Button>
        </div>
      </dialog>
    </>
  );
}

function narrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 699px)').matches;
}

/** Bottom session tray on every route: files, jobs summary, clear. Collapsed by default below 700px. */
export function Tray() {
  const assets = useAssets();
  const active = useJobs().filter(isActive);
  const [open, setOpen] = useState(() => !narrow());
  const headId = useId();
  const bodyId = useId();
  const running = active.filter((j) => j.state === 'running').length;
  const queued = active.length - running;

  return (
    <section className="tray" aria-labelledby={headId}>
      <div className="tray__head">
        <h2 id={headId} className="tray__title">
          This session
        </h2>
        <span className="tray__count">{count(assets.length, 'file')}</span>
        {active.length > 0 && (
          <span className="tray__jobs">
            <span>
              {running} running{queued ? `, ${queued} queued` : ''}
            </span>
            {active.slice(0, 3).map((j) => (
              <span key={j.id} className="tray__job">
                <span>{j.label}</span>
                <JobBadge job={j} />
              </span>
            ))}
          </span>
        )}
        <span className="tray__spacer" />
        <Button size="sm" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          Session files
        </Button>
        <ClearSessionButton />
      </div>
      {open && (
        <div id={bodyId} className="tray__body">
          {assets.length === 0 ? <p className="tray__empty">No files yet.</p> : <AssetList assets={assets} menuDown={false} />}
        </div>
      )}
    </section>
  );
}
