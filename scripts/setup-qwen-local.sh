#!/usr/bin/env bash
# Install the version-matched runtime and models in the current user's data directory.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo 'Usage: bash setup-qwen-local.sh [--data-dir PATH] [--model-path PATH] [--smoke-audio WAV]'
  exit 0
fi
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'Qwen setup requires Apple Silicon and macOS 26 or later.' >&2
  exit 1
fi
macos_version="$(sw_vers -productVersion)"
if (( ${macos_version%%.*} < 26 )); then
  echo 'Qwen setup requires macOS 26 or later.' >&2
  exit 1
fi

if [[ -x "$HOME/.local/bin/uv" ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v uv >/dev/null; then
  bootstrap="$(mktemp -d)"
  trap 'rm -rf "$bootstrap"' EXIT
  echo 'Preparing uv for Qwen setup...'
  /usr/bin/curl -fsSL --proto "=https" --proto-redir "=https" --retry 3 https://astral.sh/uv/0.12.3/install.sh -o "$bootstrap/install.sh"
  UV_UNMANAGED_INSTALL="$bootstrap/bin" /bin/sh "$bootstrap/install.sh"
  export PATH="$bootstrap/bin:$PATH"
fi

uv python install 3.12
python="$(uv python find 3.12)"
"$python" -I scripts/qwen-asr/setup_runtime.py "$@"
echo 'Setup finished. Quit OpenScreen Qwen with Cmd+Q, then reopen it and retry transcription.'
