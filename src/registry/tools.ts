import {
  Layers, ArrowLeftRight, Crop, Code2, Info, Link2, Send, ScanFace, FileText, AudioLines, Captions, QrCode,
  Table, CircleUserRound, Type, SquarePlay, Monitor, Palette, Film, Scaling, Signature, FileArchive, ScreenShare, Stamp, AudioWaveform, ScanText,
} from 'lucide-react';
import type { ToolDef } from './types';

const IMG = ['image/jpeg', 'image/png', 'image/webp'];

// Source of truth for sidebar, search, routes, handoff compatibility and privacy labels.
// Order is fixed by the brief. Exactly 26 entries. Gift Cards/CardTally is permanently excluded.
// maturity starts at "planned"; raise it only with evidence recorded in docs/feature-matrix.md.
const ALL: ToolDef[] = [
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
    category: 'image', accepts: [...IMG, 'image/gif', 'image/bmp', 'image/avif', 'image/heic', 'image/heif', 'image/tiff', 'image/svg+xml', 'video/*', 'audio/*', 'application/pdf', 'model/*', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'text/html', 'application/msword', 'application/rtf', 'text/rtf', 'application/vnd.oasis.opendocument.text'], produces: [...IMG, 'video/mp4', 'video/webm', 'audio/mp4', 'audio/wav', 'application/pdf', 'model/stl', 'text/plain', 'text/markdown', 'text/html'], icon: ArrowLeftRight, load: () => import('@/tools/convert'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Only the listed format pairs are supported.', 'Images: animation, layers and metadata are not carried over.', 'Audio and video: only formats this browser can encode. MP3 output is usually unavailable.', 'Documents: DOCX, TXT, Markdown and HTML to PDF, text, Markdown or HTML (not Word to Word). PDF to text needs a text layer: scans are not read. Pictures are placed in PDF only as PNG or JPEG. Images to PDF and PDF pages to pictures also work.', 'Legacy .doc, .odt, .rtf, Pages, Excel and PowerPoint files are not supported: save them as .docx or PDF first.', '3D: OBJ, STL and PLY geometry only. No glTF, FBX, STEP or CAD.'],
  },
  {
    id: 'cutout', name: 'Cutout', title: 'Cut out background', description: 'Remove an image background on this device.',
    aliases: ['Silhouette', 'background remover', 'remove bg'], keywords: ['background', 'transparent', 'png', 'subject', 'mask'],
    category: 'image', accepts: IMG, produces: ['image/png'], icon: Crop, load: () => import('@/tools/cutout'),
    capabilities: ['WebAssembly'], network: 'on-device', assetDownloadBytes: 19_423_713, maturity: 'experimental',
    limitations: ['Needs a one-time model download before first use.', 'Hair, glass and fine edges are often imperfect.'],
  },
  {
    id: 'color-palette', name: 'Color palette', title: 'Color palette', description: 'Pull the main colors out of an image, or pick any pixel.',
    aliases: ['palette extractor', 'color picker', 'eyedropper', 'dominant colors'], keywords: ['colour', 'hex', 'rgb', 'hsl', 'swatch', 'css variables', 'theme'],
    category: 'image', accepts: [...IMG, 'image/gif', 'image/bmp', 'image/avif'], produces: ['image/png', 'text/css', 'text/plain'], icon: Palette, load: () => import('@/tools/color-palette'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Dominant colors are an estimate from a reduced copy of the image; very small accents can be missed.'],
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
    id: 'clean-links', name: 'Clean links', title: 'Clean links', description: 'Remove tracking and redirect wrappers from links.',
    aliases: ['LinkClean', 'Untrail'], keywords: ['utm', 'tracking', 'url', 'fbclid', 'gclid', 'share'],
    category: 'text', accepts: [], produces: [], icon: Link2, load: () => import('@/tools/clean-links'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Links are never opened or fetched. Redirect wrappers (Google, Facebook, Reddit, YouTube) are unwrapped only from the text of the link itself.', 'Signed links can stop working if parameters are removed.'],
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
    id: 'pdf', name: 'PDF', title: 'PDF pages', description: 'Merge, split, reorder, rotate and number PDF pages.',
    aliases: ['MergePDF', 'Bind', 'combine pdf', 'split pdf'], keywords: ['merge', 'split', 'extract', 'rotate', 'pages', 'reorder'],
    category: 'document', accepts: ['application/pdf'], produces: ['application/pdf'], icon: FileText, load: () => import('@/tools/pdf'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Password-protected PDFs are not supported.', 'Editing pages can invalidate digital signatures.', 'No OCR, text editing or PDF compression (Compress handles that).', 'Page numbers use a standard font: digits and plain Latin text only.'],
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
    id: 'qr-code', name: 'QR code', title: 'QR code', description: 'Make a QR code for a link, Wi-Fi, contact, email or phone.',
    aliases: ['QRForge', 'Imprint'], keywords: ['qr', 'barcode', 'wifi', 'link', 'svg'],
    category: 'text', accepts: [], produces: ['image/png', 'image/svg+xml'], icon: QrCode, load: () => import('@/tools/qr-code'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Static codes only: the content is encoded directly, with no redirect or tracking.'],
  },
  {
    id: 'csv', name: 'CSV', title: 'CSV cleanup', description: 'Clean, dedupe and export CSV and TSV tables.',
    aliases: ['Cleansheet', 'Sift', 'spreadsheet'], keywords: ['tsv', 'table', 'dedupe', 'columns', 'json', 'excel'],
    category: 'data', accepts: ['text/csv', 'text/tab-separated-values', 'text/plain', 'application/json'], produces: ['text/csv', 'text/tab-separated-values', 'application/json'], icon: Table, load: () => import('@/tools/csv'),
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
    id: 'video', name: 'Video', title: 'Video', description: 'Trim or mute a video, save a frame, or save a direct media link.',
    aliases: ['VidGrab', 'Reel', 'video downloader'], keywords: ['trim', 'cut', 'download', 'hls', 'm3u8', 'mp4'],
    category: 'media', accepts: ['video/*'], produces: ['video/mp4', 'video/webm'], icon: SquarePlay, load: () => import('@/tools/video'),
    capabilities: ['WebCodecs'], network: 'on-device', networkNote: 'links contact their site', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Downloading from a link contacts that site and only works if the site allows it (CORS).', 'DRM-protected and platform-page videos are not supported.'],
  },
  {
    id: 'gif', name: 'GIF maker', title: 'GIF maker', description: 'Make GIFs from video or images, or edit an existing GIF.',
    aliases: ['gif creator', 'gif editor', 'video to gif', 'animated gif'], keywords: ['gif', 'animation', 'frames', 'loop', 'fps', 'reverse', 'meme'],
    category: 'media', accepts: ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/*'], produces: ['image/gif'], icon: Film, load: () => import('@/tools/gif'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['GIF holds at most 256 colors per frame, so photos and gradients band.', 'Transparent areas become white, because the GIF is written without transparency.', 'Up to 600 frames, and frames larger than 1920×1080 are scaled down. Long or large videos are limited to keep the tab responsive.'],
  },
  {
    id: 'keep-awake', name: 'Keep awake', title: 'Keep awake', description: 'Stop this screen from sleeping while the tab is visible.',
    aliases: ['NoDoze', 'Watch', 'caffeine'], keywords: ['wake lock', 'screen', 'sleep', 'timer'],
    category: 'device', accepts: [], produces: [], icon: Monitor, load: () => import('@/tools/keep-awake'),
    capabilities: ['wakeLock'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Only works while this tab is visible.', 'Cannot move the mouse, change chat presence, or override system lock policies.'],
  },
  {
    id: 'resize', name: 'Resize', title: 'Resize and crop', description: 'Resize, crop, rotate and flip images, one or many at once.',
    aliases: ['image resizer', 'crop image', 'rotate image'], keywords: ['resize', 'crop', 'rotate', 'flip', 'dimensions', 'pixels', 'aspect ratio', 'thumbnail', 'instagram', 'scale'],
    category: 'image', accepts: [...IMG, 'image/gif', 'image/bmp', 'image/avif'], produces: IMG, icon: Scaling, load: () => import('@/tools/resize'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Animated images keep only the first frame.', 'Re-encoding removes metadata.'],
  },
  {
    id: 'recorder', name: 'Recorder', title: 'Screen and voice recorder', description: 'Record your screen, camera or microphone to a file.',
    aliases: ['screen recorder', 'voice recorder', 'webcam recorder'], keywords: ['record', 'screen', 'capture', 'microphone', 'voice memo', 'webcam', 'camera', 'screencast'],
    category: 'media', accepts: [], produces: ['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4'], icon: ScreenShare, load: () => import('@/tools/recorder'),
    capabilities: ['MediaRecorder'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Screen recording needs a desktop browser; phones usually cannot share the screen.', 'The file format depends on what this browser can record (usually WebM, MP4 in Safari).', 'System audio can only be captured when the browser offers it (Chrome tab or screen sharing).'],
  },
  {
    id: 'sign-pdf', name: 'Sign PDF', title: 'Sign and fill PDF', description: 'Add a signature, text, date or checkmark to a PDF.',
    aliases: ['esign', 'fill pdf', 'pdf signature'], keywords: ['sign', 'signature', 'initials', 'fill', 'form', 'date', 'annotate', 'text', 'checkmark'],
    category: 'document', accepts: ['application/pdf'], produces: ['application/pdf'], icon: Signature, load: () => import('@/tools/sign-pdf'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['This is a picture of a signature, not a certified digital signature.', 'Encrypted PDFs cannot be edited.'],
  },
  {
    id: 'zip', name: 'Zip', title: 'Zip and unzip', description: 'Pack files into a ZIP, or open a ZIP and take files out.',
    aliases: ['unzip', 'archive', 'extract zip', 'compress folder'], keywords: ['zip', 'unzip', 'archive', 'extract', 'bundle', 'folder'],
    category: 'data', accepts: ['*/*'], produces: ['application/zip'], icon: FileArchive, load: () => import('@/tools/zip'),
    capabilities: [], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Password-protected (encrypted) ZIPs cannot be opened.', 'Only ZIP: RAR, 7z and tar are not supported.'],
  },
  {
    id: 'watermark', name: 'Watermark', title: 'Watermark images', description: 'Add a text or logo watermark to one or many images.',
    aliases: ['add logo', 'copyright stamp'], keywords: ['watermark', 'logo', 'copyright', 'stamp', 'brand', 'overlay', 'protect', 'tile'],
    category: 'image', accepts: [...IMG, 'image/gif', 'image/bmp', 'image/avif'], produces: IMG, icon: Stamp, load: () => import('@/tools/watermark'),
    capabilities: ['OffscreenCanvas'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['A watermark discourages reuse but can be cropped or edited out.', 'Re-encoding removes metadata.'],
  },
  {
    id: 'audio-edit', name: 'Audio trim', title: 'Trim and adjust audio', description: 'Cut, fade, change volume and convert audio clips.',
    aliases: ['audio cutter', 'ringtone maker', 'mp3 cutter'], keywords: ['trim', 'cut', 'fade', 'volume', 'normalize', 'ringtone', 'clip', 'waveform', 'wav', 'mp3', 'm4a'],
    category: 'media', accepts: ['audio/*', 'video/*'], produces: ['audio/wav', 'audio/mp4', 'audio/webm'], icon: AudioWaveform, load: () => import('@/tools/audio-edit'),
    capabilities: ['AudioContext'], network: 'on-device', assetDownloadBytes: 0, maturity: 'working',
    limitations: ['Output formats depend on the encoders this browser has; WAV always works.', 'Very long files use a lot of memory because audio is decoded in full.'],
  },
  {
    id: 'ocr', name: 'Image to text', title: 'Image to text', description: 'Copy the text out of a screenshot, photo or scanned page.',
    aliases: ['ocr', 'text recognition', 'extract text'], keywords: ['ocr', 'scan', 'screenshot', 'copy text', 'read text', 'recognize', 'receipt', 'document'],
    category: 'text', accepts: [...IMG, 'image/gif', 'image/bmp', 'application/pdf'], produces: ['text/plain'], icon: ScanText, load: () => import('@/tools/ocr'),
    capabilities: ['WebAssembly'], network: 'on-device', assetDownloadBytes: 9_821_253, maturity: 'experimental',
    limitations: ['Needs a one-time download of the text recognition engine before first use.', 'Handwriting, low-contrast and curved text are often misread.'],
  },
];

export const TOOL_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Images', ids: ['compress', 'resize', 'convert', 'cutout', 'watermark', 'color-palette', 'metadata', 'redact', 'id-photo'] },
  { label: 'Video & audio', ids: ['video', 'recorder', 'gif', 'audio-edit', 'audio-stems', 'subtitles'] },
  { label: 'Documents & data', ids: ['pdf', 'sign-pdf', 'csv'] },
  { label: 'Text & code', ids: ['ocr', 'clean-text', 'clean-links', 'dev-tools', 'qr-code'] },
  { label: 'Share & device', ids: ['send-files', 'zip', 'keep-awake'] },
];

/** Every tool, in sidebar order (group by group). */
export const TOOLS: ToolDef[] = TOOL_GROUPS.flatMap((g) =>
  g.ids.map((id) => {
    const t = ALL.find((x) => x.id === id);
    if (!t) throw new Error(`TOOL_GROUPS names unknown tool: ${id}`);
    return t;
  }),
);
if (new Set(TOOLS).size !== ALL.length || TOOLS.length !== ALL.length) throw new Error('Every tool must belong to exactly one sidebar group');

export const HOME_DIRECTORY: [string[], string[]] = [['compress', 'convert', 'pdf'], ['redact', 'cutout', 'csv']];
