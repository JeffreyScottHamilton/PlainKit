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
