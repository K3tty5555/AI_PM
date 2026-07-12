#!/usr/bin/env bash
# Content-level drift check for Claude skill source vs Tauri resource copy.
#
# Source of truth: .claude/skills
# Generated copy:  app/src-tauri/resources/skills
#
# Run scripts/sync-skills-to-resources.sh to repair drift.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${CLAUDE_SKILLS_DIR:-$ROOT/.claude/skills}"
DST="$ROOT/app/src-tauri/resources/skills"

fail=0

if [[ ! -d "$SRC" ]]; then
  echo "MISSING: Claude skills source directory: $SRC"
  exit 1
fi

if [[ ! -d "$DST" ]]; then
  # resources/skills 是构建期生成副本（app/src-tauri/build.rs 从 .claude/skills 生成、gitignore
  # 不随仓分发）——fresh clone 未构建时不存在是正确分发形态，无副本即无漂移（五轮复验 §3.4）。
  # 本机开发场景误删也无风险：下次构建会重生成。
  echo "N/A: resources/skills 未生成（build-time generated，fresh clone/未构建），无副本可比对"
  exit 0
fi

tmp_src="$(mktemp)"
tmp_dst="$(mktemp)"
trap 'rm -f "$tmp_src" "$tmp_dst"' EXIT

(
  cd "$SRC"
  # 只比对 git 追踪的 skill——.gitignore 的私有 skill（仅本机）不进资源副本、也不参与漂移检查
  # （与 build.rs / sync 脚本同口径，否则私有 skill 会被误报成 MISSING）
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files | sort
  else
    find . -type f ! -name '.DS_Store' | sed 's#^\./##' | sort
  fi
) >"$tmp_src"

(
  cd "$DST"
  find . -type f ! -name '.DS_Store' | sed 's#^\./##' | sort
) >"$tmp_dst"

source_only="$(comm -23 "$tmp_src" "$tmp_dst" || true)"
resource_only="$(comm -13 "$tmp_src" "$tmp_dst" || true)"

if [[ -n "$source_only" ]]; then
  echo "MISSING in app/src-tauri/resources/skills:"
  echo "$source_only" | sed 's/^/  - /'
  fail=1
fi

if [[ -n "$resource_only" ]]; then
  echo "EXTRA in app/src-tauri/resources/skills:"
  echo "$resource_only" | sed 's/^/  - /'
  fail=1
fi

changed=()
while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  if ! cmp -s "$SRC/$rel" "$DST/$rel"; then
    changed+=("$rel")
  fi
done < <(comm -12 "$tmp_src" "$tmp_dst")

if [[ "${#changed[@]}" -gt 0 ]]; then
  echo "DIFFERENT content between .claude/skills and app/src-tauri/resources/skills:"
  printf '  - %s\n' "${changed[@]}"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Skill resource drift detected."
  echo "Run: scripts/sync-skills-to-resources.sh"
  exit 1
fi

echo "OK: app/src-tauri/resources/skills matches .claude/skills"
