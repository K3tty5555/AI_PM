#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"
SOURCE="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
OUT="$ROOT/.ai-shared/memory-index.md"
DISPLAY_SOURCE="$(ai_pm_display_memory_source "$SOURCE" "$ROOT")"

mkdir -p "$(dirname "$OUT")"

if [[ ! -d "$SOURCE" ]]; then
  ai_pm_explain_missing_memory_dir "$SOURCE"
  exit 1
fi

extract_field() {
  local file="$1"
  local field="$2"
  awk -v field="$field" '
    BEGIN { in_fm=0 }
    NR == 1 && $0 == "---" { in_fm=1; next }
    in_fm && $0 == "---" { exit }
    in_fm && index($0, field ":") == 1 {
      sub(field ":[[:space:]]*", "", $0)
      print $0
      exit
    }
  ' "$file"
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

  awk '/^# / { sub(/^# /, "", $0); print $0; exit }' "$file"
}

{
  echo "---"
  echo "generated_at: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "source: $DISPLAY_SOURCE"
  echo "do_not_edit: true"
  echo "---"
  echo
  echo "# Claude 项目 Memory 索引"
  echo
  echo "主事实源：\`$DISPLAY_SOURCE/\`"
  echo
  echo "## 文件清单"
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
    desc="$(printf '%s' "$desc" | sed -E 's/(sk-[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|[A-Za-z0-9_]{24,})/[REDACTED]/g')"
    printf '| %s | `%s` | %s | %s |\n' "$type" "$base" "$name" "$desc"
  done < <(find "$SOURCE" -maxdepth 1 -type f -name '*.md' | sort)

  echo
  echo "## 敏感信息规则"
  echo
  echo "同步到 Codex memory 时只保留配置位置和用途，不复制真实 API Key、token、cookie、私钥、密码。"
} > "$OUT"

echo "Wrote $OUT"
