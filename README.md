# OpenScreen Qwen3-ASR 0.3.1

## Version 0.3.1 / 0.3.1 版本

The Transcript and Captions panels detect missing Qwen components. Save the installer script, double-click the `.command` file, and restart the app after setup.

转录文本和字幕面板会检测缺少的千问组件。保存补装脚本，双击 `.command` 文件，安装完成后重启应用。

## Version 0.3 changes / 0.3 版本迭代

This release integrates the OpenScreen v2.2.1 editor and capture updates. The timeline offers five camera layouts, with per-passage camera controls and separate screen and camera roundness. The layout inspector scrolls to reveal every control. macOS prepares recording permissions before the countdown. Opening a project saved before 0.3 rebuilds the timeline from the original sources and resets earlier edits.

本版融合 OpenScreen v2.2.1 的编辑与录制更新。时间线支持五种摄像头布局及逐段参数，屏幕和摄像头圆角分别设置。布局面板支持滚动，macOS 在倒计时前准备录制权限。打开 0.3 之前保存的项目时，工作室从原始素材重建时间线并重置旧编辑。

## Version 0.2 changes / 0.2 版本迭代

Version 0.1 introduced local Qwen3-ASR transcription and real character/word alignment. Version 0.2 adds separate system/microphone recording tracks with independent recording and editing volumes; independent transcripts, caption visibility, styling and height swapping; improved caption insets; up to one extra second of caption display without delaying the next line; a line-length limit of 25; and source-specific SRT export on the edited video clock. Accessibility permission handling and development-profile isolation are improved. Semantic sentence splitting remains unchanged. Fork version 0.2.0 is based on upstream OpenScreen 2.1.2.

0.1 提供本地千问识别与真实字词对齐。0.2 新增系统声/麦克风独立录制双音轨、录制前与后期独立音量、两路转录与字幕开关/样式/高度交换；修复字幕边距调节，默认多显示最多一秒且不推迟下一句，行长上限扩至 25，并支持按成片时间轴分别导出两路 SRT。同时改进辅助功能授权处理和开发环境隔离。语义断句规则尚未调整。Fork 版本号为 0.2.0，上游基础版本仍为 OpenScreen 2.1.2。

