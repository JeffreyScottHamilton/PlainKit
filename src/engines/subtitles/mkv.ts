import { ToolError } from '@/lib/errors';
import type { Cue } from './model';

// Reads TEXT subtitle tracks out of Matroska/WebM files (SRT-style, ASS/SSA, WebVTT).
// Picture-based subtitles (PGS, VobSub) and subtitles burned into the picture cannot be read as text.
// The file is walked element by element; only cluster data is loaded, one cluster at a time.

export type SubtitleTrack = { number: number; codec: string; language: string; name: string; text: boolean };
export type MkvSubtitles = { tracks: SubtitleTrack[]; cues: Map<number, Cue[]> };

const ID = {
  ebml: 0x1a45dfa3, segment: 0x18538067, info: 0x1549a966, timecodeScale: 0x2ad7b1, tracks: 0x1654ae6b, trackEntry: 0xae, trackNumber: 0xd7,
  trackType: 0x83, codecId: 0x86, language: 0x22b59c, languageBcp47: 0x22b59d, name: 0x536e, cluster: 0x1f43b675, timecode: 0xe7,
  simpleBlock: 0xa3, blockGroup: 0xa0, block: 0xa1, blockDuration: 0x9b,
} as const;
const TEXT_CODECS = ['S_TEXT/UTF8', 'S_TEXT/ASS', 'S_TEXT/SSA', 'S_TEXT/WEBVTT', 'D_WEBVTT/SUBTITLES', 'D_WEBVTT/CAPTIONS'];
const MAX_ELEMENT = 256 * 1024 * 1024;
const notMkv = () => new ToolError('not-matroska', 'This is not a Matroska or WebM file.', 'Embedded subtitles can be read from .mkv and .webm files only.');

type Head = { id: number; size: number; headLen: number; unknown: boolean };

/** EBML element header at offset: variable-length ID then variable-length size. */
export function readHead(b: Uint8Array, o: number): Head | null {
  if (o >= b.length) return null;
  const first = b[o]!;
  let idLen = 1;
  while (idLen <= 4 && !(first & (0x80 >> (idLen - 1)))) idLen++;
  if (idLen > 4 || o + idLen >= b.length) return null;
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + b[o + i]!;
  const s0 = b[o + idLen]!;
  let sLen = 1;
  while (sLen <= 8 && !(s0 & (0x80 >> (sLen - 1)))) sLen++;
  if (sLen > 8 || o + idLen + sLen > b.length) return null;
  let size = s0 & (0xff >> sLen);
  let allOnes = size === 0xff >> sLen;
  for (let i = 1; i < sLen; i++) {
    const v = b[o + idLen + i]!;
    if (v !== 0xff) allOnes = false;
    size = size * 256 + v;
  }
  return { id, size, headLen: idLen + sLen, unknown: allOnes };
}

const uint = (b: Uint8Array) => b.reduce((n, v) => n * 256 + v, 0);
const utf8 = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0+$/, '');

function* children(b: Uint8Array, start: number, end: number): Generator<{ id: number; data: Uint8Array }> {
  let o = start;
  while (o < end) {
    const h = readHead(b, o);
    if (!h) return;
    const dataEnd = h.unknown ? end : Math.min(end, o + h.headLen + h.size);
    yield { id: h.id, data: b.subarray(o + h.headLen, dataEnd) };
    o = dataEnd;
  }
}

function parseTracks(data: Uint8Array): SubtitleTrack[] {
  const out: SubtitleTrack[] = [];
  for (const el of children(data, 0, data.length)) {
    if (el.id !== ID.trackEntry) continue;
    let number = 0, type = 0, codec = '', language = 'und', name = '';
    for (const f of children(el.data, 0, el.data.length)) {
      if (f.id === ID.trackNumber) number = uint(f.data);
      else if (f.id === ID.trackType) type = uint(f.data);
      else if (f.id === ID.codecId) codec = utf8(f.data);
      else if (f.id === ID.language || f.id === ID.languageBcp47) language = utf8(f.data) || language;
      else if (f.id === ID.name) name = utf8(f.data);
    }
    if (type === 0x11) out.push({ number, codec, language, name, text: TEXT_CODECS.includes(codec) });
  }
  return out;
}

/** ASS/SSA block payload: "ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text". Styling is dropped. */
export function assText(payload: string): string {
  let i = -1;
  for (let n = 0; n < 8; n++) {
    i = payload.indexOf(',', i + 1);
    if (i < 0) return payload;
  }
  return payload.slice(i + 1).replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ').trim();
}

function parseBlock(data: Uint8Array): { track: number; rel: number; payload: Uint8Array } | null {
  const first = data[0];
  if (first === undefined) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || data.length < len + 3) return null;
  let track = first & (0xff >> len);
  for (let i = 1; i < len; i++) track = track * 256 + data[i]!;
  const rel = new DataView(data.buffer, data.byteOffset + len, 2).getInt16(0);
  return { track, rel, payload: data.subarray(len + 3) };
}

const provisional = new WeakSet<Cue>();
type ClusterState = { base: number };

