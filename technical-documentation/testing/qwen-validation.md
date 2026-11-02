# Qwen fork validation

## Caption display hold — 2026-11-03

The display layer copies aligned cues and extends their ends by up to one playback second, bounded by the next visible cue on that source and the programme end. Raw transcript/cue timing generation is untouched. Unit tests cover short/zero/exact-one-second gaps, programme boundaries, deleted cues, cuts, 2x/0.5x playback and a speed boundary; dual-source tests confirm that the other source does not truncate the hold.

The preceding packaged build and this build exported the same saved synthetic speech project at 1x and 2x. Both source transcripts remain byte-for-byte equivalent as JSON (36 aligned units each). Decoded audio hashes match between old and new exports at both speeds. At 5.7 seconds the formerly blank microphone row contains held text; the next caption matches the original at frame 180 (6.000 seconds, white-ink mask IoU 0.991). The system caption remains visible half a playback second after its original 9.36-second end, and is absent after 1.2 seconds; the same checks pass at 2x. Exports retain 420 frames at 1x and 210 at 2x. Computer-use on the installed build also confirms that the last system caption remains visible at 9.8 seconds and is absent at 10.8 seconds. Stale Accessibility, screen/system-audio and microphone grants were refreshed for the current installation, with user authentication and microphone confirmation; the application reports Accessibility and microphone allowed, and System Settings shows both recording grants enabled. Full suite: 4,968 passed, one existing skip; both TypeScript checks, i18n, lint and source privacy audit pass. This is a local caption-only build, not release promotion; capture, webcam and ASR quality were not re-tested for this change.

字幕展示层复制对齐结果，并把结束时间延长最多 1 秒实际播放时间；同轨下一句开始或视频结束时停止延长，不改动识别及对齐生成逻辑。单元测试覆盖短间隔、无间隔、一秒间隔、视频结尾、已删除字幕、剪切、快慢速及变速边界，并验证两路字幕互不截断。

新旧安装包对同一合成语音项目分别导出原速及 2 倍速视频：两路转录各 36 个对齐单元，JSON 完全一致；两种速度下的导出音频解码哈希也完全一致。原本 5.7 秒已消失的麦克风字幕现在继续显示；第 180 帧（6.000 秒）的下一句与原版一致。末句多保留半秒时仍可见，超过一秒后消失，2 倍速同样按实际播放时间验证通过。总帧数保持原速 420 帧、2 倍速 210 帧。安装后通过桌面操作确认末句在 9.8 秒仍显示、10.8 秒已消失，并完成当前安装包的辅助功能、屏幕/系统录音和麦克风旧授权刷新；身份验证及麦克风系统弹窗由用户完成，应用和系统设置中的对应状态已确认。完整测试 4,968 项通过、1 项原有跳过项，类型、翻译键、lint 与源码脱敏检查通过。本次不涉及候选版本晋级，没有重做录制、摄像头或 ASR 识别质量测试。

## Caption inset correction — 2026-11-03

Dual-source stacking now reserves a conservative wrapped-text height instead of the single-source box's three-line headroom. The inset slider and renderer share the same collision limits and effective positions, so values in the exposed range move the selected caption. Single-source placement is unchanged. Computer-use on the packaged build verified the actual minimum, a 0.5% keyboard increment, the preview, and returning to the minimum.

Six native exports covered bottom-edge placement, the first 0.5% step, a larger inset, swapped sources, top-edge placement and wrapped Chinese text. Each export has 420 frames at 30 FPS. At 540p, inner yellow ink occupies rows 460–481 at the minimum and 458–479 after the first step; outer white ink stays at 512–531. The wrapped case occupies yellow rows 338–414 and white rows 451–527. Pixel checks confirm movement and separation. Full suite: 4,956 passed, one existing skip; focused follow-up, both TypeScript configurations, i18n and lint passed. The DMG and packaged signature were verified. Capture, permissions, ASR regeneration, other platforms and the full release checklist were not rerun for this caption-only change.

双轨分层改为按字幕的保守换行高度预留空间，消除了把三行空白余量当成字幕间距的问题。滑块和渲染使用同一套防重叠限制及实际位置，已验证最低可调值、首次 0.5% 调节和回到最小值；单轨位置保持原样。六份导出覆盖底边、半个百分点变化、更大边距、交换位置、顶边及中文换行，逐像素检查确认移动有效且不重叠。完整测试 4,956 项通过、1 项原有跳过项，两份类型检查、翻译键检查、lint 和安装包校验通过。本次只验证字幕位置，没有重做录制、权限、ASR 或其他平台测试。

Supported deployment target: Apple Silicon, macOS 26+, Node 22.22.1/npm 10.9.4 and the pinned Python 3.12/MLX runtime. The underlying capture/editor source remains complete; other Qwen inference platforms are not claimed.

The original integration was exercised through the actual Electron CLI/MCP: create a project, transcribe synthetic Chinese, align characters, enable captions, save/reopen, export H.264/AAC, delete an aligned character, export the shorter result and restore a checkpoint. Exported captions were visually checked. Computer-use checked the packaged HUD, Studio, transcript seeking, caption preview and regeneration. A 74.48-second fixture retained source positions across chunk boundaries and a 25-second pause; pure silence returned no words. Cancellation, worker errors and recovery have automated tests.

The source-publication changes add a clean user-data installation, pinned model hashes, private-config atomic publication, checks for read-only external models, and runtime-path tests. Setup must pass a clean-directory real model download and offline worker smoke test; the built app must pass transcription/export using that new runtime before publication. The full Vitest suite, both TypeScript configurations, Python tests, i18n and lint are run for the publication revision. Results are recorded in the manual checklist's results log.

