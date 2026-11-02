# Model provenance and downloads

No Qwen/Silero weights are stored in Git, Git LFS, application bundles or this fork's GitHub release attachments. The installer downloads them directly to each device. **[manifest.json](manifest.json)** is the machine-readable source of truth: every file has an exact URL, byte size and SHA-256.

| Purpose | Official repository | Pinned revision | Weight bytes | Weight SHA-256 |
| --- | --- | --- | --- | --- |
| Speech recognition | [Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) | `5eb144179a02acc5e5ba31e748d22b0cf3e303b0` | 1,876,091,704 | `79d6cbd4c98c7bbffe9db2edac07f56cd6637d0d5944b27f6c2b8353840323ea` |
| Word/character alignment | [Qwen3-ForcedAligner-0.6B](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) | `c7cbfc2048c462b0d63a45797104fc9db3ad62b7` | 1,835,544,544 | `47831d0e82f96b20e9034dba01a075ee06436654719f6a68289e49f1b65ce0e7` |
| Voice activity detection | [Silero VAD](https://github.com/snakers4/silero-vad) | `be95df9152c0d7618fa1edfeb296fc3dae32376f` | 2,327,524 | `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3` |

Direct weights: [ASR](https://huggingface.co/Qwen/Qwen3-ASR-0.6B/resolve/5eb144179a02acc5e5ba31e748d22b0cf3e303b0/model.safetensors), [ForcedAligner](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B/resolve/c7cbfc2048c462b0d63a45797104fc9db3ad62b7/model.safetensors), [Silero ONNX](https://raw.githubusercontent.com/snakers4/silero-vad/be95df9152c0d7618fa1edfeb296fc3dae32376f/src/silero_vad/data/silero_vad.onnx). A weight file alone is insufficient: the Qwen config, tokenizer and vocabulary files listed in the manifest are required too.

Run `npm run qwen:setup` to download all required files and install the isolated Python 3.12 runtime. The installer checks already downloaded files, resumes through Hugging Face's client, rejects mismatches and writes the active configuration only after validation. Normal inference sets offline mode and never downloads missing weights implicitly. Public downloads do not need an account/token.

For networks unable to reach Hugging Face, manually obtain the official original checkpoints from the Qwen pages or Qwen's [ModelScope organization](https://modelscope.cn/organization/Qwen), then verify them against this manifest. `--model-path` accepts an existing ASR directory read-only. Managed aligner files can be preseeded in `runtime/models/Qwen3-ForcedAligner-0.6B/`, and Silero under `runtime/models/silero-vad/`; setup skips files with matching hashes. Do not bypass hash checks for an unverified mirror.

Qwen model cards declare **Apache-2.0**. The managed model directories receive its full license; Silero retains its **MIT** notice. Externally supplied model directories are never modified. Upstream model cards are downloaded as optional provenance documents for managed installs.

The upstream native payload baseline is pinned in [native-payload.json](native-payload.json), including its official release archive and all component hashes. The build then recompiles the fork's modified Swift capture/cursor helpers and Rust audio compositor; baseline hashes do not describe those rebuilt outputs. These binaries are OpenScreen components, not Qwen models. The three small MediaPipe webcam-segmentation models inherited from OpenScreen remain in `public/mediapipe/` under their existing Apache-2.0 notices.

[native-payload.json](native-payload.json) 固定的是上游原生组件基线及其校验值。构建随后会重新编译本 fork 修改的 Swift 录屏/光标辅助程序与 Rust 音频合成器，因此基线哈希不代表重新编译后的产物。这些组件属于 OpenScreen，不是 Qwen 权重；原有 MediaPipe 小型摄像头分割模型继续遵循对应 Apache-2.0 声明。
