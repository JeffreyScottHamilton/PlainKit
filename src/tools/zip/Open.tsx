import { useEffect, useState } from 'react';
import { AssetList } from '@/components/AssetList';
import { DropZone } from '@/components/DropZone';
import { JobStatus } from '@/components/JobStatus';
import { Button, Notice } from '@/components/ui';
import { extractZip, listZip } from '@/engines/zip/client';
import type { ZipEntry } from '@/engines/zip/types';
import { enqueue, useJobs } from '@/jobs/queue';
import { toToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { useAssets } from '@/session/store';
import { useToolState } from '@/session/toolState';

type Listing = { status: 'idle' | 'loading' | 'ready' | 'error'; entries: ZipEntry[]; totalSize: number; error?: { message: string; nextAction?: string } };
const EMPTY: Listing = { status: 'idle', entries: [], totalSize: 0 };
const REASON: Record<NonNullable<ZipEntry['unsupported']>, string> = {
  encrypted: 'Encrypted: not supported',
  method: 'Compression not supported',
};

export function OpenPanel() {
  const assets = useAssets();
  const [st, set] = useToolState<{ archiveId: string; filter: string; selected: string[] }>('zip-open', { archiveId: '', filter: '', selected: [] });
  const jobs = useJobs('zip').filter((j) => j.label === 'Extract from ZIP');
  const zips = assets.filter((a) => /\.zip$/i.test(a.name) || a.mime === 'application/zip');
  const archive = zips.find((a) => a.id === st.archiveId);
  const [list, setList] = useState<Listing>(EMPTY);

  const archiveBlob = archive?.blob;
  useEffect(() => {
    if (!archiveBlob) {
      setList(EMPTY);
      return;
    }
    const ctl = new AbortController();
    setList({ ...EMPTY, status: 'loading' });
    listZip(archiveBlob, { signal: ctl.signal })
      .then((r) => setList({ status: 'ready', ...r }))
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        const err = toToolError(e);
        setList({ ...EMPTY, status: 'error', error: { message: err.message, nextAction: err.nextAction } });
      });
    return () => ctl.abort();
  }, [archiveBlob]);

  const q = st.filter.trim().toLowerCase();
  const shown = list.entries.filter((e) => !q || e.path.toLowerCase().includes(q));
  const selectable = (e: ZipEntry) => !e.isDir && !e.unsupported;
  const chosen = new Set(st.selected);
  const childrenOf = (folder: ZipEntry) => list.entries.filter((e) => selectable(e) && e.name.startsWith(folder.name));
  const isOn = (e: ZipEntry) => (e.isDir ? childrenOf(e).length > 0 && childrenOf(e).every((c) => chosen.has(c.name)) : chosen.has(e.name));

  const toggle = (e: ZipEntry) => {
    const names = e.isDir ? childrenOf(e).map((c) => c.name) : [e.name];
    const on = !isOn(e);
    const next = new Set(st.selected);
    for (const n of names) (on ? next.add(n) : next.delete(n));
    set({ selected: [...next] });
  };
  const selectShown = () => set({ selected: [...new Set([...st.selected, ...shown.filter(selectable).map((e) => e.name)])] });

  const extract = () => {
    if (!archive) return;
    const blob = archive.blob;
    const names = st.selected.slice();
    enqueue({
      toolId: 'zip',
      label: 'Extract from ZIP',
      inputIds: [archive.id],
      heavy: true,
      run: async (ctx) => ({ outputs: await extractZip(blob, names, ctx) }),
    });
  };

  const encrypted = list.entries.filter((e) => e.unsupported === 'encrypted').length;
  const selectedFiles = st.selected.length;

  return (
    <section aria-labelledby="zp-open-h" className="zp-section">
      <h2 id="zp-open-h">ZIP to open</h2>
      {zips.length > 0 ? (
        <fieldset className="zp-pick">
          <legend className="pk-hint">Choose a ZIP from this session</legend>
          {zips.map((z) => (
            <label key={z.id} className="zp-radio">
              <input type="radio" name="zp-archive" checked={z.id === st.archiveId} onChange={() => set({ archiveId: z.id, selected: [] })} />
              <span className="zp-name" title={z.name}>
                {z.name}
              </span>
              <span className="mono muted">{formatBytes(z.size)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted">No ZIP in this session yet.</p>
      )}
      <DropZone
        compact
        accept=".zip,application/zip"
        hint="Add a .zip. It is read here and nothing is uploaded."
        onAdded={(added) => {
          const first = added.find((a) => /\.zip$/i.test(a.name) || a.mime === 'application/zip');
          if (first) set({ archiveId: first.id, selected: [] });
        }}
      />

      {archive && list.status === 'loading' && <p className="muted">Reading the ZIP.</p>}
      {archive && list.status === 'error' && list.error && (
        <Notice kind="error">
          {list.error.message} {list.error.nextAction}
        </Notice>
      )}

      {archive && list.status === 'ready' && (
        <>
          <p className="mono muted" aria-live="off">
            {list.entries.length} {list.entries.length === 1 ? 'entry' : 'entries'} · {formatBytes(list.totalSize)} uncompressed
          </p>
          {encrypted > 0 && (
            <Notice kind="warn">
              {encrypted} {encrypted === 1 ? 'entry is' : 'entries are'} encrypted (password-protected). Encrypted ZIPs cannot be opened here.
            </Notice>
          )}
          <div className="zp-tools">
            <label className="zp-filter">
              <span>Filter entries</span>
              <input type="search" className="pk-input" value={st.filter} onChange={(e) => set({ filter: e.target.value })} />
            </label>
            <Button size="sm" onClick={selectShown}>
              Select all shown
            </Button>
            <Button size="sm" variant="ghost" disabled={selectedFiles === 0} onClick={() => set({ selected: [] })}>
              Clear selection
            </Button>
          </div>
          <div className="zp-tablewrap">
            <table className="zp-table">
              <caption className="sr-only">Entries in {archive.name}</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col">Path</th>
                  <th scope="col">Size</th>
                  <th scope="col">Compressed</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const reason = e.unsupported ? REASON[e.unsupported] : null;
                  const id = `zp-r-${e.name}`;
                  return (
                    <tr key={e.name}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isOn(e)}
                          disabled={!!reason || (e.isDir && childrenOf(e).length === 0)}
                          aria-label={e.isDir ? `Select folder ${e.path}` : `Select ${e.path}`}
                          aria-describedby={reason ? id : undefined}
                          onChange={() => toggle(e)}
                        />
                      </td>
                      <td className="zp-path" title={e.path}>
                        {e.path}
                        {reason && (
                          <span id={id} className="zp-reason">
                            {' '}
                            {reason}
                          </span>
                        )}
                      </td>
                      <td className="mono">{e.isDir ? '—' : formatBytes(e.size)}</td>
                      <td className="mono">{e.isDir ? '—' : formatBytes(e.compressedSize)}</td>
                      <td className="mono">{e.modified === null ? '—' : new Date(e.modified).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="muted">No entries match this filter.</p>}
          <Button variant="primary" disabled={selectedFiles === 0} onClick={extract}>
            Extract selected ({selectedFiles})
          </Button>
        </>
      )}

      {jobs
        .filter((j) => j.state === 'queued' || j.state === 'running' || j.state === 'failed')
        .map((j) => (
          <JobStatus key={j.id} job={j} />
        ))}
      {jobs
        .filter((j) => j.state === 'complete')
        .map((j) => (
          <div key={j.id} className="zp-summary">
            <p>Extracted {j.result?.assets.length ?? 0} files into this session.</p>
            <AssetList assets={j.result?.assets ?? []} />
          </div>
        ))}
    </section>
  );
}
