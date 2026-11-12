# Stem separation feasibility (Audio stems)

Date 2026-11-12. Verdict: **FEASIBLE, experimental**, with Spleeter 4 stems (fp16 ONNX). Everything below was run in this container (Linux, single-thread WASM, headless Chromium and Node). Synthetic audio only: no real music was available, so nothing here says how it sounds on songs.

## Candidates (Hugging Face API search, then model cards and upstream READMEs read)

Only the first row was downloaded and run. The others were judged from metadata, file sizes and cards, not executed.

| Candidate | Files / size | Declared licence | Upstream weights licence (what the source says) | Verdict |
|---|---|---|---|---|
| **Best-Practice/spleeter-4stems-onnx** (rev `486643021f18`) | 4 x 19.7 MB fp16 (also 4 x 39.4 MB fp32, `.wide` 16 kHz variants) | Apache-2.0 (HF card) | Spleeter. Upstream `LICENSE` is MIT, and the upstream README says "The code of Spleeter is MIT-licensed". The JOSS paper (doi:10.21105/joss.02154), as quoted on the HF card, says source code and pre-trained models are MIT. The README does not say it for the weights, and the HF card cites deezer/spleeter#898 asking about it as unanswered. Graph derives from sherpa-onnx (Apache-2.0). The card says Deezer trained on its own catalogue, not MUSDB18; not verified by me. | **Chosen.** Self-hosting allowed under MIT/Apache-2.0 on the evidence above; weights-licence wording is a residual uncertainty. |
| csukuangfj/sherpa-onnx-spleeter-2stems (+int8, fp16) | 2 x 39 MB (26 / 19.7 MB) | none on HF | same Spleeter question | 2 stems only; no licence file on the repo. Not used. |
| jenila-ai/spleeter-fast-onnx, latentdivergence/latentsound-spleeter-4stems | one 79 MB fp16 file each | MIT | Spleeter | Not run; single-file 4-stem layout and I/O contract not documented. Best-Practice documents the contract and was verifiable. |
| MixDirective/open-unmix-umxhq-{vocals,drums,bass,other}-onnx, edgetools/umx-hq | 35.6 MB x 4 = 142 MB (edgetools: vocals 17.8 MB only) | MIT | Open-Unmix README: `umxl` weights are CC BY-NC-SA 4.0 (reject); `umxhq`/`umx` are trained on MUSDB18(-HQ) and the README states no weight licence for them (HF card says Zenodo weights are MIT). MUSDB18 dataset terms not resolved. | Over the 100 MB bar; dataset-terms uncertainty. Not run. |
| htdemucs ONNX (ModernMube 174 MB, StemSplitio 166-316 MB per stem, smank 304 MB, Intel OpenVINO 168 MB) | 166 to 811 MB | MIT | Upstream README: "Demucs code is released under the MIT license". It does not state a licence for the weights; trained on MUSDB HQ plus 800 extra songs. | Over 100 MB; weights wording uncertain. Not run. |
| UVR / MDX-Net community packs (Eddycrack864 `openrail`, ModernMube Kim_Vocal_2 / UVR-MDX files, Politrees, thepatch `other`, many `unknown`) | 60+ MB each | mixed, several non-MIT or unknown; HF "mit" tags on re-uploads | unclear or restrictive upstream | Rejected: no clear permissive upstream. |
| Intel/drumsep_mdx23c_jarredou_openvino, teamup-tech/Open-Unmix-weights | n/a | CC BY-NC-SA 4.0 | non-commercial | Rejected. |

A note found in the Spleeter README: a section addressed to LLM agents asks them not to contact the maintainers about licensing. Nobody was contacted; the question stays open and is recorded above.

## What the graph really is (read from the ONNX metadata, then run)
- Input `x` float32 `[2, num_splits, 512, 1024]` (channel, split, STFT frame, bin), output `y` same shape: **magnitudes in, magnitudes out**. One network per stem; stems in order vocals, drums, bass, other.
- STFT outside the model: periodic Hann, frame 4096, hop 1024, 44.1 kHz stereo, first 1024 of 2049 bins (to about 11 kHz). Mask: Spleeter ratio mask across all four stems, applied to the original complex STFT (phase kept); bins above 1024 get the per-frame mean mask. A 4096 zero-prefix trick keeps overlap-add exact. Described by the model card and confirmed by the reconstruction number below.
- All operators ran in onnxruntime-web 1.31.1 single-thread WASM (no unsupported ops). The `num_splits` axis is dynamic; T = 512 frames is fixed, so one call covers at most 11.8 s of audio.

