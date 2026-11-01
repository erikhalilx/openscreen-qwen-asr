#!/usr/bin/env bash
# Model files and Python are device-local; nothing is written into shared ASR checkpoints.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo 'Install uv: https://docs.astral.sh/uv/getting-started/installation/' >&2; exit 1; }
uv python install 3.12
QWEN_BOOTSTRAP_PYTHON="$(uv python find 3.12)"
exec "$QWEN_BOOTSTRAP_PYTHON" scripts/qwen-asr/setup_runtime.py "$@"
