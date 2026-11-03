#!/usr/bin/env bash
# Install only a verified local Qwen bundle; never replace the original Openscreen.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT_ROOT="$PWD"
APP_VERSION="$(node -p 'require("./package.json").version')"
SOURCE_APP="$PROJECT_ROOT/release/$APP_VERSION/mac-arm64/OpenScreen Qwen.app"
INSTALL_ROOT="${OPENSCREEN_QWEN_INSTALL_DIR:-/Applications}"
TARGET_APP="$INSTALL_ROOT/OpenScreen Qwen.app"
if [[ ! -d "$SOURCE_APP" ]]; then
  echo "Build the ARM64 application before installing: $SOURCE_APP" >&2
  exit 1
fi
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SOURCE_APP/Contents/Info.plist")" != "local.openscreen.qwen" ]]; then
  echo 'Refusing to install an unexpected application.' >&2
  exit 1
fi
/usr/bin/codesign --verify --deep --strict "$SOURCE_APP"
mkdir -p "$INSTALL_ROOT"
STAGING_DIR="$(mktemp -d "$INSTALL_ROOT/.openscreen-qwen-install.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT
/usr/bin/ditto "$SOURCE_APP" "$STAGING_DIR/OpenScreen Qwen.app"
/usr/bin/codesign --verify --deep --strict "$STAGING_DIR/OpenScreen Qwen.app"
if [[ -e "$TARGET_APP" ]]; then
  if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$TARGET_APP/Contents/Info.plist")" != "local.openscreen.qwen" ]]; then
    echo 'Refusing to replace an unexpected application.' >&2
    exit 1
  fi
  BACKUP_ROOT="$PROJECT_ROOT/.research/app-backups"
  mkdir -p "$BACKUP_ROOT"
  mv "$TARGET_APP" "$BACKUP_ROOT/OpenScreen Qwen-$(date +%Y%m%d-%H%M%S)-$$.app"
fi
mv "$STAGING_DIR/OpenScreen Qwen.app" "$TARGET_APP"
/usr/bin/codesign --verify --deep --strict "$TARGET_APP"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -u "$SOURCE_APP" || true
"$LSREGISTER" -f "$TARGET_APP"
echo "Installed: $TARGET_APP"
