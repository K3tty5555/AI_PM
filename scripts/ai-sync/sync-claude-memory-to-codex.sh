#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"

SOURCE="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
OUT="${CODEX_MEMORY_OUT:-$HOME/.codex/memories/AI_PM.md}"
DISPLAY_SOURCE="$(ai_pm_display_memory_source "$SOURCE" "$ROOT")"

if [[ ! -d "$SOURCE" ]]; then
  ai_pm_explain_missing_memory_dir "$SOURCE"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

redact() {
  sed -E \
    -e 's/(sk-[A-Za-z0-9_-]+)/[REDACTED_API_KEY]/g' \
    -e 's/(AKIA[0-9A-Z]{16})/[REDACTED_AWS_KEY]/g' \
    -e 's/([A-Za-z0-9_]{32,})/[REDACTED_SECRET]/g'
}

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
  ' "$file" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//' | redact
}

fallback_desc() {
  local file="$1"
  local base
  base="$(basename "$file")"

  case "$base" in
    MEMORY.md)
      echo "项目总记忆入口，串联关键铁律、项目状态、业务知识和架构决策"
      return
      ;;
    dashboard-pitfalls.md)
      echo "数据洞察仪表盘开发避坑模式"
      return
      ;;
  esac

  awk '/^# / { sub(/^# /, "", $0); print $0; exit }' "$file" | redact
}

{
  echo "# AI_PM Claude Memory 摘要"
  echo
  echo "- generated_at: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "- source: $DISPLAY_SOURCE"
  echo "- role: Codex 读取用摘要；Claude memory 仍是主事实源"
  echo
  echo "## 总规则"
  echo
  echo "- 全程简体中文。"
  echo "- PRD 默认 Markdown，不主动导 DOCX。"
  echo "- 未经用户允许不运行 Playwright。"
  echo "- 操作前先查已有工具，PRD 导出复用 md2docx.py。"
  echo "- AI 给最终用户的话术不透版本号、上线时间、下个迭代。"
  echo "- Codex 新沉淀先写 .ai-shared/pending-memory/，不自动覆盖 Claude memory。"
  echo
  echo "## 文件摘要"
  echo
  echo "| 类型 | 文件 | 名称 | 用途 |"
  echo "|------|------|------|------|"

  while IFS= read -r file; do
    base="$(basename "$file")"
    type="$(extract_field "$file" type)"
    name="$(extract_field "$file" name)"
    desc="$(extract_field "$file" description)"
    [[ -z "$type" ]] && type="other"
    [[ -z "$name" ]] && name="${base%.md}"
    [[ -z "$desc" ]] && desc="$(fallback_desc "$file")"
    printf '| %s | `%s` | %s | %s |\n' "$type" "$base" "$name" "$desc"
  done < <(find "$SOURCE" -maxdepth 1 -type f -name '*.md' | sort)
} > "$OUT"

echo "Wrote $OUT"
