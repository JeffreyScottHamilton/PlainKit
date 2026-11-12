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

## Not shipped
No model for stem separation, speech transcription or face detection has been evaluated. Those features are not offered.
