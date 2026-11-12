import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { Ban, Check, CircleAlert, Clock, Loader, type LucideIcon } from 'lucide-react';
import { AssetList } from '@/components/AssetList';
import { DropZone } from '@/components/DropZone';
import { ToolPage } from '@/components/ToolPage';
import { Button, CopyButton, Field, Notice, Progress, Segmented } from '@/components/ui';
import { makeMatrix, type QrMatrix } from '@/engines/qr/render';
import { isLive, STUN_URL, transfer, type IceMode, type OutFile, type Snapshot, type TransferState } from '@/engines/transfer/controller';
import { formatBytes } from '@/lib/format';
import { removeInput, useAssets, useToolInputs } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { useToolState } from '@/session/toolState';
import './send-files.css';

type View = 'send' | 'receive';
const VIEWS: { value: View; label: string }[] = [
  { value: 'send', label: 'Send' },
  { value: 'receive', label: 'Receive' },
];
const ICE: { value: IceMode; label: string; help: string }[] = [
  { value: 'direct', label: 'Direct only (no helper server)', help: 'Works when both devices are on the same network.' },
  {
    value: 'stun',
    label: 'Use a public STUN server to help connect across networks',
    help: `The STUN server (${STUN_URL}) sees both devices' IP addresses. It never sees your files.`,
  },
];
const NO_RELAY = 'Some networks block direct connections. There is no relay, so those transfers will not connect.';
const PRIVACY =
  'Files go directly between the two devices, encrypted in transit by WebRTC. The other device learns your IP address. Nothing is uploaded to a server by this app.';

const LINE: Record<TransferState, { icon: LucideIcon | null; text: string }> = {
  idle: { icon: null, text: 'Not connected.' },
  'creating-invite': { icon: Loader, text: 'Creating invite.' },
  'waiting-for-reply': { icon: Loader, text: 'Waiting for the reply code. Not connected yet.' },
  'creating-reply': { icon: Loader, text: 'Creating reply.' },
  connecting: { icon: Loader, text: 'Connecting.' },
  connected: { icon: Check, text: 'Direct connection open.' },
  offering: { icon: Check, text: 'Direct connection open. Waiting for the other device to accept.' },
  'awaiting-accept': { icon: Check, text: 'Direct connection open. Accept or decline the files.' },
  transferring: { icon: Loader, text: 'Transferring files.' },
  complete: { icon: Check, text: 'Transfer complete.' },
  canceled: { icon: Ban, text: 'Canceled.' },
  failed: { icon: CircleAlert, text: 'Failed.' },
  expired: { icon: Clock, text: 'Expired.' },
};
const COMPARE_STATES: TransferState[] = ['connected', 'offering', 'awaiting-accept', 'transferring', 'complete'];
const CHECK_TEXT = {
  'sha-256': 'Checked with SHA-256.',
  adler32: 'Checked with a running 32-bit checksum (Adler-32) and an exact byte count.',
} as const;

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = Math.ceil(Math.max(0, until - now) / 1000);
  return <span className="mono">{`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`}</span>;
}

