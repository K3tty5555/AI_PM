#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"
SOURCE="${CLAUDE_AGENTS_DIR:-$ROOT/.claude/agents}"
OUT="$ROOT/.ai-shared/agent-index.md"
DISPLAY_SOURCE="$(ai_pm_display_path "$SOURCE" "$ROOT")"

mkdir -p "$(dirname "$OUT")"

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
  echo "# Claude Agent 索引"
  echo
  echo "Codex 不能原生调用 Claude Code 的 custom agent runtime，但可以读取 agent prompt 作为角色卡执行。"
  echo
  echo "| Agent | 入口 | 用途 | Codex 使用方式 |"
  echo "|------|------|------|------|"

  if [[ -d "$SOURCE" ]]; then
    while IFS= read -r file; do
      name="$(extract_field "$file" name)"
      desc="$(extract_field "$file" description)"
      rel="${file#$ROOT/}"
      [[ -z "$name" ]] && name="$(basename "$file" .md)"
      printf '| `%s` | `%s` | %s | 读取 prompt，在主会话中按角色规则执行 |\n' "$name" "$rel" "$desc"
    done < <(find "$SOURCE" -maxdepth 1 -type f -name '*.md' | sort)
  fi
} > "$OUT"

echo "Wrote $OUT"
