#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export OPENSCREEN_STT_ENGINE=qwen
export OPENSCREEN_MAC_SOURCE_PICKER=legacy
exec npm run dev
