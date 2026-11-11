---
name: plainkit-media-inference
description: Browser media, codecs, WASM, and local inference guidance for Plainkit. Use for audio/video conversion, WebCodecs, ffmpeg.wasm, ONNX Runtime Web / Transformers.js, model downloads and caching, background removal, transcription, face detection, stem separation.
metadata: {origin: project-authored, revision: 1}
---
# Media, codecs, WASM, inference (project-authored)

Nothing here is "supported" until proven end to end on a named fixture. Check current docs before relying on memory of any API.

## Codecs
- Probe at runtime (`VideoEncoder.isConfigSupported`, `MediaRecorder.isTypeSupported`, canvas encode + verify MIME). Unsupported → explicit unsupported state.
- Prefer native APIs/WebCodecs with a permissively licensed demux/mux library; ffmpeg.wasm is the heavy fallback (large download, slow, memory-limited, core build licensing must be reviewed — see plainkit-licensing).
- Multithreaded WASM needs cross-origin isolation (COOP/COEP); verify with the real hosting headers and every third-party resource before enabling. Default to single-thread if unverified.
- DRM is unsupported. HLS: VOD only until live is tested.

## Inference
- Per model record: task, license of code AND weights, redistribution right, size, quantization, WebGPU vs WASM-CPU behavior, measured runtime/memory.
- First use shows download size and asks; cache is opt-in with a visible delete control and explicit version. Quota failure degrades safely.
- Distinguish "downloading engine" from "processing file" in progress.
- One heavy model in memory at a time; dispose sessions on leave.
- WebGPU unavailable → WASM fallback or honest unsupported; never remote inference.
- Stem separation and phone-class transcription are experimental until benchmarked.

## Evidence
Fixture name/size, device/browser, cold download bytes, warm run time, output check (duration, sample rate, dimensions, alpha present), failures. Viewport emulation is not real-device performance.
