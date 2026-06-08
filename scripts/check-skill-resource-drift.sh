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
  echo "MISSING: Tauri skill resource directory: $DST"
  echo "Run: scripts/sync-skills-to-resources.sh"
  exit 1
fi

tmp_src="$(mktemp)"
tmp_dst="$(mktemp)"
trap 'rm -f "$tmp_src" "$tmp_dst"' EXIT

(
  cd "$SRC"
  find . -type f ! -name '.DS_Store' | sed 's#^\./##' | sort
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
