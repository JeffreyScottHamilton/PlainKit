# Whisper tiny.en (8-bit ONNX), served unmodified

- Source: https://huggingface.co/onnx-community/whisper-tiny.en at revision `794207fec2761281fe63a23a94b7e9f53a4efbc1` (ONNX export of openai/whisper-tiny.en at `87c7102498dcde7456f24cfd30239ca606ed9063`, for transformers.js).
- Licence: the ONNX repo and the openai/whisper-tiny.en repo both declare `license: apache-2.0` in their model-card metadata (`LICENSE` here is the Apache-2.0 text). The OpenAI Whisper code and released weights are published under the MIT licence (`LICENSE-whisper-MIT`, from github.com/openai/whisper). Either permits redistribution; both notices are kept.
- Language: English only (the `.en` model).
- Files are byte-identical to the repository files (not re-quantised or edited here):

| File | Bytes | SHA-256 |
|---|---|---|
| onnx/encoder_model_quantized.onnx | 10,124,993 | e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25 |
| onnx/decoder_model_merged_quantized.onnx | 30,718,858 | c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52 |
| config.json | 2,197 | 251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233 |
| generation_config.json | 1,646 | 7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9 |
| preprocessor_config.json | 339 | a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d |
| tokenizer.json | 2,405,679 | 5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0 |
| tokenizer_config.json | 282,662 | 93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c |
