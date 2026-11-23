#!/usr/bin/env bash
# Install one runtime for OpenScreen, BalaDown and other macOS callers.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
target="${LOCAL_TRANSCRIPTION_ROOT:-$HOME/Library/Application Support/LocalTranscription}"
models="${LOCAL_TRANSCRIPTION_MODELS:-$HOME/Models/asr}"
swift build --package-path "$root/scripts/local-transcription" --configuration release
binary_dir="$(swift build --package-path "$root/scripts/local-transcription" --configuration release --show-bin-path)"
"$binary_dir/LocalDiarizer" --prepare
bash "$root/scripts/setup-qwen-local.sh" --data-dir "$target" --shared-models-dir "$models"
mkdir -p "$target/qwen-asr"
cp "$root"/scripts/qwen-asr/{worker,text,vad}.py "$target/qwen-asr/"
install -m 755 "$binary_dir/LocalDiarizer" "$target/LocalDiarizer"
install -m 644 "$root/scripts/local-transcription/local_transcription.py" "$target/local_transcription.py"
printf '%s\n' "Local transcription installed at $target"
