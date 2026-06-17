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

# 只同步 git 追踪的 skill——.gitignore 的私有 skill（仅本机、含内网域名/凭证逻辑）不进客户端资源副本。
# 与 build.rs 的 git check-ignore 同口径，避免 release build 把私有 skill 打进安装包。
if git -C "$SRC" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ( cd "$SRC" && git ls-files ) | while IFS= read -r f; do
    [ -z "$f" ] && continue
    mkdir -p "$DST/$(dirname "$f")"
    cp "$SRC/$f" "$DST/$f"
  done
else
  echo "⚠️  git 不可用，回退整目录复制（可能含私有 skill，请人工确认 resources/skills）" >&2
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude '.DS_Store' "$SRC"/ "$DST"/
  else
    cp -R "$SRC"/. "$DST"/
    find "$DST" -name '.DS_Store' -delete
  fi
fi

echo "Synced skills:"
echo "  source: $SRC"
echo "  target: $DST"
