import { useEffect, useState, type FormEvent } from 'react';
import { AssetList } from '@/components/AssetList';
import { DropZone } from '@/components/DropZone';
import { JobStatus } from '@/components/JobStatus';
import { ToolPage } from '@/components/ToolPage';
import { Button, Field, Notice, Segmented } from '@/components/ui';
import { inspectPdfFile, lockPdfFile, unlockPdfFile, type Inspection } from '@/engines/pdf-lock/client';
import { enqueue, isActive, useJobs } from '@/jobs/queue';
import { toToolError } from '@/lib/errors';
import { formatBytes, outputName } from '@/lib/format';
import { useAssets } from '@/session/store';
import { useToolState } from '@/session/toolState';
import './pdf-lock.css';

type Mode = 'lock' | 'unlock';
type Perms = { print: boolean; copy: boolean; edit: boolean };
type Persisted = { mode: Mode; fileId: string; perms: Perms };
type InspectState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; inspection: Inspection }
  | { status: 'error'; message: string; nextAction?: string };

const MODES: { value: Mode; label: string }[] = [
  { value: 'lock', label: 'Add a password' },
  { value: 'unlock', label: 'Remove a password' },
];
const DEFAULT: Persisted = { mode: 'lock', fileId: '', perms: { print: true, copy: true, edit: true } };

