# Spleeter 4-stem separation weights (fp16)

Four independent U-Nets, one per stem. Unmodified copies of the files from
https://huggingface.co/Best-Practice/spleeter-4stems-onnx at revision `486643021f18a4d057d282fff1d11b89a30e9887`
(the HF repo declares Apache-2.0; its source is https://github.com/madewith-bestpractice/spleeter-4stems-onnx).

| File | Bytes | SHA-256 |
|---|---|---|
| `vocals.fp16.onnx` | 19,714,141 | `db47148ab1c52709ce694893f532c91abfe3edc4d46238939570e036a22878ca` |
| `drums.fp16.onnx` | 19,714,140 | `7ae4002e5633634674f74dc3356d5875b0da894d59ce0f60e844bb8f9cb8aa92` |
| `bass.fp16.onnx` | 19,714,139 | `ba4c4949a27222492cca49859901a873b4b71461dc48c7c5a51f93d31eb11f55` |
| `other.fp16.onnx` | 19,714,140 | `3cc59116cb7195946ab9596d8ca25984d09c0f8a70db8cf85d063132f97bc61d` |

Total 78,856,560 bytes (the first four rows; this folder also holds the licence files).

## Origin and licences
- Weights: Spleeter, Deezer Research (https://github.com/deezer/spleeter). Upstream README: "The code of Spleeter is MIT-licensed" (`LICENSE` here, copied from upstream master). The JOSS paper (Hennequin et al., 2020, doi:10.21105/joss.02154) states source code AND pre-trained models are distributed under MIT. The repository README does not repeat that for the weights themselves, and an upstream issue asking for clarification (deezer/spleeter#898, as cited by the HF model card) was unanswered when last reported: this is a documented residual uncertainty, see `docs/audits/stems-feasibility.md`.
- ONNX graph: exported through the sherpa-onnx PyTorch port of Spleeter's U-Net (k2-fsa/sherpa-onnx, Apache-2.0, `LICENSE-sherpa-onnx.txt`), with the activations parameterised (modified, Apache-2.0 section 4(b)).
- Training data: Deezer's own catalogue per the HF card (not MUSDB18). Not independently verified here.

## Interface (from the model graph, checked by running it)
Input `x` float32 `[2, num_splits, 512, 1024]` = channels, splits, STFT frames, bins (magnitudes). Output `y` same shape. STFT: periodic Hann, frame 4096, hop 1024, 44.1 kHz stereo, first 1024 of 2049 bins. Ratio mask across all four stems applied to the original complex STFT. Implemented in `src/engines/stems/dsp.ts`.

Redistributed by Plainkit unmodified.