Skipped coverage is not a pass: real microphone/webcam permissions and capture, all platform-specific checklist items, AI providers without configured credentials, real 30–60 minute recordings and cross-application concurrent inference. Synthetic speech does not establish recognition accuracy across all speakers. This is source publication, not promotion of an upstream release candidate.

## Source-publication verification — 2026-11-01

- Clean single-branch source clone: `npm ci`, official pinned native archive download, all native file hashes, `npm run qwen:build`, and deep/strict application signature verification passed. No pre-existing checkout binaries or hidden local config were used.
- Fresh empty model/runtime directory: both official Qwen checkpoints and Silero downloaded and verified; actual offline worker transcription/alignment passed.
- Packaged application: fresh-runtime CLI/MCP transcription (36 Chinese units), checkpoint, captions and H.264/AAC export passed. Computer-use verified user-data-runtime regeneration, transcript seek to 5.5 seconds and rendered Chinese caption preview.
- Full Vitest suite: 353 files passed, 4921 tests passed and 1 skipped. Python: 9 tests passed. Both TypeScript checks and i18n passed. Lint: no errors, 26 inherited warnings. The final privacy-checker adjustment and example-path sanitization also passed targeted checks.
- Published snapshot and complete fork additions/history passed the publication scanner. Negative checks rejected an actual device home path and a model-weight artifact while accepting a synthetic example path. Original private development commits are absent from the publication branch.

The skipped manual checks listed above remain skipped. These results establish the documented source-installation route and tested editing/transcription/export slice; they are not a universal recognition-quality or multi-platform release certification.

## Separate recording audio and captions — 2026-11-02

The locally packaged ARM64 build includes rebuilt Swift capture/cursor helpers and a rebuilt Rust compositor. Computer-use verified both recording-volume sliders in Device settings and Record mode, independent editing gains, two locked source lanes, separate transcript editors, word corrections and undo, independent caption visibility/styles, height swapping, and the single-source fallback. Settings survived application restarts. The existing Qwen runtime/checkpoints were reused without changing any other application's environment.

Two real window recordings completed without a repeated Accessibility prompt after stale grants were re-registered for this installation. The first exercised pause/resume and automatically opened the new 41.28-second recording in the editor. Its system and microphone AAC streams both start at zero and both last 41.279979 seconds. Synthetic speech played during capture was transcribed on the system source; the microphone source correctly returned silence. The two sources are recording inputs, not speaker diarization: loudspeaker sound picked up acoustically by a microphone can legitimately appear in both. Headphones reduce that duplication.

The real recording was exported through the GUI save dialog to H.264/AAC, decoded fully with FFmpeg, and its Chinese captions were visually checked. The final screen frame ends at 40.911667 seconds, so the existing exporter clamps the picture programme to that boundary: `ceil((40.911667 - 0.001) * 30) = 1228` frames, as measured. This explains the difference from the audio-sized editor clip; it is not an exact-duration capture guarantee.

A separate 14-second fixture placed microphone speech three seconds after system speech. Actual Qwen transcription preserved that offset. Four native exports covered both sources, system only, microphone only, and swapped heights; every export has 420 frames at 30 FPS. Pixel inspection at five seconds found yellow system text at rows 366–389 and white microphone text at 504–523; after swapping, white occupies 371–390 and yellow 500–523. Single-source exports contain only the enabled text at its original bottom anchor. Automated tests also cover all six single-source anchors, mixed font sizes/aspects, source-specific translations, common cuts, duplicate-clip gain inheritance and AI word edits.

Both TypeScript configurations, i18n, privacy checks and lint passed (26 inherited lint warnings). The full suite before the final AI-tool compatibility adjustment passed 4,948 tests, with one existing skip; the subsequent targeted source-edit and anchor tests passed. Swift mixer tests and the Rust recording-source gain/speed test passed. These are local feature checks, not a release-candidate promotion.

Skipped: camera capture/attachment (no new camera permission requested), Apple's system source picker (the legacy app picker was used), long real recordings, simultaneous Baladown/OpenScreen inference, translation providers without credentials, other platforms, and the remaining full manual checklist.

本次本地 ARM64 安装包重新编译了 Swift 录屏/光标程序及 Rust 合成器。已通过桌面操作验证录制前两路音量、后期独立增益、双音轨、两路转录改字与撤销、字幕独立开关/样式、位置交换和单轨位置回退；重启后设置保留。现有 Qwen 权重只读复用，没有改动其他应用环境。

重新登记当前安装包的旧授权后，两次真实窗口录制均完成，没有重复辅助功能弹窗。首段包含暂停/继续，停止后自动打开新项目；系统声和麦克风 AAC 都从零开始，时长同为 41.279979 秒。系统声中的测试语音已识别，麦克风静音未生成假字幕。这是按输入来源分轨，不是说话人分离；扬声器声音若被麦克风再次收录，两路可能出现相同内容，耳机可减少这种情况。

真实录制经 GUI 导出并完整解码，中文字幕已检查。静止画面最后一帧早于音频结束，原有导出器按可用视频结尾裁定节目长度，得到符合计算的 1228 帧；不将此项表述为录制时长完全一致的保证。另一个 14 秒合成样本验证两路语音相差三秒时保留共同时钟，双开、各自单开、交换高度四份导出均为 420 帧；逐像素检查确认分层不重叠、交换后样式跟随来源、单开时恢复原位置。

未覆盖摄像头实录/附加、Apple 系统来源选择器、长录制、与 Baladown 同时推理、未配置的翻译服务、其他平台及完整手工清单；本次不是候选版本晋级测试。
