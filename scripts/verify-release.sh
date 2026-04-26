#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/app"
TAURI_DIR="$APP_DIR/src-tauri"
RESOURCE_SKILLS="$TAURI_DIR/resources/skills"
BUNDLE_DIR="$TAURI_DIR/target/release/bundle"

log() {
  printf '\n==> %s\n' "$1"
}

run() {
  printf '+ %s\n' "$*"
  "$@"
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "MISSING: $path"
    exit 1
  fi
}

require_dir() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    echo "MISSING: $path"
    exit 1
  fi
}

log "Repository checks"
run git -C "$ROOT" diff --check
run "$ROOT/scripts/ai-sync/check-ai-context-drift.sh"

log "Rust checks"
(
  cd "$TAURI_DIR"
  run cargo check
  run cargo test
)

log "Frontend build"
(
  cd "$APP_DIR"
  run npm run build
)

log "Tauri release build"
(
  cd "$APP_DIR"
  run npm run tauri build
)

log "Generated resource checks"
require_dir "$RESOURCE_SKILLS"
require_file "$RESOURCE_SKILLS/ai-pm-prd/SKILL.md"
require_file "$RESOURCE_SKILLS/ai-pm-driver/SKILL.md"
require_file "$RESOURCE_SKILLS/ai-pm-review/SKILL.md"
require_file "$RESOURCE_SKILLS/ai-pm-review-modify/SKILL.md"
require_file "$RESOURCE_SKILLS/Humanizer-zh/SKILL.md"

log "Bundle artifact checks"
require_dir "$BUNDLE_DIR"
artifact_count="$(
  find "$BUNDLE_DIR" -maxdepth 3 \( \
    -name '*.app' -o \
    -name '*.dmg' -o \
    -name '*.pkg' -o \
    -name '*.msi' -o \
    -name '*.exe' -o \
    -name '*.AppImage' -o \
    -name '*.deb' -o \
    -name '*.rpm' \
  \) | wc -l | tr -d ' '
)"
if [[ "$artifact_count" -eq 0 ]]; then
  echo "MISSING: no release bundle artifacts found in $BUNDLE_DIR"
  exit 1
fi

echo "Found $artifact_count release artifact(s)."
echo "Release verification passed."
