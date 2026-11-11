import { useRef, useState, type ReactNode } from 'react';
import { addFiles } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { accepts, getTool } from '@/registry';
import './components.css';

type Props = {
  /** Tool whose inputs receive the files. Omit on home: files only join the session. */
  toolId?: string;
  multiple?: boolean;
  compact?: boolean;
  /** Override the input accept attribute (defaults to the tool's registry formats). */
  accept?: string;
  hint?: ReactNode;
  onAdded?: (assets: SessionAsset[], rejected: File[]) => void;
};

/** File intake. Adding files never starts processing. Has a real button, so it works without drag. */
export function DropZone({ toolId, multiple = true, compact, accept, hint, onAdded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const tool = toolId ? getTool(toolId) : undefined;

  const take = (list: FileList | null) => {
    if (!list?.length) return;
    let files = [...list];
    if (!multiple) files = files.slice(0, 1);
    const ok: File[] = [];
    const bad: File[] = [];
    for (const f of files) {
      const mime = f.type || 'application/octet-stream';
      const extOk = accept ? accept.split(',').some((a) => a.trim().startsWith('.') && f.name.toLowerCase().endsWith(a.trim())) : false;
      (!tool || accepts(tool, mime) || extOk || !f.type ? ok : bad).push(f);
    }
    setRejected(bad.map((f) => f.name));
    const added = ok.length ? addFiles(ok, toolId) : [];
    onAdded?.(added, bad);
  };

  return (
    <div>
      <div
        className={`pk-drop${compact ? ' pk-drop--compact' : ''}`}
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <span>
          Drop {multiple ? 'files' : 'a file'} here, or{' '}
          <button type="button" className="pk-linkbtn" onClick={() => input.current?.click()}>
            choose {multiple ? 'files' : 'a file'}
          </button>
          .
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          {hint ?? 'Files are processed in this browser.'}
        </span>
        <input
          ref={input}
          type="file"
          hidden
          multiple={multiple}
          accept={accept ?? tool?.accepts.join(',')}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {rejected.length > 0 && (
        <p role="alert" style={{ color: 'var(--error)', fontSize: 13, marginTop: 4 }}>
          Not supported here: {rejected.join(', ')}
        </p>
      )}
    </div>
  );
}
