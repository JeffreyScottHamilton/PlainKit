# Progress

- 2026-11-11 — Setup checkpoint; Gate 1 foundation; Gate 2 shell; Gate 3 compress → convert slice.
- 2026-11-11/12 — Gate 4 everyday tools: dev tools (40), PDF, clean links, clean text, QR, keep awake, CSV, subtitles, metadata, redact.
- 2026-11-12 — Gate 5: Cutout (U²-Net-p, self-hosted), ID photo, audio extraction. Stem separation, transcription, face detection: not offered.
- 2026-11-12 — Gate 6: Send files (manual pairing), Video (trim, direct link, HLS VOD).
- 2026-11-12 — Gate 7: a11y audit 50/50, network audit clean, offline via service worker, production build + CSP, 452 unit and 144 browser tests, README, release notes.

- 2026-11-12/13 — "The rest": media conversion and compression, PDF compression, document and 3D conversion, face detection, MKV/WebM subtitle tracks, transcription, stem separation, HEIC.

- 2026-11-13 — Independent review and two visual sweeps with real inputs; fixes recorded in `docs/audits/review.md`.

- 2026-11-25 — New tools: Resize (crop/rotate/flip/batch), Recorder (screen/camera/voice), Sign PDF, Zip. Improved PDF (split, page numbers), QR (email/phone/SMS), Clean links (redirect unwrapping), Compress (size presets). 23 tools; 704 unit and 206 browser tests pass.
- 2026-11-25 (round 2) — New tools: Watermark (text/logo, tiled or corner), Audio trim (cut, fade, normalize, WAV/M4A/WebM), Image to text (self-hosted Tesseract OCR, images and PDFs). Improved Video (remove audio, save frame), Metadata (removal summary, location badge), CSV (sort, JSON import). 26 tools; 774 unit and 216 browser tests pass.

## Open (needs the owner or real hardware)
- First Vercel deploy (site is ~160 MB; limits unchecked).
- Real phone, Safari and Firefox.
- ID photo presets against official sources; a clearer head-position guide.
- Real music for stems, noisy or long speech for transcription, iPhone photos (rotated, HDR, Live) for HEIC.
- Send files between two real devices on different networks.
- Licence decisions to confirm: libheif (LGPL-3.0); Spleeter weights (MIT per the paper, see `docs/audits/stems-feasibility.md`).

## Open (cleanup)
- Model download and cache code is duplicated across Cutout, face detection, stems and transcription.