An independent [OpenScreen](https://github.com/getopenscreen/openscreen) fork with local Qwen3-ASR transcription, real word/character alignment and Chinese caption layout. Integrates upstream **v2.2.1**, commit `c5cd7b9ef8b1ee6e98ea8accd168eefcea6a5ddf`.

这是一个基于 OpenScreen 的独立社区版本，最大的改进是用本地 **Qwen3-ASR** 替换原版 Whisper 语音识别，旨在大幅提升中文语音识别和字幕生成的准确度。同时保留录屏、编辑、时间线、字幕、项目保存、视频导出以及 CLI/MCP 等主要功能，并提供真实的字级/词级时间戳和更适合中文阅读的字幕排版。

**Supported Qwen runtime: Apple Silicon, macOS 26 or later.** The pinned MLX 0.32.2 wheels require macOS 26. Windows, Linux and Intel Mac Qwen inference are not supported by this release. The recording, editor, timeline, native compositor, captions, project persistence, export and CLI/MCP source remain included. AI chat/translation still require the user's own configured provider.

**支持的千问运行环境：Apple Silicon 芯片、macOS 26 或更高版本。** 固定版本的 MLX 0.32.2 wheel 要求 macOS 26。本版本不支持在 Windows、Linux 或 Intel Mac 上运行 Qwen 推理。录屏、编辑器、时间线、原生合成器、字幕、项目保存、导出以及 CLI/MCP 源码仍然保留；AI 对话和翻译功能仍需配置你自己的服务提供商。

[中文安装说明](README-QWEN.zh-CN.md) · [Models and verified downloads](models/README.md) · [Third-party notices](THIRD-PARTY-NOTICES.md) · [Privacy and publication](PUBLICATION.md) · [Upstream README](README-UPSTREAM.md)

## Set up transcription on an installed app / 已安装应用的转录补装

Open **Studio → Transcript → Captions**. If Qwen components are missing, choose **Save installer script** and double-click the saved `.command` file. Setup installs the pinned Python dependencies and verifies the downloaded models. Allow at least 8 GB free and an internet connection. When setup finishes, quit with Cmd+Q, reopen OpenScreen Qwen, and retry transcription.

打开 **工作室 → 转录文本 → 字幕**。缺少千问组件时，点击 **保存补装脚本**，双击保存的 `.command` 文件。安装器会准备锁定版本的 Python 依赖并校验下载的模型。请保持联网并预留至少 8 GB 可用空间。安装完成后按 ⌘Q 完全退出，重新打开 OpenScreen Qwen，再尝试转录。

## Install from source

Install [Node.js 22.22.1](https://nodejs.org/en/download), npm 10.9.4 (bundled with that Node release), Xcode with its command-line tools, and [Rust](https://rust-lang.org/tools/install/). Select Xcode with `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` if necessary. Use npm, as required by the Electron native module build. Allow at least 16 GB free for installation and native compilation, plus recordings/exports; 16 GB unified memory is the tested configuration, not a reservation against other apps.

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

The build first downloads the checksum-verified upstream **v2.1.2** native payload and license list, then rebuilds this fork's Swift capture/cursor helpers and Rust compositor with an LGPL-only FFmpeg SDK. These changes preserve independent system/microphone audio and synchronized export. Xcode and Rust are required; the first native build downloads dependencies and takes longer than subsequent builds.

### 中文安装说明

请先安装 [Node.js 22.22.1](https://nodejs.org/en/download)、npm 10.9.4（随该 Node.js 版本提供）、带命令行工具的 Xcode 和 [Rust](https://rust-lang.org/tools/install/)。必要时执行 `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` 选择 Xcode。本项目要求使用 npm，因为 Electron 原生模块的构建依赖它。安装和原生编译至少预留 16 GB 可用空间，另需为录制和导出预留空间；16 GB 统一内存是已测试配置，并不代表应用会独占这些内存。

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

构建脚本先下载并校验上游 **v2.1.2** 原生组件和许可证，再使用仅启用 LGPL 的 FFmpeg SDK，重新编译本 fork 修改过的 Swift 录屏/光标辅助程序和 Rust 合成器，以保留系统声、麦克风独立音轨和同步导出能力。因此需要 Xcode 和 Rust；首次原生构建会下载依赖，耗时较长。

## Recording audio / 录制音频

On supported Macs, enable system audio and/or microphone, then adjust their independent 0–200% recording levels in **Device settings** on the recording bar or in the editor's **Record** page. Enabled sources are stored as separate AAC streams and adjacent source files. A 0% recording level permanently records silence for that source; editing gain cannot restore it.

在支持的 Mac 上，打开系统音频和/或麦克风后，可在录制条的**设备设置**或编辑器的**录制**页面，分别调整两路 0–200% 的录制音量。启用的声音来源保存为独立 AAC 音轨及同目录音频文件。录制音量为 0% 时，该路录入的是静音，后期增益无法恢复。

The editor's **Audio** panel controls each recorded source's gain and mute independently; selecting its timeline pill adjusts that clip's source. Source tracks follow picture edits, trims and speed changes. Keep the `.mp4`, `.session.json`, `-system.m4a` and `-microphone.m4a` files together when moving a recording. Older mixed recordings keep their existing audio behavior and cannot be separated retrospectively.

编辑器的**音频**面板可分别调整录入的系统声和麦克风增益、静音；选中时间轴上的对应音轨，可调整当前片段的该路声音。音轨跟随画面移动、剪切和变速。移动录制文件时，请同时保留 `.mp4`、`.session.json`、`-system.m4a` 和 `-microphone.m4a`。旧版已混音的录制保持原有行为，无法事后还原成独立两路。

## Two-source captions / 双轨字幕

Recordings with separate source audio are transcribed by Qwen independently, in sequence, on the same recording clock. In **Transcript**, choose **System audio** or **Microphone** to use the original word correction, seeking, cutting, restore and undo controls for that source. Cutting speech edits the shared picture timeline and both audio tracks; correcting its text changes only that source. Audio mute and caption visibility are independent.

对于含独立音轨的录制，Qwen 会按顺序分别识别系统声与麦克风，两者使用同一条录屏时间轴。在**转录文本**中切换**系统音频**或**麦克风**，即可分别使用原有的文字修正、点击定位、删剪、恢复及撤销功能。删剪语音会同步剪切画面与两路音频；修改文字只影响当前来源。音频静音和字幕显示开关相互独立。

In **Captions**, keep the master switch and independently enable either source. **Style settings for** selects the source whose font, colour, plate, six-position anchor, insets, line length and translation you edit. With one source enabled, its original placement behavior is preserved. With both enabled, the shared preview/export layout reserves different heights, placing system audio closer to the vertical center by default. **Swap caption heights** reverses those heights while keeping each source's style. Oversized captions automatically fit the two reserved areas.

在**字幕**面板中，保留总开关，并可分别开启或关闭两类字幕。**样式设置对象**用于选择要调整的来源，两轨分别保留字体、颜色、底板、六种位置、边距、行长及翻译设置。只显示一轨时，其配置和显示行为保持原样；同时显示两轨时，预览与导出使用同一套分层布局，默认系统音频字幕更靠近画面垂直中心。**调换两轨字幕位置**只交换高度，保留各自样式；字号过大时会自动适配两块独立区域。

Dual-source distance sliders show the rendered inset and its available range. Short captions stack more closely; wrapped captions reserve additional room. The inner caption's minimum inset prevents overlap with the outer caption. Reducing the outer inset also lets the inner caption move closer to the edge. Single-source positioning remains unchanged.

双轨字幕的边距滑块显示实际边距及可调范围。短字幕会更紧凑地分层，换行字幕则保留所需空间。靠内字幕的最小边距用于避免与外侧字幕重叠；减小外侧字幕边距，也能让靠内字幕进一步接近画面边缘。单轨的位置逻辑保持原样。

Caption display holds each line for up to one extra playback second after its aligned end, stopping when the next line on the same source starts or the video ends. Both sources follow this rule independently. Recognition results, aligned word timestamps and caption onsets are unchanged; preview and export use the same display rule, including through cuts and speed changes.

每条字幕在原始结束时间后，默认额外保留最多 1 秒实际播放时间；如果同一路的下一条字幕提前开始，或视频已结束，就立即切换或结束显示。两轨分别应用此规则。识别结果、原始逐字对齐时间戳和字幕出现时间均不改变，预览与导出使用相同的展示规则，并适配剪切及变速。

Use **SRT** in the **Transcript** pane's top tool row or the **Captions** header, then choose **System audio** or **Microphone** to save a separate UTF-8 subtitle file. Each file uses the edited video's common timeline, including cuts, speed changes and the one-second display hold. Export follows each source's current text, line length and selected translation, even when its display is hidden. SRT contains text and timing, without the preview's fonts, colours or stacking. Old mixed recordings are labelled **Recording audio (mixed)** and cannot be split into sources retrospectively.

在**转录文本**面板上方工具行或**字幕**窗口标题栏点击 **SRT**，选择**系统音频**或**麦克风**，分别保存 UTF-8 字幕文件。两份文件共用成片时间轴，并计算剪切、变速和额外一秒展示时间；使用各来源当前的文字、行长和已选翻译，关闭显示的字幕也可单独导出。SRT 只包含文字和时间，不保存预览中的字体、颜色及分层位置。旧版混音录制标为**录制音频（混合）**，无法事后还原成两路来源。

Both transcripts, styles and switches are saved with the project. CLI captions and MCP transcription also recognize the separate sources; MCP `setCaptionSettings` accepts `source`, `systemEnabled`, `microphoneEnabled` and `swapSources`. Existing mixed recordings retain their original single caption flow.

两路转录、样式和开关均随项目保存。CLI 字幕和 MCP 转写同样支持独立来源；MCP 的 `setCaptionSettings` 可传入 `source`、`systemEnabled`、`microphoneEnabled` 和 `swapSources`。旧版已混音的录制继续使用原有单路字幕流程。

## Data and operation

Runtime, model downloads and private configuration live under the current user's `~/Library/Application Support/OpenScreen-Qwen/`, outside the application and checkout. The app resolves this directory on each device. You can move or delete the source checkout after installation; keep the user data/runtime directory. No rebuild is required when a model path changes: rerun setup while the app is closed, then relaunch.

运行时、模型下载文件和私有配置保存在当前用户的 `~/Library/Application Support/OpenScreen-Qwen/` 中，与应用和源码目录隔离。应用会在每台设备上自动解析这个目录。安装完成后可以移动或删除源码目录，但需要保留用户数据和运行时目录。模型路径变化无需重新构建：关闭应用后重新执行安装脚本，再重新启动即可。

Project/media files remain local. This fork disables upstream usage-count telemetry and automatic updates. Model downloads contact their listed hosts. Explicit AI provider requests and the opt-in MCP server have their normal configured behavior; do not publish your project files, diagnostics or provider credentials.

项目和媒体文件始终保存在本地。本 fork 已停用上游使用量统计遥测和自动更新。模型下载只会连接模型清单中列出的主机。显式发起的 AI 服务请求以及选择启用的 MCP 服务仍按你的配置运行；不要发布项目文件、诊断信息或服务提供商凭据。

Run `npm run dev` for development after installing dependencies, native payload and Qwen runtime. If another application uses the same read-only ASR checkpoint, its environment is independent. Simultaneous inference/export still competes for memory and GPU; there is no cross-application job scheduler.

安装依赖、原生组件和 Qwen 运行时后，可执行 `npm run dev` 进入开发模式。如果其他应用也使用同一份只读 ASR 权重，它们的运行环境彼此独立。同时进行推理和导出时仍会竞争内存和 GPU 资源；本项目没有跨应用任务调度器。

## Supported transcription

Chinese, English, Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian and Spanish have alignment support. Automatic detection outside that set returns an explicit error. Character/word timestamps come from ForcedAligner; punctuation is restored from recognized text. The application does not fabricate evenly spaced word timings or overwrite an existing transcript after a failed job.

中文、英语、粤语、法语、德语、意大利语、日语、韩语、葡萄牙语、俄语和西班牙语支持对齐。对上述语言之外的自动检测会明确返回错误。字级/词级时间戳来自 ForcedAligner，标点符号根据识别文本恢复。应用不会伪造等间隔的词语时间，也不会在任务失败后覆盖已有字幕稿。

Validation covers the worker, cancellation/recovery, real app CLI/MCP transcription, caption rendering, word deletion, persistence and MP4 export. The full upstream manual checklist has not been passed across all platforms; long real-world recordings, recognition accuracy for every speaker and simultaneous third-party workloads remain outside that validation. See [validation scope](technical-documentation/testing/qwen-validation.md).

验证范围包括转写 worker、取消与恢复、真实应用中的 CLI/MCP 转写、字幕渲染、词语删除、项目持久化和 MP4 导出。完整的上游手动测试清单尚未在所有平台上完成；长时间真实录音、所有说话人的识别准确率以及与第三方应用同时运行，仍不属于本次验证范围。详见[验证范围](technical-documentation/testing/qwen-validation.md)。

## Provenance and license

OpenScreen was created by [Siddharth Vaddem](https://github.com/siddharthvaddem), then continued by [OpenScreen contributors](https://github.com/getopenscreen/openscreen). This fork retains their MIT license and copyright notices. Its additions integrate external Qwen/MLX dependencies; model weights and Python packages retain their own licenses and are not included in Git or the app bundle. See [LICENSE](LICENSE), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [third-party-licenses](third-party-licenses/).

OpenScreen 最初由 [Siddharth Vaddem](https://github.com/siddharthvaddem) 创建，随后由 [OpenScreen contributors](https://github.com/getopenscreen/openscreen) 继续维护。本 fork 保留其 MIT 许可证和版权声明。新增部分集成了外部 Qwen/MLX 依赖；模型权重和 Python 软件包各自遵循其许可证，未包含在 Git 历史或应用程序包中。详见 [LICENSE](LICENSE)、[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 和 [third-party-licenses](third-party-licenses/)。

This is an independent community fork, with no endorsement from OpenScreen, Qwen or MLX. Report fork-specific issues [here](https://github.com/erikhalilx/openscreen-qwen-asr/issues). Upstream documentation under `website/` and `README-UPSTREAM.md` is retained as historical reference and may describe different platforms, downloads or update behavior.

这是一个独立的社区 fork，不代表 OpenScreen、Qwen 或 MLX 的官方背书。请在[这里](https://github.com/erikhalilx/openscreen-qwen-asr/issues)报告本 fork 特有的问题。`website/` 和 `README-UPSTREAM.md` 下的上游文档作为历史参考保留，其中的平台、下载方式或更新行为可能与本版本不同。
