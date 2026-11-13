# Licences

Direct dependencies, read from installed package metadata on 2026-11-11. Exact versions are pinned in `package-lock.json`. `npm audit --omit=dev`: 0 findings at install.

| Package | Version | Licence | Use |
|---|---|---|---|
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | runtime |
| cronstrue | 3.39.0 | MIT | runtime |
| diff | 9.0.0 | BSD-3-Clause | runtime |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) | runtime |
| exifr | 7.1.3 | MIT | runtime |
| jsqr | 1.4.0 | Apache-2.0 | runtime |
| libheif-js | 1.23.5 | **LGPL-3.0** | runtime, HEIC decoding only. Served as a separate unmodified file (`/engines/libheif/`), loaded on demand, with its licence and a notice beside it |
| lucide-react | 1.72.0 | ISC | runtime |
| marked | 18.2.0 | MIT | runtime |
| mediabunny | 1.65.2 | MPL-2.0 (used unmodified) | runtime |
| onnxruntime-web | 1.31.1 | MIT | runtime (Cutout only, loaded on demand) |
| papaparse | 5.7.1 | MIT | runtime |
| pdf-lib | 1.17.1 | MIT | runtime |
| pdfjs-dist | 6.5.438 | Apache-2.0 | runtime |
| qrcode | 1.5.4 | MIT | runtime |
| react | 19.3.1 | MIT | runtime |
| react-dom | 19.3.1 | MIT | runtime |
| react-router-dom | 7.18.5 | MIT | runtime |
| @axe-core/playwright | 4.14.0 | MPL-2.0 | dev only |
| @playwright/test | 1.63.0 | Apache-2.0 | dev only |
| @types/node | 26.6.6 | MIT | dev only |
| @types/papaparse | 5.5.2 | MIT | dev only |
| @types/pngjs | 6.0.5 | MIT | dev only |
| @types/qrcode | 1.5.6 | MIT | dev only |
| @types/react | 19.3.0 | MIT | dev only |
| @types/react-dom | 19.3.0 | MIT | dev only |
| @vitejs/plugin-react | 6.3.0 | MIT | dev only |
| happy-dom | 21.0.4 | MIT | dev only |
| pngjs | 7.0.0 | MIT | dev only |
| typescript | 7.0.2 | Apache-2.0 | dev only |
| vite | 8.3.8 | MIT | dev only |
| vitest | 5.1.0 | MIT | dev only |

- Font: Inter (via @fontsource-variable/inter), SIL Open Font License 1.1, self-hosted.
- Icons: lucide-react, ISC.
- Model weights: U²-Net-p, Apache-2.0, self-hosted. See `docs/models.md`.
- Model weights: YuNet face detector (face_detection_yunet_2023mar), MIT via OpenCV Zoo, upstream weights BSD-3-Clause (Shiqi Yu), self-hosted. See `docs/models.md` and `public/models/yunet/`.
- Third-party Claude skills are listed in `docs/skills-manifest.md`.
- Transitive dependency licences have not been audited yet.
- Model weights: Spleeter 4 stems (Deezer, MIT) as ONNX fp16 via Best-Practice/spleeter-4stems-onnx (Apache-2.0 conversion derived from sherpa-onnx, Apache-2.0), self-hosted. Upstream weights-licence wording is an open question, see `docs/models.md` and `docs/audits/stems-feasibility.md`. Files in `public/models/spleeter-4stems/`.
- Model weights: Whisper tiny.en 8-bit ONNX (onnx-community/whisper-tiny.en), Apache-2.0 per the model cards, MIT upstream (OpenAI Whisper), self-hosted unmodified. See `docs/models.md` and `public/models/whisper-tiny-en/`.
- Runtime: @huggingface/transformers 4.3.2 (Apache-2.0) and its nested onnxruntime-web 1.31.0-dev (MIT), loaded on demand by the Subtitles transcription worker. Audio fixture `e2e/fixtures/jfk.wav`: JFK 1961 inaugural address excerpt, US federal-government work, treated as public domain.
