#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-qwen-native.mjs
npm run build-vite
npx electron-builder --mac --arm64 --dir --publish never