/** Drawn from the matrix as numbers only. The pasted text is never rendered as markup. */
function QrCode({ text }: { text: string }) {
  const m = useMemo<QrMatrix | null>(() => {
    try {
      return makeMatrix(text, 'L');
    } catch {
      return null;
    }
  }, [text]);
  if (!m) return <p className="pk-hint">Too long to show as a QR code. Copy the text instead.</p>;
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const pad = 4;
  const box = m.size + 2 * pad;
  return (
    <svg className="sf-qr" viewBox={`${-pad} ${-pad} ${box} ${box}`} role="img" aria-label="QR code of the code in the box above">
      <rect x={-pad} y={-pad} width={box} height={box} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function CodeBox({ label, code }: { label: string; code: string }) {
  const id = useId();
  return (
    <div className="sf-code">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} readOnly rows={4} value={code} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
      <div className="sf-actions">
        <CopyButton text={code} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <QrCode text={code} />
    </div>
  );
}

function SendPanel({ snap, ice, picked }: { snap: Snapshot; ice: IceMode; picked: SessionAsset[] }) {
  const files: OutFile[] = picked.map((a) => ({ name: a.name, mime: a.mime, size: a.size, blob: a.blob }));
  const [reply, setReply] = useState('');
  return (
    <section className="sf-panel" aria-labelledby="sf-send-h">
      <h2 id="sf-send-h">Send</h2>
      <ol className="sf-steps">
        <li>Choose the files to send, then select Create invite.</li>
        <li>Copy the invite code to the other device.</li>
        <li>Paste the reply code from the other device, then select Connect.</li>
      </ol>
      <DropZone toolId="send-files" hint="Any file type. Files stay on this device until you send them." />
      {picked.length === 0 ? (
        <p className="muted">No files yet.</p>
      ) : (
        <ul className="sf-files">
          {picked.map((a) => (
            <li key={a.id}>
              <span className="sf-name" title={a.name}>
                {a.name}
              </span>
              <span className="mono muted">{formatBytes(a.size)}</span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${a.name}`} onClick={() => removeInput('send-files', a.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="sf-actions">
        <Button variant="primary" disabled={isLive(snap.state)} onClick={() => void transfer.createInvite(ice)}>
          Create invite
        </Button>
      </div>
      {snap.state === 'waiting-for-reply' && snap.code && (
        <div className="sf-block">
          <CodeBox label="Invite code" code={snap.code} />
          {snap.expiresAt !== null && (
            <p className="pk-hint">
              Expires in <Countdown until={snap.expiresAt} />. Codes are single-use. Keep this page open until the connection is made.
            </p>
          )}
          <Field label="Paste reply code">
            {(p) => <textarea {...p} rows={4} value={reply} spellCheck={false} onChange={(e) => setReply(e.target.value)} />}
          </Field>
          <div className="sf-actions">
            <Button variant="primary" disabled={reply.trim() === ''} onClick={() => void transfer.pasteReply(reply)}>
              Connect
            </Button>
          </div>
        </div>
      )}
      {snap.state === 'connected' && snap.role === 'sender' && (
        <div className="sf-actions">
          <Button variant="primary" disabled={files.length === 0} onClick={() => transfer.sendOffer(files)}>
            Send {files.length} {files.length === 1 ? 'file' : 'files'}
          </Button>
        </div>
      )}
    </section>
  );
}

function ReceivePanel({ snap, ice }: { snap: Snapshot; ice: IceMode }) {
  const [invite, setInvite] = useState('');
  const replying = snap.role === 'receiver' && isLive(snap.state);
  return (
    <section className="sf-panel" aria-labelledby="sf-recv-h">
      <h2 id="sf-recv-h">Receive</h2>
      {!replying && (
        <>
          <ol className="sf-steps">
            <li>Paste the invite code from the sending device, then select Create reply.</li>
            <li>Copy the reply code back to the sending device.</li>
            <li>Accept the files that are offered.</li>
          </ol>
          <div className="sf-block">
            <Field label="Paste invite code">
              {(p) => <textarea {...p} rows={4} value={invite} spellCheck={false} onChange={(e) => setInvite(e.target.value)} />}
            </Field>
            <div className="sf-actions">
              <Button variant="primary" disabled={isLive(snap.state) || invite.trim() === ''} onClick={() => void transfer.acceptInvite(invite, ice)}>
                Create reply
              </Button>
            </div>
          </div>
        </>
      )}
      {replying && snap.state === 'connecting' && snap.code && (
        <div className="sf-block">
          <CodeBox label="Reply code" code={snap.code} />
          <p className="pk-hint">Send this reply code back to the sending device. Waiting for it to connect.</p>
        </div>
      )}
    </section>
  );
}

function Status({ snap }: { snap: Snapshot }) {
  const assets = useAssets();
  const line = LINE[snap.state];
  const Glyph = line.icon;
  const transferring = snap.state === 'transferring' || snap.state === 'offering' || snap.state === 'awaiting-accept';
  const p = snap.progress;
  const elapsed = p ? (Date.now() - p.startedAt) / 1000 : 0;
  const rate = p && elapsed > 0 ? p.sent / elapsed : null;
  const received = assets.filter((a) => snap.results.some((r) => r.assetId === a.id));
  return (
    <section className="sf-status" aria-labelledby="sf-conn-h">
      <h2 id="sf-conn-h">Connection</h2>
      <p className="sf-line">
        {Glyph && <Glyph aria-hidden size={18} />}
        <span>{line.text}</span>
      </p>
      <div role="status" aria-live="polite" className="sr-only">
        {snap.announcement}
      </div>
      <p className="pk-hint">{NO_RELAY}</p>
      {snap.comparison && COMPARE_STATES.includes(snap.state) && (
        <div className="sf-compare">
          <span>Comparison number</span>
          <output aria-label="Comparison number" className="mono">
            {`${snap.comparison.slice(0, 3)} ${snap.comparison.slice(3)}`}
          </output>
          <p className="pk-hint">
            Check that both devices show the same number before accepting. It helps detect a swapped code. It is not strong authentication.
          </p>
        </div>
      )}
      {snap.problem && (
        <Notice kind="error">
          <strong>{snap.problem.message}</strong> <span>{snap.problem.nextAction}</span>
        </Notice>
      )}
      {snap.notice && <Notice kind={snap.state === 'expired' ? 'warn' : 'info'}>{snap.notice}</Notice>}
      {snap.state === 'awaiting-accept' && (
        <div className="sf-block">
          <h3>Files offered</h3>
          <ul className="sf-files">
            {snap.files.map((f, i) => (
              <li key={`${i}-${f.name}`}>
                <span className="sf-name" title={f.name}>
                  {f.name}
                </span>
                <span className="mono muted">
                  {formatBytes(f.size)} · {f.mime}
                </span>
              </li>
            ))}
          </ul>
          <p className="pk-hint">Nothing is received until you accept.</p>
          <div className="sf-actions">
            <Button variant="primary" onClick={() => transfer.acceptOffer()}>
              Accept
            </Button>
            <Button onClick={() => transfer.declineOffer()}>Decline</Button>
          </div>
        </div>
      )}
      {p && (
        <div className="sf-block">
          <Progress fraction={p.total > 0 ? p.sent / p.total : 1} label="Transfer progress" />
          <p className="mono">
            {formatBytes(p.sent)} of {formatBytes(p.total)}
            {rate !== null ? ` · ${formatBytes(rate)}/s` : ''}
          </p>
          <p>
            File {p.file} of {p.fileCount}: <span title={p.fileName}>{p.fileName}</span>
          </p>
        </div>
      )}
      {snap.results.length > 0 && (
        <div className="sf-block">
          <h3>Results</h3>
          <ul className="sf-files">
            {snap.results.map((r, i) => (
              <li key={`${i}-${r.name}`}>
                <span className="sf-name" title={r.name}>
                  {r.name}
                </span>
                <span className="mono muted">
                  {formatBytes(r.size)} · {CHECK_TEXT[r.check]}
                </span>
              </li>
            ))}
          </ul>
          {received.length > 0 && <AssetList assets={received} />}
        </div>
      )}
      {snap.state !== 'idle' && (
        <div className="sf-actions">
          <Button onClick={() => transfer.disconnect()}>{transferring ? 'Cancel' : 'Disconnect'}</Button>
        </div>
      )}
    </section>
  );
}

export default function Tool() {
  const snap = useSyncExternalStore(transfer.subscribe, transfer.getState);
  const [cfg, setCfg] = useToolState('send-files', { view: 'send' as View, ice: 'direct' as IceMode });
  const picked = useToolInputs('send-files');
  const settings = (
    <fieldset className="sf-ice">
      <legend>Connection helper</legend>
      {ICE.map((o) => (
        <label key={o.value} className="sf-radio">
          <input type="radio" name="sf-ice" value={o.value} checked={cfg.ice === o.value} onChange={() => setCfg({ ice: o.value })} />
          <span>
            <strong>{o.label}</strong>
            <span className="pk-hint">{o.help}</span>
          </span>
        </label>
      ))}
      <p className="pk-hint">
        {NO_RELAY} Applies to the next invite or reply.
      </p>
    </fieldset>
  );
  return (
    <ToolPage toolId="send-files" settings={settings}>
      <p>{PRIVACY}</p>
      <p className="pk-hint">
        Keep both tabs open and visible during the transfer. Closing or reloading either tab ends it. Files are held in memory on the receiving device, so very
        large files can fail, especially on phones. Under about 500 MB is a practical guideline, not a guarantee.
      </p>
      <Segmented label="Send or receive" value={cfg.view} options={VIEWS} onChange={(view) => setCfg({ view })} />
      {cfg.view === 'send' ? <SendPanel snap={snap} ice={cfg.ice} picked={picked} /> : <ReceivePanel snap={snap} ice={cfg.ice} />}
      <Status snap={snap} />
    </ToolPage>
  );
}
