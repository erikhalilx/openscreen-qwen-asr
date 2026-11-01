# Qwen fork validation

Supported deployment target: Apple Silicon, macOS 26+, Node 22.22.1/npm 10.9.4 and the pinned Python 3.12/MLX runtime. The underlying capture/editor source remains complete; other Qwen inference platforms are not claimed.

The original integration was exercised through the actual Electron CLI/MCP: create a project, transcribe synthetic Chinese, align characters, enable captions, save/reopen, export H.264/AAC, delete an aligned character, export the shorter result and restore a checkpoint. Exported captions were visually checked. Computer-use checked the packaged HUD, Studio, transcript seeking, caption preview and regeneration. A 74.48-second fixture retained source positions across chunk boundaries and a 25-second pause; pure silence returned no words. Cancellation, worker errors and recovery have automated tests.

The source-publication changes add a clean user-data installation, pinned model hashes, private-config atomic publication, checks for read-only external models, and runtime-path tests. Setup must pass a clean-directory real model download and offline worker smoke test; the built app must pass transcription/export using that new runtime before publication. The full Vitest suite, both TypeScript configurations, Python tests, i18n and lint are run for the publication revision. Results are recorded in the manual checklist's results log.

Skipped coverage is not a pass: real microphone/webcam permissions and capture, all platform-specific checklist items, AI providers without configured credentials, real 30–60 minute recordings and cross-application concurrent inference. Synthetic speech does not establish recognition accuracy across all speakers. This is source publication, not promotion of an upstream release candidate.
