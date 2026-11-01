#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for INSTALLED_APP in "/Applications/OpenScreen Qwen.app" "$HOME/Applications/OpenScreen Qwen.app"; do
  if [[ -d "$INSTALLED_APP" ]]; then
    exec open "$INSTALLED_APP"
  fi
done
APP="$PWD/release/2.1.2/mac-arm64/OpenScreen Qwen.app"
if [[ -d "$APP" ]]; then
  exec open -n "$APP"
fi
exec ./run-qwen-local.sh
