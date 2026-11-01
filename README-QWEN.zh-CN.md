# OpenScreen Qwen3-ASR：千问本地语音识别版

这是基于 [OpenScreen v2.1.2](https://github.com/getopenscreen/openscreen/releases/tag/v2.1.2) 的独立社区 Fork，默认使用 Qwen3-ASR-0.6B、Qwen3-ForcedAligner-0.6B 和 Silero VAD。保留录屏、编辑器、时间线、摄像头效果、原生预览、字幕、项目保存、导出及 CLI/MCP 源码。AI 聊天和翻译仍需用户配置自己的服务商。

## 设备要求

- Apple Silicon Mac，**macOS 26 或以上**。这是固定版本 MLX 0.32.2 的运行要求；本版本不支持 Windows、Linux 或 Intel Mac 的 Qwen 推理。
- Node.js **22.22.1**、npm **10.9.4**、[uv](https://docs.astral.sh/uv/getting-started/installation/)。使用 npm。
- 安装预留至少 8 GB 空间，另需录屏和导出空间。16 GB 统一内存是已验证配置；并发软件仍会争用内存和 GPU。

## 新设备完整安装

```bash
git clone https://github.com/erikhalilx/openscreen-qwen-asr.git
cd openscreen-qwen-asr
npm ci
npm run qwen:setup
npm run qwen:build
npm run qwen:install
```

完成后在“应用程序”中打开 **OpenScreen Qwen**。不需要预先下载 Qwen 权重。安装脚本创建独立 Python 3.12 环境，下载官方 ASR、对齐器和 VAD，逐文件校验 SHA-256，成功后才更新私有配置。首次安装需要联网，正常转写强制离线。

原生组件由脚本从上游 v2.1.2 官方发布包提取，校验压缩包和全部组件的 SHA-256，并保留完整第三方声明。原生源码未修改，新设备无需自行编译 Rust/FFmpeg；完整源码构建入口仍保留。

应用在本机使用 ad-hoc 签名，未经过 Apple Developer ID 公证。系统如有提示，应通过正常的“仍要打开”流程处理自己信任的本地构建；上游安装包的公证不适用于此 Fork。

安装失败可重跑相同命令；下载文件不通过校验时不会启用新配置。安装脚本不会修改系统 Python、其他项目环境或用户提供的共享权重。

## 模型与路径

[模型清单](models/README.md) 列出了官方模型页面、固定快照、每个文件的下载地址、大小和 SHA-256。两个 Qwen 权重文件合计约 **3.72 GB**，另加词表和依赖。Git 和应用包中均不包含 Qwen/Silero 权重。

默认位置是当前用户的：

```text
~/Library/Application Support/OpenScreen-Qwen/
  qwen.local.json
  runtime/venv/
  runtime/models/Qwen3-ASR-0.6B/
  runtime/models/Qwen3-ForcedAligner-0.6B/
  runtime/models/silero-vad/
  runtime/PYTHON-THIRD-PARTY-LICENSES.txt
```

已拥有官方原始 0.6B 权重时，可只读复用：

```bash
npm run qwen:setup -- --model-path /path/to/Qwen3-ASR-0.6B
```

文件必须匹配官方快照，量化或转换后权重不能冒充此版本。提供外部路径后不会向该目录下载、转换、覆盖模型或写入许可证。对齐器与 VAD 仍由本应用独立管理。

应用启动时读取当前设备用户目录中的配置，应用包不携带开发者路径。安装完成后可移动或删除源码目录；保留用户数据目录。更换模型路径时退出应用、重跑 setup 并重新打开即可，无需重新打包。

`qwen.example.json` 是通用模板；可用 `OPENSCREEN_QWEN_CONFIG` 指定私有配置位置。`OPENSCREEN_QWEN_PYTHON`、`OPENSCREEN_QWEN_MODEL`、`OPENSCREEN_QWEN_ALIGNER`、`OPENSCREEN_QWEN_VAD` 可覆盖对应路径。自定义 `--data-dir` 主要用于测试，启动应用时需同时指定其配置文件。

## 使用与验证范围

应用和原版独立保存项目及设置，关闭上游自动更新和用量上报。每个转写任务使用独立 worker，完成或取消后退出。共享权重只读不影响其他软件的环境；同时转写或导出仍可能变慢，没有跨项目自动排队。

对齐支持中文、英文、粤语、法语、德语、意大利语、日语、韩语、葡萄牙语、俄语、西班牙语。其他自动检测语言明确报错。中文时间戳按字对齐并恢复标点，字幕按中文规则组合。

转写、字幕预览、按字删剪、保存与 MP4 导出已做闭环验证；具体结果及未覆盖项目见[验证记录](technical-documentation/testing/qwen-validation.md)。不承诺所有音频识别率、长录屏或任意并发负载都与短样本相同。

## 开发和更新

```bash
npm run dev
npm run test:qwen-python
npm run test
npx tsc --noEmit
npx tsc -p tsconfig.test.json --noEmit
npm run lint
npm run i18n:check
```

源码更新后重新运行 `npm run qwen:build`、`npm run qwen:install`。安装脚本验证签名并备份已有定制版，不覆盖原版。模型运行目录不随应用升级被替换。

本 Fork 继续使用 MIT，第三方模型及依赖保留各自许可。详见 [第三方声明](THIRD-PARTY-NOTICES.md) 和[发布隔离策略](PUBLICATION.md)。
