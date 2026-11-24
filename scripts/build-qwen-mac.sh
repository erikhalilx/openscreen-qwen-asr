#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prepare-qwen-native.mjs
npm run build:native:mac
npm run fetch:ffmpeg:mac
npm run build:native:compositor:mac
npm run build-vite

PRODUCT_NAME="OpenScreen Qwen"
BUILDER_ARGS=()
if [[ "${1:-}" == "--dev" ]]; then
  PRODUCT_NAME="OpenScreen Qwen Dev"
  BUILDER_ARGS+=(
    "--config.productName=$PRODUCT_NAME"
    "--config.extraMetadata.productName=$PRODUCT_NAME"
    "--config.appId=local.openscreen.qwen.dev"
  )
fi
npx electron-builder --mac --arm64 --dir --publish never "${BUILDER_ARGS[@]}"

APP_VERSION="$(node -p 'require("./package.json").version')"
if [[ -f "$HOME/Library/Application Support/OpenScreen Qwen/Local Signing/local.crt" ]]; then
  node scripts/sign-qwen-local.mjs "release/$APP_VERSION/mac-arm64/$PRODUCT_NAME.app"
else
  echo "Built with an ad-hoc signature; configure a persistent signing identity to retain grants across rebuilds."
fi
