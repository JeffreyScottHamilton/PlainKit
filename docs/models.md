# Models

## Cutout: U²-Net-p (`u2netp`)

- **File**: `public/models/u2netp/model.onnx`, 4,574,861 bytes, SHA-256 in `NOTICE.md` next to it. Unmodified.
- **Source**: huggingface.co/BritishWerewolf/U-2-Netp at revision `7112208` (an ONNX export via rembg, MIT).
- **Licence**: Apache-2.0 for the original U²-Net code and weights (Xuebin Qin et al.). Full text is shipped beside the file. Self-hosting is redistribution under Apache-2.0 section 4.
- **Runtime**: onnxruntime-web 1.31.1 (MIT), WebAssembly, single thread, copied to `public/engines/ort/` at build time (14.8 MB, not committed). Both are served from the app's own origin: no CDN and no third-party request.
- **Input**: image stretched to 320×320, ImageNet mean/std. The matte is scaled back up to the original size.
- **Measured** (headless Chromium, Linux build container, 640×480 synthetic images, 2026-11-12): first run 3.4 s including model and engine download; later runs 2.5–3.1 s. Not measured on a phone or on real photographs.
- **What it is bad at**: it is a small salient-object model with a 320 px matte, so edges are soft at high resolution; hair, glass, fine detail and low-contrast subjects are often wrong; busy backgrounds can leak through.

### Considered and not chosen
The agent that made this choice stopped (usage limit) before writing its comparison, so there are no measured numbers for the alternatives. Candidates listed by licence only: Xenova/modnet (Apache-2.0, portrait matting), onnx-community/ormbg-ONNX (Apache-2.0), onnx-community/BiRefNet_lite-ONNX (MIT, much larger). Excluded on licence: briaai/RMBG-1.4 (non-commercial), imgly background-removal (AGPL).

## Redact: YuNet face detection (`yunet`)

