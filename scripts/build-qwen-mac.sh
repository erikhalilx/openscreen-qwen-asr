#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-qwen-native.mjs
npm run build:native:mac
npm run fetch:ffmpeg:mac
npm run build:native:compositor:mac
npm run build-vite
npx electron-builder --mac --arm64 --dir --publish never

APP_VERSION="$(node -p 'require("./package.json").version')"
if [[ -f "$HOME/Library/Application Support/OpenScreen Qwen/Local Signing/local.crt" ]]; then
  node scripts/sign-qwen-local.mjs "release/$APP_VERSION/mac-arm64/OpenScreen Qwen.app"
else
  echo "Built with an ad-hoc signature; configure a persistent signing identity to retain grants across rebuilds."
fi
