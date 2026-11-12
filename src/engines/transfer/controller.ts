import { ToolError } from '@/lib/errors';
import { addGenerated } from '@/session/store';
import type { SessionAsset } from '@/session/types';
import { decodeCode, encodeCode, type CodePayload } from './codec';
import { Adler32, MAX_FILES, checkAlgFor, comparisonNumber, parseMsg, planChunks, sanitizeFilename, toHex, type CheckAlg, type FileMeta, type Msg } from './protocol';

// Module-level connection controller. It survives route changes; the UI only reads snapshots.
export type Role = 'sender' | 'receiver';
export type IceMode = 'direct' | 'stun';
export type TransferState =
  | 'idle'
  | 'creating-invite'
  | 'waiting-for-reply'
  | 'creating-reply'
  | 'connecting'
  | 'connected'
  | 'offering'
  | 'awaiting-accept'
  | 'transferring'
  | 'complete'
  | 'canceled'
  | 'failed'
  | 'expired';

/** The only helper server allowed: a public STUN URL. No TURN relay, no signalling server. */
export const STUN_URL = 'stun:stun.l.google.com:19302';
export const INVITE_MS = 10 * 60_000;
const GATHER_MS = 4_000;
const BUFFER_LOW = 1024 * 1024;
const PROGRESS_MS = 200;

export type Problem = { message: string; nextAction: string };
export type Progress = { sent: number; total: number; file: number; fileCount: number; fileName: string; fileSent: number; fileSize: number; startedAt: number };
export type Result = { name: string; size: number; check: CheckAlg; assetId: string | null };
export type OutFile = { name: string; mime: string; size: number; blob: Blob };

export type Snapshot = {
  state: TransferState;
  role: Role | null;
  /** Invite (sender) or reply (receiver) text to show. Null when nothing is pending. */
  code: string | null;
  expiresAt: number | null;
  problem: Problem | null;
  notice: string;
  /** Six-digit comparison number, once connected. */
  comparison: string | null;
  files: FileMeta[];
  progress: Progress | null;
  results: Result[];
  /** Polite live-region text. Changes on major transitions only, never per percent. */
  announcement: string;
};

const LIVE = new Set<TransferState>([
  'creating-invite',
  'waiting-for-reply',
  'creating-reply',
  'connecting',
  'connected',
  'offering',
  'awaiting-accept',
  'transferring',
]);
export function isLive(state: TransferState): boolean {
  return LIVE.has(state);
}

export function iceServersFor(mode: IceMode): RTCIceServer[] {
  return mode === 'stun' ? [{ urls: STUN_URL }] : [];
}

const CONNECT_FAIL: Problem = { message: 'Could not set up the connection.', nextAction: 'Create a new invite and send again.' };
const PROTO_FAIL: Problem = { message: 'The other device sent something this app does not understand.', nextAction: 'Create a new invite and send again.' };
const LOST: Problem = { message: 'The connection was lost.', nextAction: 'Create a new invite and send again.' };
const NOT_CONNECTED: Problem = {
  message: 'Could not connect directly to the other device.',
  nextAction: 'Create a new invite and send again. Some networks block direct connections, and there is no relay here.',
};
const BUSY: Problem = { message: 'A connection is already open.', nextAction: 'Disconnect first, then try again.' };
const NO_OPEN_INVITE: Problem = { message: 'This invite is no longer open.', nextAction: 'It was already used or it expired. Create a new invite.' };
const RECEIVER_FAIL: Problem = { message: 'Could not use this invite code.', nextAction: 'Check that you copied the whole invite code, or ask the other device for a new invite.' };
const REPLY_FAIL: Problem = { message: 'The reply code could not be used.', nextAction: 'Check that you copied the whole reply code, or create a new invite.' };

const problemOf = (e: unknown, fallback: Problem): Problem =>
  e instanceof ToolError ? { message: e.message, nextAction: e.nextAction ?? fallback.nextAction } : fallback;

const CLEAR: Partial<Snapshot> = { code: null, expiresAt: null, problem: null, notice: '', comparison: null, files: [], progress: null, results: [] };
const IDLE: Snapshot = { state: 'idle', role: null, code: null, expiresAt: null, problem: null, notice: '', comparison: null, files: [], progress: null, results: [], announcement: '' };

