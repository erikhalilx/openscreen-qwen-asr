# OpenScreen Qwen3-ASR

An independent [OpenScreen](https://github.com/getopenscreen/openscreen) fork with local Qwen3-ASR transcription, real word/character alignment and Chinese caption layout. Based on **v2.1.2**, upstream commit `d8889c626f859e0be8f4f87fdffc7362629550bc`.

这是一个基于 OpenScreen 的独立社区版本，最大的改进是用本地 **Qwen3-ASR** 替换原版 Whisper 语音识别，旨在大幅提升中文语音识别和字幕生成的准确度。同时保留录屏、编辑、时间线、字幕、项目保存、视频导出以及 CLI/MCP 等主要功能，并提供真实的字级/词级时间戳和更适合中文阅读的字幕排版。

**Supported Qwen runtime: Apple Silicon, macOS 26 or later.** The pinned MLX 0.32.2 wheels require macOS 26. Windows, Linux and Intel Mac Qwen inference are not supported by this release. The recording, editor, timeline, native compositor, captions, project persistence, export and CLI/MCP source remain included. AI chat/translation still require the user's own configured provider.

[中文安装说明](README-QWEN.zh-CN.md) · [Models and verified downloads](models/README.md) · [Third-party notices](THIRD-PARTY-NOTICES.md) · [Privacy and publication](PUBLICATION.md) · [Upstream README](README-UPSTREAM.md)

## Install from source

Install [Node.js 22.22.1](https://nodejs.org/en/download), npm 10.9.4 (bundled with that Node release), and [uv](https://docs.astral.sh/uv/getting-started/installation/). Use npm, as required by the Electron native module build. Allow at least 8 GB free for installation and additional space for recordings/exports; 16 GB unified memory is the tested configuration, not a reservation against other apps.

```bash
git clone https://github.com/erikhalilx/openscreen-qwen-asr.git
cd openscreen-qwen-asr
npm ci
npm run qwen:setup
npm run qwen:build
npm run qwen:install
```

Open **OpenScreen Qwen** from Applications. Source installation builds the application locally with an ad-hoc signature; this fork has no Developer ID notarization. If macOS asks, use its normal **Open Anyway** flow for a build you trust. Do not assume the upstream project's signing claims apply to this fork.

Setup downloads both official Qwen models and Silero VAD, verifies their pinned hashes, and creates a separate Python 3.12 environment. No existing model installation is needed. Model weights total about **3.72 GB** (decimal), plus tokenizers and runtime dependencies. The first setup requires internet; transcription thereafter is local and offline. A failed setup does not replace a working model configuration; rerun the command to resume verified downloads.

To reuse an existing **official, unmodified Qwen3-ASR-0.6B** checkpoint read-only:

```bash
npm run qwen:setup -- --model-path /path/to/Qwen3-ASR-0.6B
```

The installer checks that checkpoint against the official manifest and never installs dependencies or writes files there. Converted/quantized checkpoints with different hashes are not silently accepted. See [model details](models/README.md).

The native build helper downloads the complete, checksum-verified native payload and license list from the upstream **v2.1.2** release. Native source is unchanged. This preserves capture, webcam effects, preview and export without requiring Rust/FFmpeg compilation on a new device. Full native source and build commands remain in this repository for developers.

### 中文安装说明

请先安装 [Node.js 22.22.1](https://nodejs.org/en/download)、npm 10.9.4（随该 Node.js 版本提供）以及 [uv](https://docs.astral.sh/uv/getting-started/installation/)。本项目要求使用 npm，因为 Electron 原生模块的构建依赖它。安装至少预留 8 GB 可用空间，并为录制文件和导出文件额外预留空间；16 GB 统一内存是已测试配置，并不代表应用会独占这些内存。

```bash
git clone https://github.com/erikhalilx/openscreen-qwen-asr.git
cd openscreen-qwen-asr
npm ci
npm run qwen:setup
npm run qwen:build
npm run qwen:install
```

安装完成后，从“应用程序”中打开 **OpenScreen Qwen**。源码安装会使用临时签名在本机生成应用；本 fork 不提供 Developer ID 公证。如果 macOS 弹出安全提示，请仅对你信任的本机构建使用系统的“仍要打开”流程。不要将上游项目的签名说明套用于本 fork。

安装脚本会下载官方 Qwen 模型和 Silero VAD，校验固定哈希，并创建独立的 Python 3.12 环境。无需预先安装模型。模型权重总计约 **3.72 GB**（十进制），另需为 tokenizer 和运行时依赖预留空间。首次安装需要联网；完成后转写在本地离线运行。如果安装失败，不会替换已有的可用模型配置；重新执行命令即可继续校验并下载缺失文件。

如果要只读复用已有的**官方、未修改的 Qwen3-ASR-0.6B** 权重：

```bash
npm run qwen:setup -- --model-path /path/to/Qwen3-ASR-0.6B
```

安装器会根据官方清单校验该权重，既不会在该目录安装依赖，也不会写入文件。哈希不同的转换版或量化版权重不会被静默接受。详见[模型说明](models/README.md)。

原生构建辅助脚本会从上游 **v2.1.2** 发布版本下载完整且经过校验的原生组件和许可证清单。原生源码保持不变，因此新设备无需自行编译 Rust/FFmpeg，也能保留录屏、摄像头效果、预览和导出功能。完整的原生源码与开发者构建命令仍保留在本仓库中。

## Data and operation

Runtime, model downloads and private configuration live under the current user's `~/Library/Application Support/OpenScreen-Qwen/`, outside the application and checkout. The app resolves this directory on each device. You can move or delete the source checkout after installation; keep the user data/runtime directory. No rebuild is required when a model path changes: rerun setup while the app is closed, then relaunch.

Project/media files remain local. This fork disables upstream usage-count telemetry and automatic updates. Model downloads contact their listed hosts. Explicit AI provider requests and the opt-in MCP server have their normal configured behavior; do not publish your project files, diagnostics or provider credentials.

Run `npm run dev` for development after installing dependencies, native payload and Qwen runtime. If another application uses the same read-only ASR checkpoint, its environment is independent. Simultaneous inference/export still competes for memory and GPU; there is no cross-application job scheduler.

## Supported transcription

Chinese, English, Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian and Spanish have alignment support. Automatic detection outside that set returns an explicit error. Character/word timestamps come from ForcedAligner; punctuation is restored from recognized text. The application does not fabricate evenly spaced word timings or overwrite an existing transcript after a failed job.

Validation covers the worker, cancellation/recovery, real app CLI/MCP transcription, caption rendering, word deletion, persistence and MP4 export. The full upstream manual checklist has not been passed across all platforms; long real-world recordings, recognition accuracy for every speaker and simultaneous third-party workloads remain outside that validation. See [validation scope](technical-documentation/testing/qwen-validation.md).

## Provenance and license

OpenScreen was created by [Siddharth Vaddem](https://github.com/siddharthvaddem), then continued by [OpenScreen contributors](https://github.com/getopenscreen/openscreen). This fork retains their MIT license and copyright notices. Its additions integrate external Qwen/MLX dependencies; model weights and Python packages retain their own licenses and are not included in Git or the app bundle. See [LICENSE](LICENSE), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [third-party-licenses](third-party-licenses/).

This is an independent community fork, with no endorsement from OpenScreen, Qwen or MLX. Report fork-specific issues [here](https://github.com/erikhalilx/openscreen-qwen-asr/issues). Upstream documentation under `website/` and `README-UPSTREAM.md` is retained as historical reference and may describe different platforms, downloads or update behavior.
