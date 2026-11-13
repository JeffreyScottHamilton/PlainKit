import {
  Layers, ArrowLeftRight, Crop, Code2, Info, Link2, Send, ScanFace, FileText, AudioLines, Captions, QrCode,
  Table, CircleUserRound, Type, SquarePlay, Monitor,
} from 'lucide-react';
import type { ToolDef } from './types';

const IMG = ['image/jpeg', 'image/png', 'image/webp'];

// Source of truth for sidebar, search, routes, handoff compatibility and privacy labels.
// Order is fixed by the brief. Exactly 17 entries. Gift Cards/CardTally is permanently excluded.
// maturity starts at "planned"; raise it only with evidence recorded in docs/feature-matrix.md.
export const TOOLS: ToolDef[] = [
  {
    id: 'compress', name: 'Compress', title: 'Compress files', description: 'Make images, video, audio and PDFs smaller.',
    aliases: ['ShrinkRay', 'Press'], keywords: ['shrink', 'reduce', 'smaller', 'optimize', 'resize', 'jpeg', 'png', 'webp'],
    category: 'image', accepts: [...IMG, 'video/*', 'audio/*', 'application/pdf'], produces: [...IMG, 'video/mp4', 'video/webm', 'audio/mp4', 'application/pdf'], icon: Layers, load: () => import('@/tools/compress'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Images: JPEG, PNG, WebP. Re-encoding removes metadata.', 'Video and audio are re-encoded with the encoders this browser has, so the available formats differ between browsers.', 'PDF: a lossless rewrite often saves little; flattening to images is lossy and removes selectable text.'],
  },
  {
    id: 'convert', name: 'Convert', title: 'Convert files', description: 'Change a file to another format from a tested list.',
    aliases: ['ConvertIt', 'Recast'], keywords: ['format', 'change', 'jpg to png', 'webp', 'export'],
    category: 'image', accepts: [...IMG, 'image/gif', 'image/bmp', 'image/avif', 'image/heic', 'image/heif', 'video/*', 'audio/*', 'application/pdf', 'model/*'], produces: [...IMG, 'video/mp4', 'video/webm', 'audio/mp4', 'audio/wav', 'application/pdf', 'model/stl'], icon: ArrowLeftRight, load: () => import('@/tools/convert'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Only the listed format pairs are supported.', 'Images: animation, layers and metadata are not carried over.', 'Audio and video: only formats this browser can encode. MP3 output is usually unavailable.', 'Documents: images to PDF and PDF pages to pictures only. No Word, Excel or PowerPoint.', '3D: OBJ, STL and PLY geometry only. No glTF, FBX, STEP or CAD.'],
  },
  {
    id: 'cutout', name: 'Cutout', title: 'Cut out background', description: 'Remove an image background on this device.',
    aliases: ['Silhouette', 'background remover', 'remove bg'], keywords: ['background', 'transparent', 'png', 'subject', 'mask'],
    category: 'image', accepts: IMG, produces: ['image/png'], icon: Crop, load: () => import('@/tools/cutout'),
    capabilities: ['WebAssembly'], network: 'on-device', assetDownloadBytes: 19_423_713, maturity: 'experimental',
    limitations: ['Needs a one-time model download before first use.', 'Hair, glass and fine edges are often imperfect.'],
  },
  {
    id: 'dev-tools', name: 'Dev tools', title: 'Dev tools', description: '40 small utilities for text, data and encoding.',
    aliases: ['DevToys', 'Gauge'], keywords: ['json', 'base64', 'jwt', 'regex', 'uuid', 'hash', 'timestamp', 'diff', 'markdown', 'password', 'cron', 'url', 'color'],
    category: 'text', accepts: [], produces: [], icon: Code2, load: () => import('@/tools/dev-tools'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['JWT decoding does not verify signatures.', 'Hash identification is a heuristic guess.'],
  },
  {
    id: 'metadata', name: 'Metadata', title: 'Photo metadata', description: 'See and remove EXIF, GPS and other photo metadata.',
    aliases: ['ExifErase', 'Scrub', 'exif'], keywords: ['exif', 'gps', 'location', 'privacy', 'strip', 'iptc', 'xmp'],
    category: 'image', accepts: IMG, produces: IMG, icon: Info, load: () => import('@/tools/metadata'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Cannot remove identifying details visible in the picture itself.', 'Not every possible hidden field is covered.'],
  },
  {
    id: 'clean-links', name: 'Clean links', title: 'Clean links', description: 'Remove tracking parameters from URLs.',
    aliases: ['LinkClean', 'Untrail'], keywords: ['utm', 'tracking', 'url', 'fbclid', 'gclid', 'share'],
    category: 'text', accepts: [], produces: [], icon: Link2, load: () => import('@/tools/clean-links'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Links are never opened or fetched.', 'Signed links can stop working if parameters are removed.'],
  },
  {
    id: 'send-files', name: 'Send files', title: 'Send files', description: 'Send files straight to another device.',
    aliases: ['FileBeam', 'Relay', 'airdrop'], keywords: ['transfer', 'share', 'p2p', 'webrtc', 'peer', 'device'],
    category: 'network', accepts: ['*/*'], produces: [], icon: Send, load: () => import('@/tools/send-files'),
    capabilities: ['RTCPeerConnection'], network: 'peer', assetDownloadBytes: 0, maturity: 'experimental',
    limitations: ['Both devices must stay open during the transfer.', 'Some networks block direct connections.'],
  },
  {
    id: 'redact', name: 'Redact', title: 'Redact images', description: 'Cover parts of an image with solid boxes, pixels or blur.',
    aliases: ['BlurIt', 'Veil', 'blur', 'censor'], keywords: ['hide', 'blackout', 'pixelate', 'face', 'privacy'],
    category: 'image', accepts: IMG, produces: ['image/png', 'image/jpeg'], icon: ScanFace, load: () => import('@/tools/redact'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Blur and pixelation can sometimes be reversed. Use solid boxes for sensitive text.', 'Face detection, when available, can miss faces.'],
  },
  {
    id: 'pdf', name: 'PDF', title: 'PDF pages', description: 'Merge, reorder, rotate, remove and extract PDF pages.',
    aliases: ['MergePDF', 'Bind', 'combine pdf', 'split pdf'], keywords: ['merge', 'split', 'extract', 'rotate', 'pages', 'reorder'],
    category: 'document', accepts: ['application/pdf'], produces: ['application/pdf'], icon: FileText, load: () => import('@/tools/pdf'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Password-protected PDFs are not supported.', 'Editing pages can invalidate digital signatures.', 'No OCR, text editing or PDF compression.'],
  },
  {
    id: 'audio-stems', name: 'Audio stems', title: 'Audio and stems', description: 'Pull the audio out of a video, or split a song into stems.',
    aliases: ['VoiceRip', 'Stems', 'vocal remover'], keywords: ['extract audio', 'vocals', 'instrumental', 'karaoke', 'wav', 'mp3'],
    category: 'media', accepts: ['video/*', 'audio/*'], produces: ['audio/wav'], icon: AudioLines, load: () => import('@/tools/audio-stems'),
    capabilities: ['AudioContext'], network: 'on-device', assetDownloadBytes: 93_705_412, maturity: 'working',
    limitations: ['Stem separation is experimental: up to 5 minutes of audio, four stems (vocals, drums, bass, other), with bleed and artefacts.', 'Stem separation needs a 94 MB download the first time and a lot of memory; it may fail on phones.', 'Nothing above about 11 kHz is separated cleanly.'],
  },
  {
    id: 'subtitles', name: 'Subtitles', title: 'Subtitles', description: 'Edit, shift and convert subtitles; read them from MKV; transcribe speech.',
    aliases: ['SubtitleLab', 'Caption', 'captions'], keywords: ['srt', 'vtt', 'timing', 'offset', 'transcribe', 'cue'],
    category: 'media', accepts: ['application/x-subrip', 'text/vtt', 'text/plain'], produces: ['application/x-subrip', 'text/vtt'], icon: Captions, load: () => import('@/tools/subtitles'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 55_801_212, maturity: 'working',
    limitations: ['Burned-in subtitles cannot be read as text.', 'Stored subtitle tracks can be read from MKV and WebM only, and only text formats (not PGS or VobSub).', 'Transcription is English only, needs a 55 MB download the first time, and makes mistakes.'],
  },
  {
    id: 'qr-code', name: 'QR code', title: 'QR code', description: 'Make a static QR code as PNG or SVG.',
    aliases: ['QRForge', 'Imprint'], keywords: ['qr', 'barcode', 'wifi', 'link', 'svg'],
    category: 'text', accepts: [], produces: ['image/png', 'image/svg+xml'], icon: QrCode, load: () => import('@/tools/qr-code'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Static codes only: the content is encoded directly, with no redirect or tracking.'],
  },
  {
    id: 'csv', name: 'CSV', title: 'CSV cleanup', description: 'Clean, dedupe and export CSV and TSV tables.',
    aliases: ['Cleansheet', 'Sift', 'spreadsheet'], keywords: ['tsv', 'table', 'dedupe', 'columns', 'json', 'excel'],
    category: 'data', accepts: ['text/csv', 'text/tab-separated-values', 'text/plain'], produces: ['text/csv', 'text/tab-separated-values', 'application/json'], icon: Table, load: () => import('@/tools/csv'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['The whole file is loaded into memory; very large files may not fit.'],
  },
  {
    id: 'id-photo', name: 'ID photo', title: 'ID photo', description: 'Crop a photo to passport and ID sizes with guides.',
    aliases: ['IDPhoto', 'Frame', 'passport photo'], keywords: ['passport', 'visa', 'crop', 'print', 'headshot'],
    category: 'image', accepts: IMG, produces: ['image/jpeg', 'application/pdf'], icon: CircleUserRound, load: () => import('@/tools/id-photo'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'experimental',
    limitations: ['Guides only. Acceptance is decided by the issuing authority, not by this tool.'],
  },
  {
    id: 'clean-text', name: 'Clean text', title: 'Clean text', description: 'Find and remove invisible characters in text.',
    aliases: ['Unmark', 'Reveal', 'zero width'], keywords: ['invisible', 'unicode', 'zero-width', 'hidden', 'whitespace', 'watermark'],
    category: 'text', accepts: ['text/plain'], produces: ['text/plain'], icon: Type, load: () => import('@/tools/clean-text'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Cannot detect AI-written text or remove every kind of watermark.'],
  },
  {
    id: 'video', name: 'Video', title: 'Video', description: 'Trim a local video, or save a direct media link.',
    aliases: ['VidGrab', 'Reel', 'video downloader'], keywords: ['trim', 'cut', 'download', 'hls', 'm3u8', 'mp4'],
    category: 'media', accepts: ['video/*'], produces: ['video/mp4', 'video/webm'], icon: SquarePlay, load: () => import('@/tools/video'),
    capabilities: ['WebCodecs'], network: 'on-device', networkNote: 'links contact their site', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Downloading from a link contacts that site and only works if the site allows it (CORS).', 'DRM-protected and platform-page videos are not supported.'],
  },
  {
    id: 'keep-awake', name: 'Keep awake', title: 'Keep awake', description: 'Stop this screen from sleeping while the tab is visible.',
    aliases: ['NoDoze', 'Watch', 'caffeine'], keywords: ['wake lock', 'screen', 'sleep', 'timer'],
    category: 'device', accepts: [], produces: [], icon: Monitor, load: () => import('@/tools/keep-awake'),
    capabilities: ['wakeLock'], network: 'on-device', assetDownloadBytes: 0, maturity: 'experimental',
    limitations: ['Only works while this tab is visible.', 'Cannot move the mouse, change chat presence, or override system lock policies.'],
  },
];

export const HOME_DIRECTORY: [string[], string[]] = [['compress', 'convert', 'pdf'], ['redact', 'cutout', 'csv']];
