# OpenScreen Qwen 技术方案

基础为 OpenScreen v2.1.2，提交 `d8889c626f859e0be8f4f87fdffc7362629550bc`。

Electron 主进程保留原音轨提取和编辑数据契约，通过 stdin/stdout NDJSON 调用独立 Python worker。MLX 读取官方 Qwen3-ASR-0.6B Safetensors，在内存中适配布局；ForcedAligner 生成真实字词时间；Silero ONNX CPU VAD 保留源音频时钟。中文标点从原始转写恢复，字幕按 CJK 规则组合。

GUI、自动转写、CLI 和 MCP 共用相同后端。任务串行执行，失败重试一次，缺失对齐或无效时间戳拒绝落盘，取消后终止进程。正常推理离线，不启动 ASR HTTP 服务。共享原模型只读，不修改其他项目的环境、权重或配置；并发资源争用仍需用户安排。

部署由固定版本依赖锁和模型清单驱动。新设备自动下载官方模型并逐文件校验。运行环境与模型位于用户数据目录，应用包仅包含适配代码、模型来源清单和许可证。模型格式、支持设备、完整安装流程及限制见 [安装说明](README-QWEN.zh-CN.md)。

OpenScreen 使用 MIT，MLX Qwen 实现和 Qwen 模型使用 Apache-2.0，Silero 使用 MIT。第三方关系、来源和许可文本见 [第三方声明](THIRD-PARTY-NOTICES.md)。这不是上游官方发行，不继承其签名、公证或更新渠道。
