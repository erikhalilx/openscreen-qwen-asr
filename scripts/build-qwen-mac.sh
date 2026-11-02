#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-qwen-native.mjs
npm run build:native:mac
npm run fetch:ffmpeg:mac
npm run build:native:compositor:mac
npm run build-vite
npx electron-builder --mac --arm64 --dir --publish never