export type Deliver = (f: { name: string; mime: string; blob: Blob }) => SessionAsset;

export type Transfer = {
  getState(): Snapshot;
  subscribe(fn: () => void): () => void;
  createInvite(mode: IceMode): Promise<void>;
  acceptInvite(text: string, mode: IceMode): Promise<void>;
  pasteReply(text: string): Promise<void>;
  sendOffer(files: OutFile[]): void;
  acceptOffer(): void;
  declineOffer(): void;
  /** Cancels an active transfer, or disconnects and resets to idle. Closes everything. */
  disconnect(): void;
};

export function createTransfer(deliver: Deliver): Transfer {
  let s: Snapshot = IDLE;
  const subs = new Set<() => void>();
  // Every async step checks that its session number is still current. teardown() bumps it.
  let session = 0;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let expiry: ReturnType<typeof setTimeout> | null = null;
  let wakeDrain: (() => void) | null = null;
  let outgoing: OutFile[] = [];
  let incoming: FileMeta[] = [];
  let nextIndex = 0;
  let rx: { index: number; chunks: ArrayBuffer[]; bytes: number; adler: Adler32 } | null = null;
  let chain: Promise<void> = Promise.resolve();
  let replyInFlight = false;
  let lastNotify = 0;
  let startedAt = 0;

  const notify = () => subs.forEach((f) => f());
  const set = (p: Partial<Snapshot>) => {
    s = { ...s, ...p };
    lastNotify = Date.now();
    notify();
  };
  const setProgress = (p: Progress) => {
    s = { ...s, progress: p };
    if (Date.now() - lastNotify >= PROGRESS_MS) {
      lastNotify = Date.now();
      notify();
    }
  };

  function teardown() {
    session++;
    if (expiry !== null) clearTimeout(expiry);
    expiry = null;
    const w = wakeDrain;
    wakeDrain = null;
    w?.();
    const ch = dc;
    const p = pc;
    dc = null;
    pc = null;
    rx = null;
    outgoing = [];
    incoming = [];
    nextIndex = 0;
    try {
      ch?.close();
    } catch {
      /* already closed */
    }
    try {
      p?.close();
    } catch {
      /* already closed */
    }
  }

  function fail(problem: Problem, announcement: string) {
    teardown();
    set({ state: 'failed', problem, progress: null, code: null, expiresAt: null, files: [], announcement });
  }

  function endTransfer(state: 'canceled', notice: string) {
    teardown();
    set({ state, notice, problem: null, progress: null, code: null, expiresAt: null, files: [], announcement: notice });
  }

  function expire() {
    teardown();
    set({
      state: 'expired',
      code: null,
      expiresAt: null,
      notice: 'This invite expired after 10 minutes. Create a new invite to try again.',
      announcement: 'Invite expired.',
    });
  }

  function sendCtl(m: Msg): boolean {
    const ch = dc;
    if (!ch || ch.readyState !== 'open') return false;
    try {
      ch.send(JSON.stringify(m));
      return true;
    } catch {
      return false;
    }
  }

  function protoFail() {
    fail(PROTO_FAIL, 'Protocol error.');
  }

  function onLost() {
    if (!LIVE.has(s.state)) return;
    const early = s.state !== 'connected' && s.state !== 'offering' && s.state !== 'awaiting-accept' && s.state !== 'transferring';
    if (early) fail(NOT_CONNECTED, 'Could not connect directly.');
    else fail(LOST, 'The connection was lost.');
  }

  function failFile(name: string, why: string) {
    sendCtl({ type: 'cancel', reason: 'integrity' });
    const message = `"${name}" could not be verified: ${why} Its partial data was discarded.`;
    fail({ message, nextAction: 'Create a new invite and send again.' }, `"${name}" could not be verified.`);
  }

  /** Waits until ICE gathering completes, or the timeout passes. Candidates are then in the SDP. */
  function gather(p: RTCPeerConnection): Promise<void> {
    if (p.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        p.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (p.iceGatheringState === 'complete') done();
      };
      const timer = setTimeout(done, GATHER_MS);
      p.addEventListener('icegatheringstatechange', check);
    });
  }

  function wireChannel(ch: RTCDataChannel, mine: number) {
    dc = ch;
    ch.binaryType = 'arraybuffer';
    ch.bufferedAmountLowThreshold = BUFFER_LOW;
    ch.onopen = () => {
      if (mine === session) onOpen(mine);
    };
    ch.onclose = () => {
      if (mine === session) onLost();
    };
    ch.onmessage = (e: MessageEvent) => {
      if (mine === session) onData(mine, e.data);
    };
    ch.onbufferedamountlow = () => {
      const w = wakeDrain;
      wakeDrain = null;
      w?.();
    };
    if (ch.readyState === 'open') onOpen(mine);
  }

  function onOpen(mine: number) {
    if (s.state !== 'connecting' && s.state !== 'creating-reply') return;
    set({ state: 'connected', problem: null, announcement: 'Connected directly to the other device. Compare the numbers on both devices.' });
    const local = pc?.localDescription?.sdp;
    const remote = pc?.remoteDescription?.sdp;
    if (local && remote)
      void comparisonNumber(local, remote).then((c) => {
        if (mine === session) set({ comparison: c });
      });
  }

  async function createInvite(mode: IceMode) {
    if (LIVE.has(s.state)) return set({ problem: BUSY });
    teardown();
    const mine = session;
    const p = new RTCPeerConnection({ iceServers: iceServersFor(mode) });
    pc = p;
    p.onconnectionstatechange = () => {
      if (mine === session && p.connectionState === 'failed') onLost();
    };
    wireChannel(p.createDataChannel('files', { ordered: true }), mine);
    set({ ...CLEAR, state: 'creating-invite', role: 'sender', announcement: 'Creating invite.' });
    try {
      await p.setLocalDescription(await p.createOffer());
      await gather(p);
      const sdp = p.localDescription?.sdp;
      if (!sdp) throw new ToolError('no-sdp', 'The connection did not produce an invite.', 'Try again.');
      const code = await encodeCode({ v: 1, type: 'offer', sdp });
      if (mine !== session) return;
      expiry = setTimeout(() => {
        if (mine === session && s.state === 'waiting-for-reply') expire();
      }, INVITE_MS);
      set({ state: 'waiting-for-reply', code, expiresAt: Date.now() + INVITE_MS, announcement: 'Invite ready. Send the code to the other device.' });
    } catch (e) {
      if (mine === session) fail(problemOf(e, CONNECT_FAIL), 'Could not create the invite.');
    }
  }

  async function acceptInvite(text: string, mode: IceMode) {
    if (LIVE.has(s.state)) return set({ problem: BUSY });
    let payload: CodePayload;
    try {
      payload = await decodeCode(text, 'offer');
    } catch (e) {
      return set({ problem: problemOf(e, RECEIVER_FAIL) });
    }
    teardown();
    const mine = session;
    const p = new RTCPeerConnection({ iceServers: iceServersFor(mode) });
    pc = p;
    p.ondatachannel = (ev) => {
      if (mine === session) wireChannel(ev.channel, mine);
    };
    p.onconnectionstatechange = () => {
      if (mine === session && p.connectionState === 'failed') onLost();
    };
    set({ ...CLEAR, state: 'creating-reply', role: 'receiver', announcement: 'Creating reply.' });
    try {
      await p.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      await p.setLocalDescription(await p.createAnswer());
      await gather(p);
      const sdp = p.localDescription?.sdp;
      if (!sdp) throw new ToolError('no-sdp', 'The connection did not produce a reply.', 'Try again.');
      const code = await encodeCode({ v: 1, type: 'answer', sdp });
      if (mine === session) set({ state: 'connecting', code, announcement: 'Reply ready. Send it back to the other device.' });
    } catch (e) {
      if (mine === session) fail(problemOf(e, RECEIVER_FAIL), 'Could not use the invite.');
    }
  }

  async function pasteReply(text: string) {
    if (s.state !== 'waiting-for-reply' || pc === null) return set({ problem: NO_OPEN_INVITE });
    if (replyInFlight) return;
    replyInFlight = true;
    const mine = session;
    const p = pc;
    try {
      const payload = await decodeCode(text, 'answer');
      if (mine !== session) return;
      await p.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      if (mine !== session) return;
      if (expiry !== null) clearTimeout(expiry);
      expiry = null;
      set({ ...CLEAR, state: 'connecting', announcement: 'Reply accepted. Connecting.' });
    } catch (e) {
      if (mine === session) set({ problem: problemOf(e, REPLY_FAIL) });
    } finally {
      replyInFlight = false;
    }
  }

  function sendOffer(files: OutFile[]) {
    if (s.state !== 'connected' || s.role !== 'sender') return;
    if (files.length === 0 || files.length > MAX_FILES)
      return set({ problem: { message: `Choose between 1 and ${MAX_FILES} files.`, nextAction: 'Adjust the file list, then send again.' } });
    outgoing = files;
    const metas: FileMeta[] = files.map((f) => ({ name: f.name, size: f.size, mime: f.mime }));
    if (!sendCtl({ type: 'offer', files: metas })) return onLost();
    set({ state: 'offering', files: metas, problem: null, announcement: 'Offer sent. Waiting for the other device to accept.' });
  }

  function acceptOffer() {
    if (s.state !== 'awaiting-accept') return;
    startedAt = Date.now();
    set({ state: 'transferring', announcement: 'Transfer started.' });
    if (!sendCtl({ type: 'accept' })) onLost();
  }

  function declineOffer() {
    if (s.state !== 'awaiting-accept') return;
    sendCtl({ type: 'decline' });
    endTransfer('canceled', 'You declined. No file bytes were sent.');
  }

  function disconnect() {
    const st = s.state;
    if (st === 'transferring' || st === 'offering' || st === 'awaiting-accept') {
      sendCtl({ type: 'cancel', reason: 'user' });
      endTransfer('canceled', st === 'transferring' ? 'You canceled the transfer. Partial data was discarded.' : 'Canceled. No file bytes were sent.');
      return;
    }
    teardown();
    set({ ...CLEAR, state: 'idle', role: null, announcement: 'Disconnected.' });
  }

  /** Waits while the send buffer is above the low-water mark. Teardown wakes it. */
  async function waitDrain(mine: number) {
    while (mine === session && dc && dc.bufferedAmount > BUFFER_LOW) {
      await new Promise<void>((resolve) => {
        wakeDrain = resolve;
      });
    }
  }

  async function runSend() {
    const mine = session;
    const files = outgoing;
    const total = files.reduce((t, f) => t + f.size, 0);
    startedAt = Date.now();
    let sent = 0;
    set({ state: 'transferring', announcement: 'Transfer started.' });
    try {
      for (const [i, f] of files.entries()) {
        const alg = checkAlgFor(f.size);
        // Whole-file SHA-256 only for files within the limit; larger files use the streamed Adler-32.
        const shaHex = alg === 'sha-256' ? toHex(await crypto.subtle.digest('SHA-256', await f.blob.arrayBuffer())) : null;
        if (mine !== session) return;
        const adler = new Adler32();
        if (!sendCtl({ type: 'file-start', index: i })) throw new Error('channel closed');
        for (const { offset, length } of planChunks(f.size)) {
          await waitDrain(mine);
          if (mine !== session) return;
          const buf = await f.blob.slice(offset, offset + length).arrayBuffer();
          if (mine !== session || !dc) return;
          if (alg === 'adler32') adler.update(new Uint8Array(buf));
          dc.send(buf);
          sent += buf.byteLength;
          setProgress({ sent, total, file: i + 1, fileCount: files.length, fileName: f.name, fileSent: offset + length, fileSize: f.size, startedAt });
        }
        if (!sendCtl({ type: 'file-end', index: i, bytes: f.size, check: { alg, hex: shaHex ?? adler.hex() } })) throw new Error('channel closed');
      }
      if (!sendCtl({ type: 'done' })) throw new Error('channel closed');
      set({ announcement: 'All files sent. Waiting for the other device to confirm.' });
    } catch {
      if (mine === session) onLost();
    }
  }

  function receiveProgress(fileBytes: number): Progress {
    const total = incoming.reduce((t, f) => t + f.size, 0);
    const before = incoming.slice(0, nextIndex).reduce((t, f) => t + f.size, 0);
    const meta = incoming[nextIndex];
    return {
      sent: before + fileBytes,
      total,
      file: nextIndex + 1,
      fileCount: incoming.length,
      fileName: meta?.name ?? '',
      fileSent: fileBytes,
      fileSize: meta?.size ?? 0,
      startedAt,
    };
  }

  function onChunk(buf: ArrayBuffer) {
    const cur = rx;
    if (!cur || s.state !== 'transferring') return protoFail();
    const meta = incoming[cur.index];
    if (!meta) return protoFail();
    cur.bytes += buf.byteLength;
    if (cur.bytes > meta.size) return failFile(meta.name, 'It is larger than the device offered.');
    cur.chunks.push(buf);
    cur.adler.update(new Uint8Array(buf));
    setProgress(receiveProgress(cur.bytes));
  }

  async function onControl(mine: number, text: string) {
    let m: Msg;
    try {
      m = parseMsg(text);
    } catch {
      return protoFail();
    }
    const sender = s.role === 'sender';
    switch (m.type) {
      case 'offer': {
        if (sender || s.state !== 'connected' || m.files.length === 0) return protoFail();
        incoming = m.files.map((f) => ({ ...f, name: sanitizeFilename(f.name) }));
        nextIndex = 0;
        const n = incoming.length;
        return set({ state: 'awaiting-accept', files: incoming, problem: null, announcement: `${n} ${n === 1 ? 'file' : 'files'} offered. Accept or decline.` });
      }
      case 'accept':
        if (!sender || s.state !== 'offering') return protoFail();
        void runSend();
        return;
      case 'decline':
        if (!sender || s.state !== 'offering') return protoFail();
        return endTransfer('canceled', 'Declined by the other device. No file bytes were sent.');
      case 'cancel':
        if (!LIVE.has(s.state) && s.state !== 'complete') return;
        return endTransfer(
          'canceled',
          m.reason === 'integrity'
            ? 'The other device rejected a file because it did not match what was sent. Partial data was discarded.'
            : 'Canceled by the other device. Partial data was discarded.',
        );
      case 'file-start':
        if (sender || s.state !== 'transferring' || rx !== null || m.index !== nextIndex || m.index >= incoming.length) return protoFail();
        rx = { index: m.index, chunks: [], bytes: 0, adler: new Adler32() };
        return;
      case 'file-end': {
        const cur = rx;
        if (sender || !cur || cur.index !== m.index) return protoFail();
        rx = null;
        const meta = incoming[cur.index];
        if (!meta) return protoFail();
        if (cur.bytes !== meta.size || m.bytes !== meta.size) return failFile(meta.name, 'The size did not match.');
        const blob = new Blob(cur.chunks, { type: meta.mime });
        const actual = m.check.alg === 'sha-256' ? toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())) : cur.adler.hex();
        if (mine !== session) return;
        if (actual !== m.check.hex) return failFile(meta.name, 'The contents did not match.');
        const progress = receiveProgress(meta.size);
        const asset = deliver({ name: meta.name, mime: meta.mime, blob });
        nextIndex = cur.index + 1;
        return set({
          progress,
          results: [...s.results, { name: meta.name, size: meta.size, check: m.check.alg, assetId: asset.id }],
        });
      }
      case 'done':
        if (sender || s.state !== 'transferring' || rx !== null || nextIndex !== incoming.length) return protoFail();
        sendCtl({ type: 'verified' });
        return set({ state: 'complete', progress: null, announcement: 'Transfer complete. Every file was verified.' });
      case 'verified': {
        if (!sender || s.state !== 'transferring') return protoFail();
        const results: Result[] = outgoing.map((f) => ({ name: f.name, size: f.size, check: checkAlgFor(f.size), assetId: null }));
        outgoing = [];
        return set({ state: 'complete', progress: null, results, announcement: 'Transfer complete. The other device verified every file.' });
      }
    }
  }

  /** Control messages and chunks are handled strictly in arrival order, one at a time. */
  function onData(mine: number, data: unknown) {
    chain = chain
      .then(async () => {
        if (mine !== session) return;
        if (typeof data === 'string') await onControl(mine, data);
        else if (data instanceof ArrayBuffer) onChunk(data);
        else protoFail();
      })
      .catch(() => {
        if (mine === session) protoFail();
      });
  }

  return {
    getState: () => s,
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    createInvite,
    acceptInvite,
    pasteReply,
    sendOffer,
    acceptOffer,
    declineOffer,
    disconnect,
  };
}

/** The app-wide controller. Received files are added to the session tray as generated assets. */
export const transfer: Transfer = createTransfer((f) => addGenerated({ ...f, parentIds: [] }));
