# Shared local transcription on Apple Silicon

From the OpenScreen Qwen checkout, run `bash scripts/setup-local-transcription.sh`.
The installer uses Swift 6.2 or newer and the existing pinned Qwen setup. Install FFmpeg on
the calling machine for standalone media import. The runtime targets Apple Silicon with
macOS 26 or later.

- Runtime default: `~/Library/Application Support/LocalTranscription`. Set
  `LOCAL_TRANSCRIPTION_ROOT` when installing and in each app's launch environment to use
  another directory.
- Shared Qwen model directory: `~/Models/asr`. Set `LOCAL_TRANSCRIPTION_MODELS` at install
  time for a different directory. Existing validated weights are reused read-only. A fresh
  model directory is populated from the pinned model manifest.
- FluidAudio Community-1 weights are prepared into FluidAudio's per-user model cache.
  Use is offline after model preparation. The [Core ML artifacts and attribution](https://huggingface.co/FluidInference/speaker-diarization-coreml)
  describe the model license. The FluidAudio SDK version is in [Package.resolved](Package.resolved).

OpenScreen Qwen uses the shared Qwen model paths by default when installed. Explicit
`OPENSCREEN_QWEN_CONFIG` and per-model environment overrides still select the caller's
chosen runtime. BalaDown uses its existing Qwen worker, including checkpoint recovery,
with the same shared speaker analysis and model directory.

## Calling from another tool

```sh
runtime="${LOCAL_TRANSCRIPTION_ROOT:-$HOME/Library/Application Support/LocalTranscription}"
"$runtime/runtime/venv/bin/python" -I "$runtime/local_transcription.py" transcribe "/path/to/audio.mp4"
```

By default the tool infers speaker count. Pass `--speakers 2` when the recording has
exactly two speakers. Optional `--language zh` selects the ASR language. The complete
run normalizes the input, transcribes, aligns, then analyzes speakers sequentially.

For callers that already have aligned words, use `attribute /path/to/audio.wav` (also
accepts `--speakers`). Pass a JSON object on stdin with `version: 1` and
`wordSegments` containing `word`, `startSec`, and `endSec`. Use the same 16 kHz mono
PCM WAV used for alignment, with silence and original offsets intact.

The JSON response uses version 1 and a source-relative clock in seconds. It carries
`speakers` (source-local IDs), `speakerTurns` (including overlap), `wordSegments`, and
`speakerSegments` (speaker-aware text runs). Both text arrays carry `speakerId` independently
of the text field. An ambiguous word has a null ID. Scope the IDs to the input recording
or audio asset. Applications can store a separate display name for each ID and per-caption
overrides. In OpenScreen, a null override explicitly clears only that caption's visible label.