- **File**: `public/models/yunet/model.onnx`, 232,589 bytes, SHA-256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`, unmodified. `NOTICE.md`, `LICENSE` (MIT) and `LICENSE-libfacedetection.train` (BSD-3-Clause) sit beside it.
- **Source**: huggingface.co/opencv/face_detection_yunet at revision `3cc26e7f1014a5ee5d74a42acee58bafc9d0a310`, file `face_detection_yunet_2023mar.onnx` (OpenCV Zoo mirror).
- **Licence**: declared MIT (repo LICENSE, "All files in this directory are licensed under MIT"). Upstream weights and training code are BSD-3-Clause (ShiqiYu/libfacedetection.train, commit `a61a428`, named in the model README). Both permit commercial use and redistribution. The HF repo has no licence metadata tag; the evidence is the LICENSE file and README text.
- **Runtime**: the same onnxruntime-web 1.31.1 single-thread WASM files Cutout uses, served from `/engines/ort/`. Model run for real in onnxruntime-web (Node and Chromium): input `input` float32 `[1,3,640,640]` is fixed (320x320 and 640x480 are rejected); 12 outputs `cls_/obj_/bbox_/kps_` for strides 8, 16, 32 (6400+1600+400 cells), all supported by the WASM CPU provider.
- **Preprocessing** (from OpenCV `FaceDetectorYN`, `modules/objdetect/src/face_detect.cpp`): BGR channel order, raw 0..255 values (no mean/std), NCHW. The image is scaled so its long side is 640 and placed top-left; the remainder is zero. EXIF orientation is applied by `createImageBitmap({imageOrientation:'from-image'})`.
- **Decoding** (same file): per stride `s`, cell `i` at column `i % (640/s)`, row `floor(i / (640/s))`; `score = sqrt(clamp01(cls) * clamp01(obj))`; centre `((col + dx) * s, (row + dy) * s)`; size `(exp(dw) * s, exp(dh) * s)`. Then greedy NMS at IoU 0.3. OpenCV's default score threshold is 0.6; Plainkit uses 0.5 because every box is shown to the user to check. The 5 landmarks are not used.
- **Boxes to regions**: scaled back to original pixels, each side grown by 15% of the box size, clamped to the image, rounded outward to integers (all in `src/engines/face/decode.ts`, unit-tested).
- **Measured** (headless Chromium, Linux build container, 2026-11-12): inference 104 ms for one 640x480 synthetic image; whole job including same-origin download of the 14.8 MB engine and 0.2 MB model, session creation and inference: about 1.2 s cold. In Node with the same ORT build, 82 ms on a 2048x1150 photo. Not measured on a phone.
- **Checked on**: a drawn cartoon face (score 0.84, box IoU 0.70 with the drawn head after padding) and, outside the repo, a crowd photo with 65 detections at score >= 0.5 (a visual spot check only, not counted: its licence is unclear so it is not committed). No accuracy study. The upstream paper reports 0.884 / 0.866 / 0.750 AP (easy / medium / hard) on WIDER Face validation.
- **What it is bad at**: the model was trained for faces of roughly 10 to 300 px. Because the whole image is shrunk to 640 px, faces smaller than about 10 px after shrinking are missed, which for a 4000 px photo means faces under about 60 px. Turned, covered, blurry and cartoon faces can be missed; non-faces can be reported. Detection is a helper, not a guarantee. The UI says so.

### Face models considered and not chosen
- Ultra-Light-Fast-Generic-Face-Detector RFB-320 (MIT; onnxmodelzoo mirrors list Apache-2.0): not downloaded or compared; YuNet met the licence and size bar and ran first time.
- SCRFD (InsightFace): weights are for non-commercial research use upstream, rejected. Several HF re-uploads label them Apache-2.0 or MIT, which does not change the upstream terms.
- BlazeFace exports: licence metadata on re-uploads varies; not evaluated.
- YuNet int8 variants (100 KB and 122 KB): not tested; the 232 KB float file is small enough.


## Audio stems: Spleeter 4 stems (`spleeter-4stems`), experimental
Supersedes the "Not shipped" line above for stem separation (speech transcription is still not shipped here).

- **Files**: `public/models/spleeter-4stems/{vocals,drums,bass,other}.fp16.onnx`, 19,714,141 / 19,714,140 / 19,714,139 / 19,714,140 bytes (78,856,560 total), SHA-256 in `NOTICE.md`. Unmodified. Engine is the same ORT 1.31.1 single-thread WASM as Cutout.
- **Source**: huggingface.co/Best-Practice/spleeter-4stems-onnx at revision `486643021f18a4d057d282fff1d11b89a30e9887` (HF card: Apache-2.0).
- **Licence**: Spleeter by Deezer, MIT (`LICENSE` copied from upstream; JOSS paper says pre-trained models are MIT too). ONNX graph via sherpa-onnx (Apache-2.0, `LICENSE-sherpa-onnx.txt`, modified: activations parameterised). Open uncertainty: the upstream README licenses "the code" and the weights wording rests on the paper (deezer/spleeter#898 unanswered per the HF card). See `docs/audits/stems-feasibility.md`.
- **Interface**: magnitudes `[2, splits, 512, 1024]` in and out; STFT (periodic Hann, 4096/1024, 44.1 kHz), ratio masks across all four stems and iSTFT are done in `src/engines/stems/dsp.ts`.
- **Measured** (headless Chromium, Linux container, single thread, synthetic 180 s stereo mix): 77 to 84 s after the model was loaded, about 0.45 s per audio second; separation added about 0.55 GB. Not measured on real music or on a phone.
- **What it is bad at**: bleed between stems, artefacts, and nothing above about 11 kHz is separated (it is split with the average mask). Quality on real music was not evaluated.
- **Not chosen**: Open-Unmix umxhq (MIT per card, 142 MB, MUSDB-trained), htdemucs ONNX (170 MB or more, weights licence wording not stated upstream), UVR/MDX community packs (unclear or restrictive), umxl (CC BY-NC-SA, rejected).

## Subtitles: speech transcription, Whisper tiny.en (`whisper-tiny-en`)

This section supersedes the "Not shipped" line above for transcription.

- **Files**: `public/models/whisper-tiny-en/`, 41,536,374 model bytes (`onnx/encoder_model_quantized.onnx` 10,124,993; `onnx/decoder_model_merged_quantized.onnx` 30,718,858; tokenizer and config JSON 2,692,523), SHA-256 of every file in `NOTICE.md` beside them. Unmodified; the folder with licence texts is 43.5 MB.
- **Source**: huggingface.co/onnx-community/whisper-tiny.en at revision `794207fec2761281fe63a23a94b7e9f53a4efbc1` (ONNX export of openai/whisper-tiny.en). `q8` files (`*_quantized.onnx`), picked as the smallest set that transformers.js loads for the WASM backend.
- **Licence**: the ONNX repo and openai/whisper-tiny.en both carry `license: apache-2.0` in their card metadata; OpenAI's Whisper code and weights are MIT upstream (github.com/openai/whisper LICENSE). Apache-2.0 text and the MIT text are shipped beside the files.
- **Language**: English only. A multilingual tiny model was not shipped: it supports many languages but is much less accurate on most of them, and the UI would have had to hide that. Other languages produce wrong text.
- **Runtime**: `@huggingface/transformers` 4.3.2 (Apache-2.0) with its own nested onnxruntime-web `1.31.0-dev.20260914-8d85527a0` (MIT), single-thread WASM. By default the library loads its runtime from jsdelivr; the worker overrides `wasmPaths` to `/engines/transformers/ort-wasm-simd-threaded.{mjs,wasm}` (14,264,838-byte wasm), copied by `scripts/copy-transcribe.mjs` and not committed. `env.allowRemoteModels = false`; `env.localModelPath` is the path `/models/` (an absolute URL makes the library skip local files). Total first-use download: 55.1 MiB (model 41,536,374 B plus wasm 14,264,838 B).
- **Pipeline**: audio decoded and resampled to mono 16 kHz on the main thread (OfflineAudioContext), then `chunk_length_s: 30`, `stride_length_s: 5`, `return_timestamps: true`. The library reports no per-chunk progress, so only the model-download fraction is shown as a number; recognition is shown as running with no percentage. Limit 30 minutes; warning above 10.
- **Cache**: only when the user ticks "Keep the model on this device": `plainkit-model-whisper-tiny-en-v1` via `env.customCache`; otherwise nothing is stored (`useBrowserCache`, `useWasmCache` off), so the Settings delete control covers it.
- **Measured** (headless Chromium in the Linux build container, single thread, 2026-11-12): `e2e/fixtures/jfk.wav`, 11 s of speech. Whole worker call (model load from same origin, then recognition) 4.9 to 7.3 s over four runs (dev server 4.9, 5.4, 5.6; production build 7.3), about 0.45 to 0.66 times real time including loading. Not measured on a phone, on long files, or with noisy audio.
- **Checked on**: the JFK 1961 inaugural clip (US federal-government speech, treated as public domain; fixture from the Xenova/transformers.js-docs dataset, same clip as tests/jfk.flac in openai/whisper). Transcript: "And so my fellow Americans ask not what your country can do for you ask what you can do for your country." (the words match the published text; commas are missing). This is one clean, studio-quality clip, not an accuracy study.
- **What it is bad at**: names, accents, overlapping speakers, music and noise; tiny models also invent text on silence. Post-processing collapses text repeated 4 or more times in a row and drops `[BLANK_AUDIO]`, which does not remove other invented lines. The UI says to check every line.