## Measurements
Fixture: synthetic stereo 44.1 kHz mix (vocal-like FM voice, bass sines, kick/snare/hat noise bursts, sine chord) with known stems; the e2e uses a 6 s version of the same recipe. Segments of 10 s with 1 s cross-fade. Container: Linux, headless Chromium, single thread, no GPU. Cold = model and engine download from the local dev server included.

| Measurement | Result |
|---|---|
| Node, 4 sessions load | 0.85 to 1.0 s |
| Node, one network call (512 frames) | 0.74 to 0.88 s; 4 per segment |
| Node, 10 s clip, whole pipeline | 4.96 s, RTF 0.50 |
| Node, 60 s clip (7 segments) | 28.9 s, RTF 0.48; peak process RSS 935 MB |
| **Chromium, 180 s clip, whole job after model load** | **77 to 84 s, RTF 0.43 to 0.47** (three runs). Whole job 79 to 86 s including same-origin model and engine fetch. |
| Chromium, 6 s clip (e2e), second run after a cancel | 4.6 s |
| Chromium memory, 180 s clip | Blank headless Chromium 435 MB; idle app page 552 MB; page with the 32 MB WAV attached 1,277 MB (this 725 MB rise happens before Separate is pressed, while a 32 MB WAV is attached; its cause was not isolated); **peak 1,839 to 1,872 MB** for the whole browser process tree. Rise during the separation itself: about 550 to 580 MB. |
| iSTFT(STFT(x)) max error | 6e-8 (limit 1e-4; unit test) |
| sum of 4 stems versus mix | -150 dB in float; stems from the browser, 16-bit WAVs: correlation 0.9979 (e2e) |

Synthetic SDR (10 s clip, 0.5 s edges skipped, dB; "mix" = the unprocessed mix used as the estimate):

| Stem | SDR of estimate | SDR of mix as estimate |
|---|---|---|
| vocals | 4.5 | -4.5 |
| drums | 4.9 | -11.2 |
| bass | 14.5 | 2.2 |
| other | -4.1 | -14.3 |

Sanity check only: the stems are pure sines and noise bursts, not music, and "other" being negative shows the model does not treat a sine chord as it treats real instruments. Real-music quality was NOT measured.

## Decision against the stated thresholds
(a) Licence: permissive on the evidence (MIT upstream code and licence file, JOSS statement for the models, Apache-2.0 graph conversion); one open upstream question on the weights, stated in docs/models.md. Pass with that caveat.
(b) Runs in single-thread WASM, no unsupported ops. Pass.
(c) RTF about 0.45 (limit 5). A 3-minute song takes about 80 s here. Memory: separation itself adds about 0.55 GB; the whole browser tree peaked at 1.84 GB in this harness, above the 1.5 GB figure, but 0.55 GB of that is the idle page and about 0.7 GB was already used after attaching the 32 MB WAV, before separation started (cause not isolated). A 5-minute limit keeps the four output WAVs (about 212 MB) and the input copy bounded. Pass, with this caveat.
(d) Stems reconstruct the mix (corr 0.998) and every stem beats the unprocessed mix on synthetic SDR. Pass.

## Shipped limits
Up to 5 minutes (MAX_SECONDS). 4 stems x 16-bit WAV at 44.1 kHz. A mono file gives mono stems (the network is fed the same channel twice). Output is written straight into the WAV buffers, so no whole-song float buffers are kept.

## Not measured
Phones and real hardware; real music (quality, vocal bleed into other, transients across segment boundaries); WebGPU; multi-thread; the `.wide` 16 kHz variant (about 1.5x the time, would extend separation above 11 kHz); memory on a 5-minute file; production build (all runs used the Vite dev server).

## Alternatives not built
htdemucs gives much better published quality but is 170 MB or more with unresolved weights wording and would need roughly 4 to 10x the compute; revisit only with a licence statement and a size/time budget. An optional local companion script was out of scope.
