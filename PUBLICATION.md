# Publication and privacy policy

Only reviewed Git commits are published. Runtime directories, model weights, local configuration, environment files, recordings, project files, diagnostics, test outputs and build products stay outside Git. `npm run privacy:check` checks source and `npm run privacy:check -- --ref main` checks the complete fork history (including removed files and commit metadata) plus the published snapshot before publishing; unchanged public upstream ancestry is preserved. CI repeats the history check. The GitHub account identity is intentionally public; maintainers should use a GitHub noreply commit email rather than a private address.

Separate recorded audio (`-system.m4a`, `-microphone.m4a`), session manifests and cursor sidecars are private media. They stay in the user's recordings directory and are excluded from new Git additions; the publication audit also rejects the application's generated recording-sidecar names. The existing, reviewed upstream audio-peak fixture remains versioned. Two-source transcripts and caption settings live in private project documents, not in the source checkout.

独立录制音频（`-system.m4a`、`-microphone.m4a`）、会话清单与光标旁路文件属于私有媒体，保存在用户录制目录，并从新的 Git 文件添加中排除；发布审计也会拒绝应用生成的录制旁路文件名。上游已有且经过审阅的音频峰值测试样本继续保留。两路转录与字幕设置保存在私有项目文档中，不进入源码目录。

A `.gitignore` does not sanitize old commits or release attachments. The initial public branch retains the unmodified OpenScreen v2.1.2 ancestry and uses a sanitized fork commit. Earlier private development commits/branches, reflogs, bundles, logs and old app packages are never pushed. Do not use `git push --all`, `--mirror`, or upload a workspace directory wholesale.

Each device creates `qwen.local.json` and its runtime in its own application data directory. No such config is copied into a distributable. Model manifests contain public identifiers/hashes/URLs, not local file locations. Generic example paths in tests/documentation are synthetic and do not identify a developer's device.

Upstream usage-count telemetry is disabled at the transport boundary for GUI and CLI/MCP. Automatic upstream updates and star prompts are disabled. Local inference is offline. Downloads, user-requested external links, configured AI providers and explicitly enabled MCP endpoints retain their stated network behavior. Credentials, media and diagnostics must not be attached to public issues. Project files can contain the current user's media paths; do not redistribute them without separate review.

Upstream release, store, Discord and bookkeeping workflows are retained for provenance but guarded so their jobs run only in the original upstream repository. This fork's workflow performs code/model-manifest/privacy checks and does not publish to stores or upload local build artifacts. Repository links and installation instructions identify the fork; `README-UPSTREAM.md` and `website/` are historical upstream references.

The first publication is a **source distribution**, with a tested local-installation route. An ad-hoc signed local `.app` is not an Apple-notarized product. Any future binary release requires a separate artifact scan (including native binaries, strings, source maps, archives, metadata and embedded configuration), bundled third-party-license review, and the applicable manual end-to-end checklist. Source publication is not a full multi-platform release-promotion pass.