/** One element inside a cluster. Shared by sized clusters (parsed in memory) and unknown-size ones (walked in place). */
function clusterChild(id: number, data: Uint8Array, state: ClusterState, scaleMs: number, tracks: Map<number, SubtitleTrack>, out: Map<number, Cue[]>) {
  const add = (blockData: Uint8Array, duration: number | null) => {
    const blk = parseBlock(blockData);
    if (!blk) return;
    const t = tracks.get(blk.track);
    if (!t?.text) return;
    const raw = utf8(blk.payload);
    const text = (t.codec === 'S_TEXT/ASS' || t.codec === 'S_TEXT/SSA' ? assText(raw) : raw).replace(/\r\n/g, '\n').trim();
    if (!text) return;
    const start = Math.max(0, Math.round((state.base + blk.rel) * scaleMs));
    // A block with no duration (SimpleBlock) gets a provisional 2 s, fixed up against the next cue below.
    const end = start + (duration !== null ? Math.max(1, Math.round(duration * scaleMs)) : 2000);
    const cue: Cue = { start, end, text };
    if (duration === null) provisional.add(cue);
    out.get(t.number)!.push(cue);
  };
  if (id === ID.timecode) state.base = uint(data);
  else if (id === ID.simpleBlock) add(data, null);
  else if (id === ID.blockGroup) {
    let block: Uint8Array | null = null;
    let dur: number | null = null;
    for (const f of children(data, 0, data.length)) {
      if (f.id === ID.block) block = f.data;
      else if (f.id === ID.blockDuration) dur = uint(f.data);
    }
    if (block) add(block, dur);
  }
}

function parseCluster(data: Uint8Array, scaleMs: number, tracks: Map<number, SubtitleTrack>, out: Map<number, Cue[]>) {
  const state: ClusterState = { base: 0 };
  for (const el of children(data, 0, data.length)) clusterChild(el.id, el.data, state, scaleMs, tracks, out);
}

/** Walks the file. onProgress gets a real fraction (bytes scanned / file size). */
export async function readMkvSubtitles(file: Blob, opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}): Promise<MkvSubtitles> {
  const read = async (o: number, n: number) => new Uint8Array(await file.slice(o, Math.min(file.size, o + n)).arrayBuffer());
  const top = readHead(await read(0, 16), 0);
  if (!top || top.id !== ID.ebml) throw notMkv();
  let o = top.headLen + top.size;
  const seg = readHead(await read(o, 16), 0);
  if (!seg || seg.id !== ID.segment) throw notMkv();
  o += seg.headLen;
  const end = seg.unknown ? file.size : Math.min(file.size, o + seg.size);

  let scaleMs = 1; // TimecodeScale default is 1,000,000 ns = 1 ms
  let tracks: SubtitleTrack[] = [];
  const byNumber = new Map<number, SubtitleTrack>();
  const cues = new Map<number, Cue[]>();
  const open: ClusterState = { base: 0 };
  let inOpenCluster = false;
  while (o < end) {
    if (opts.signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    const h = readHead(await read(o, 16), 0);
    if (!h) break;
    // A cluster written without a size (live recordings) has no end marker: step inside it and treat what follows
    // as its children until the next top-level element.
    if (h.id === ID.cluster && h.unknown) {
      open.base = 0;
      inOpenCluster = true;
      o += h.headLen;
      continue;
    }
    if (inOpenCluster && (h.id === ID.timecode || h.id === ID.simpleBlock || h.id === ID.blockGroup)) {
      if (h.unknown || h.size > MAX_ELEMENT) break;
      const wantedChild = h.id === ID.timecode || tracks.some((t) => t.text);
      if (wantedChild) clusterChild(h.id, await read(o + h.headLen, h.size), open, scaleMs, byNumber, cues);
      o += h.headLen + h.size;
      opts.onProgress?.(Math.min(1, o / file.size));
      continue;
    }
    const size = h.unknown ? end - o - h.headLen : h.size;
    const wanted = h.id === ID.info || h.id === ID.tracks || (h.id === ID.cluster && tracks.some((t) => t.text));
    if (wanted) {
      if (size > MAX_ELEMENT) throw new ToolError('mkv-too-large', 'This file has a section too large to read in the browser.', 'Try a smaller file.');
      const data = await read(o + h.headLen, size);
      if (h.id === ID.info) {
        for (const f of children(data, 0, data.length)) if (f.id === ID.timecodeScale) scaleMs = uint(f.data) / 1e6;
      } else if (h.id === ID.tracks) {
        tracks = parseTracks(data);
        tracks.forEach((t) => {
          byNumber.set(t.number, t);
          if (t.text) cues.set(t.number, []);
        });
      } else parseCluster(data, scaleMs, byNumber, cues);
    }
    o += h.headLen + size;
    opts.onProgress?.(Math.min(1, o / file.size));
  }
  for (const list of cues.values()) {
    list.sort((a, b) => a.start - b.start);
    // Cues that had no stored duration end at the next cue if that comes sooner than the provisional 2 s.
    for (let i = 0; i + 1 < list.length; i++) if (provisional.has(list[i]!) && list[i]!.end > list[i + 1]!.start) list[i]!.end = Math.max(list[i]!.start + 1, list[i + 1]!.start);
  }
  return { tracks, cues };
}