export default function PdfLockTool() {
  const assets = useAssets();
  const [st, set] = useToolState<Persisted>('pdf-lock', DEFAULT);
  // Passwords live only in component state: never persisted, never shown in job labels.
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [owner, setOwner] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [info, setInfo] = useState<InspectState>({ status: 'idle' });
  const jobs = useJobs('pdf-lock');

  const pdfs = assets.filter((a) => /\.pdf$/i.test(a.name) || a.mime === 'application/pdf');
  const file = pdfs.find((a) => a.id === st.fileId);
  const fileBlob = file?.blob;

  useEffect(() => {
    if (!fileBlob) {
      setInfo({ status: 'idle' });
      return;
    }
    const ctl = new AbortController();
    setInfo({ status: 'loading' });
    inspectPdfFile(fileBlob, { signal: ctl.signal })
      .then((inspection) => setInfo({ status: 'ready', inspection }))
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        const err = toToolError(e);
        setInfo({ status: 'error', message: err.message, nextAction: err.nextAction });
      });
    return () => ctl.abort();
  }, [fileBlob]);

  const mode = st.mode;
  const ready = info.status === 'ready' ? info.inspection : null;
  const encrypted = ready?.encrypted === true;
  const opensFree = ready?.opensWithoutPassword === true;
  const mismatch = mode === 'lock' && confirm.length > 0 && confirm !== password;

  let blocker: string | null = null;
  if (!file) blocker = 'Choose a PDF first.';
  else if (info.status === 'loading' || info.status === 'idle') blocker = 'Reading the PDF.';
  else if (info.status === 'error') blocker = info.message;
  else if (mode === 'lock' && encrypted) blocker = 'This PDF already has a password. Use Remove a password first, then add a new one.';
  else if (mode === 'unlock' && !encrypted) blocker = 'This PDF has no password.';
  else if (mode === 'lock' && password.length === 0) blocker = 'Enter a password to lock this PDF.';
  else if (mode === 'lock' && mismatch) blocker = 'The passwords do not match.';
  else if (mode === 'unlock' && !opensFree && password.length === 0) blocker = 'Enter the password to unlock this PDF.';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blocker || !file) return;
    const blob = file.blob;
    const name = file.name;
    if (mode === 'lock') {
      const userPassword = password;
      const ownerPassword = owner.length > 0 ? owner : undefined;
      const options = { userPassword, ownerPassword, print: st.perms.print, copy: st.perms.copy, edit: st.perms.edit };
      enqueue({
        toolId: 'pdf-lock',
        label: 'Lock PDF',
        inputIds: [file.id],
        heavy: true,
        run: async (ctx) => ({ outputs: [{ name: outputName(name, 'locked', 'pdf'), mime: 'application/pdf', blob: await lockPdfFile(blob, options, ctx) }] }),
      });
    } else {
      const typed = password;
      enqueue({
        toolId: 'pdf-lock',
        label: 'Unlock PDF',
        inputIds: [file.id],
        heavy: true,
        run: async (ctx) => {
          const out = await unlockPdfFile(blob, typed, ctx);
          const warnings = out.opensWithoutPassword ? ['This PDF opened without a password, so its restrictions were removed.'] : [];
          return { outputs: [{ name: outputName(name, 'unlocked', 'pdf'), mime: 'application/pdf', blob: out.blob }], warnings };
        },
      });
    }
  };

  const done = jobs.filter((j) => j.state === 'complete' && j.result);
  const live = jobs.filter((j) => isActive(j) || j.state === 'failed' || j.state === 'canceled');

  return (
    <ToolPage toolId="pdf-lock">
      <section className="pl-section" aria-labelledby="pl-file-h">
        <h2 id="pl-file-h">PDF</h2>
        {pdfs.length > 0 && (
          <fieldset className="pl-pick">
            <legend className="pk-hint">Choose a PDF from this session</legend>
            {pdfs.map((p) => (
              <label key={p.id} className="pl-radio">
                <input type="radio" name="pl-file" checked={p.id === st.fileId} onChange={() => set({ fileId: p.id })} />
                <span className="pl-name" title={p.name}>
                  {p.name}
                </span>
                <span className="mono muted">{formatBytes(p.size)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <DropZone
          compact
          multiple={false}
          accept=".pdf,application/pdf"
          hint="Add one PDF. It is read on this device and nothing is uploaded."
          onAdded={(added) => {
            const first = added.find((a) => /\.pdf$/i.test(a.name) || a.mime === 'application/pdf');
            if (first) set({ fileId: first.id });
          }}
        />
        {info.status === 'error' && (
          <Notice kind="error">
            {info.message} {info.nextAction}
          </Notice>
        )}
        {info.status === 'loading' && <p className="muted">Reading the PDF.</p>}
        {ready && !encrypted && <p className="muted">This PDF has no password.</p>}
        {ready && encrypted && opensFree && (
          <Notice kind="warn">This PDF opens without a password. Unlocking it removes its restrictions too.</Notice>
        )}
      </section>

      <form className="pl-section" aria-labelledby="pl-mode-h" onSubmit={submit} noValidate>
        <h2 id="pl-mode-h">What to do</h2>
        <Segmented<Mode> label="Action" value={mode} options={MODES} onChange={(v) => set({ mode: v })} />

        <Field
          label={mode === 'lock' ? 'Password to open the PDF' : opensFree ? 'Password (not needed for this PDF)' : 'Password to unlock the PDF'}
          hint="Passwords are case-sensitive. They are not saved or sent anywhere."
        >
          {(p) => (
            <input {...p} className="pk-input" type={showPw ? 'text' : 'password'} autoComplete={mode === 'lock' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} spellCheck={false} />
          )}
        </Field>
        <div className="pl-row">
          <Button size="sm" aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>
            {showPw ? 'Hide password' : 'Show password'}
          </Button>
        </div>

        {mode === 'lock' && (
          <>
            <Field label="Confirm password" error={mismatch ? 'The passwords do not match.' : undefined}>
              {(p) => (
                <input {...p} className="pk-input" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} spellCheck={false} />
              )}
            </Field>
            <Field label="Owner password (optional)" hint="Controls the permissions below. Leave it blank to generate a random one. Anyone who opens with the password above gets the set permissions.">
              {(p) => (
                <input {...p} className="pk-input" type={showPw ? 'text' : 'password'} autoComplete="off" value={owner} onChange={(e) => setOwner(e.target.value)} spellCheck={false} />
              )}
            </Field>
            <fieldset className="pl-perms">
              <legend>Allow</legend>
              <label className="pl-check">
                <input type="checkbox" checked={st.perms.print} onChange={(e) => set({ perms: { ...st.perms, print: e.target.checked } })} />
                Printing
              </label>
              <label className="pl-check">
                <input type="checkbox" checked={st.perms.copy} onChange={(e) => set({ perms: { ...st.perms, copy: e.target.checked } })} />
                Copying text
              </label>
              <label className="pl-check">
                <input type="checkbox" checked={st.perms.edit} onChange={(e) => set({ perms: { ...st.perms, edit: e.target.checked } })} />
                Editing and forms
              </label>
              <p className="pk-hint">Only PDF readers that respect these settings enforce them.</p>
            </fieldset>
          </>
        )}

        {blocker && <Notice kind="info">{blocker}</Notice>}
        <div className="pl-row">
          <Button variant="primary" type="submit" disabled={blocker !== null}>
            {mode === 'lock' ? 'Lock PDF' : 'Unlock PDF'}
          </Button>
        </div>
      </form>

      {live.length > 0 && (
        <section className="pl-section" aria-label="Progress">
          {live.map((j) => (
            <JobStatus key={j.id} job={j} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="pl-section" aria-labelledby="pl-out-h">
          <h2 id="pl-out-h">Results</h2>
          {done.map((j) => (
            <AssetList key={j.id} assets={j.result?.assets ?? []} />
          ))}
        </section>
      )}
    </ToolPage>
  );
}
