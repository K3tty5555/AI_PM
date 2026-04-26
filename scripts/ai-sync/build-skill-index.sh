#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"
SOURCE="${CLAUDE_SKILLS_DIR:-$ROOT/.claude/skills}"
OUT="$ROOT/.ai-shared/skill-index.md"
DISPLAY_SOURCE="$(ai_pm_display_path "$SOURCE" "$ROOT")"

mkdir -p "$(dirname "$OUT")"

if [[ ! -d "$SOURCE" ]]; then
  echo "Claude skills dir not found: $SOURCE" >&2
  exit 1
fi

extract_field() {
  local file="$1"
  local field="$2"
  awk -v field="$field" '
    BEGIN { in_fm=0; capture=0; value="" }
    NR == 1 && $0 == "---" { in_fm=1; next }
    in_fm && $0 == "---" { if (capture) print value; exit }
    in_fm && capture {
      if ($0 ~ /^[a-zA-Z_-]+:/) { print value; exit }
      gsub(/^[[:space:]]+/, "", $0)
      value = value " " $0
      next
    }
    in_fm && index($0, field ":") == 1 {
      sub(field ":[[:space:]]*", "", $0)
      if ($0 == ">-" || $0 == "|" || $0 == ">") { capture=1; next }
      print $0
      exit
    }
  ' "$file" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//'
}

{
  echo "---"
  echo "generated_at: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "source: $DISPLAY_SOURCE"
  echo "do_not_edit: true"
  echo "---"
  echo
  echo "# Claude Skill 索引"
  echo
  echo "| Skill | 入口 | 用途 |"
  echo "|------|------|------|"

  while IFS= read -r file; do
    name="$(extract_field "$file" name)"
    desc="$(extract_field "$file" description)"
    rel="${file#$ROOT/}"
    [[ -z "$name" ]] && name="$(basename "$(dirname "$file")")"
    printf '| `%s` | `%s` | %s |\n' "$name" "$rel" "$desc"
  done < <(find "$SOURCE" -maxdepth 2 -name 'SKILL.md' -type f | sort)

  echo
  echo "## 使用规则"
  echo
  echo "- Codex 读取 skill 作为行为规范，但工具权限以 Codex 当前环境为准。"
  echo "- 操作前先查已有脚本和工具，避免重写。"
} > "$OUT"

echo "Wrote $OUT"
