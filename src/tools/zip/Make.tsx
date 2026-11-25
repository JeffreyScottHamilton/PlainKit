import { useEffect, useRef, type DragEvent } from 'react';
import { AssetList } from '@/components/AssetList';
import { DropZone } from '@/components/DropZone';
import { JobStatus } from '@/components/JobStatus';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { packZip } from '@/engines/zip/client';
import type { ZipLevel } from '@/engines/zip/types';
import { enqueue, useJobs } from '@/jobs/queue';
import { formatBytes, outputName, percentChange } from '@/lib/format';
import { addFiles, removeInput, useToolInputs } from '@/session/store';
import { useToolState } from '@/session/toolState';
import { addWithPaths, namedByPath } from './folder';

const LEVELS: { value: ZipLevel; label: string }[] = [
  { value: 'store', label: 'Store' },
  { value: 'normal', label: 'Normal' },
  { value: 'best', label: 'Best' },
];

export function MakePanel() {
  const picked = useToolInputs('zip');
  const jobs = useJobs('zip').filter((j) => j.label === 'Make ZIP');
  const [st, set] = useToolState<{ name: string; level: ZipLevel; lastJob: { id: string; input: number } | null }>('zip-make', {
    name: 'archive.zip',
    level: 'normal',
    lastJob: null,
  });
  const folderInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Not a typed React prop; this makes the picker choose a folder.
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);
  const total = picked.reduce((s, a) => s + a.size, 0);

  // Folder drops need the entries read during the drop event. Other drops fall through to DropZone.
  const onDropCapture = (e: DragEvent<HTMLDivElement>) => {
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.() ?? null);
    if (!entries.some((en) => en?.isDirectory)) return;
    e.preventDefault();
    e.stopPropagation();
    void addWithPaths(entries.flatMap((en) => (en ? [en] : [])));
  };

  const make = () => {
    const inputs = picked.map((a) => ({ name: a.name, blob: a.blob }));
    const name = outputName(st.name.trim() || 'archive', '', 'zip');
    const id = enqueue({
      toolId: 'zip',
      label: 'Make ZIP',
      inputIds: picked.map((a) => a.id),
      heavy: true,
      run: async (ctx) => {
        const { bytes, storedCount } = await packZip(inputs, st.level, ctx);
        const warnings =
          storedCount > 0 ? [`${storedCount} already-compressed ${storedCount === 1 ? 'file was' : 'files were'} stored without compression.`] : [];
        return { outputs: [{ name, mime: 'application/zip', blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }) }], warnings };
      },
    });
    set({ lastJob: { id, input: total } });
  };

  const last = st.lastJob ? jobs.find((j) => j.id === st.lastJob?.id) : undefined;
  const zipAsset = last?.result?.assets[0];
  const pct = zipAsset && st.lastJob && st.lastJob.input > 0 ? percentChange(st.lastJob.input, zipAsset.size) : null;

  return (
    <section aria-labelledby="zp-make-h" className="zp-section">
      <h2 id="zp-make-h">Files to pack</h2>
      <div onDropCapture={onDropCapture}>
        <DropZone toolId="zip" hint="Any file type. Files stay on this device. Dropping a folder keeps its folder structure." />
      </div>
      <div className="zp-row">
        <Button size="sm" onClick={() => folderInput.current?.click()}>
          Add a folder
        </Button>
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(namedByPath(e.target.files), 'zip');
            e.target.value = '';
          }}
        />
        <span className="mono muted">{picked.length === 0 ? 'No files yet.' : `${picked.length} ${picked.length === 1 ? 'file' : 'files'} · ${formatBytes(total)}`}</span>
      </div>
      {picked.length > 0 && (
        <ul className="zp-files">
          {picked.map((a) => (
            <li key={a.id}>
              <span className="zp-name" title={a.name}>
                {a.name}
              </span>
              <span className="mono muted">{formatBytes(a.size)}</span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${a.name}`} onClick={() => removeInput('zip', a.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="zp-settings">
        <Field label="Archive name">{(p) => <input {...p} type="text" className="pk-input" value={st.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Segmented label="Compression" value={st.level} options={LEVELS} onChange={(level) => set({ level })} />
        <p className="pk-hint">Store keeps files as they are. Already-compressed files (photos, video, PDFs, ZIPs) are always stored.</p>
        <Button variant="primary" disabled={picked.length === 0} onClick={make}>
          Make ZIP
        </Button>
      </div>

      {last && (last.state === 'queued' || last.state === 'running' || last.state === 'failed') && <JobStatus job={last} />}
      {last?.state === 'canceled' && <Notice kind="info">The ZIP was canceled. Your files are unchanged.</Notice>}
      {zipAsset && st.lastJob && (
        <div className="zp-summary" aria-live="off">
          <p>
            Input {formatBytes(st.lastJob.input)} → ZIP {formatBytes(zipAsset.size)}
            {pct !== null ? ` (${Math.abs(pct)}% ${pct <= 0 ? 'smaller' : 'larger'})` : ''}
          </p>
          <AssetList assets={last?.result?.assets ?? []} />
        </div>
      )}
      {last?.result?.warnings.map((w) => (
        <Notice key={w} kind="info">
          {w}
        </Notice>
      ))}
    </section>
  );
}
