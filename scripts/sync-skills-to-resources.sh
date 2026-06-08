#!/usr/bin/env bash
# Sync Claude skill source into the Tauri bundled resource directory.
#
# Source of truth: .claude/skills
# Generated copy:  app/src-tauri/resources/skills
#
# This mirrors app/src-tauri/build.rs so desktop builds and local checks read
# the same skill content.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${CLAUDE_SKILLS_DIR:-$ROOT/.claude/skills}"
DST="$ROOT/app/src-tauri/resources/skills"

if [[ ! -d "$SRC" ]]; then
  echo "MISSING: Claude skills source directory: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
rm -rf "$DST"
mkdir -p "$DST"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude '.DS_Store' "$SRC"/ "$DST"/
else
  cp -R "$SRC"/. "$DST"/
  find "$DST" -name '.DS_Store' -delete
fi

echo "Synced skills:"
echo "  source: $SRC"
echo "  target: $DST"
