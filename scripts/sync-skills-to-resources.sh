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
  # 2026-07-10 波0A#4：fail-closed——无法用 git 判定私有 skill 边界时拒绝复制，
  # 绝不回退整目录（防私有 skill 混入客户端资源副本/安装包）。
  echo "❌ git 不可用，无法判定私有 skill 边界——拒绝同步（fail-closed）。请在 git 仓库内运行。" >&2
  exit 1
fi

echo "Synced skills:"
echo "  source: $SRC"
echo "  target: $DST"
