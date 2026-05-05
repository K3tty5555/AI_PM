#!/bin/bash
# AI_PM Session Start Hook
# 检测进行中的项目，提示用户是否恢复

ROOT="$(pwd)"

if [ -x "$ROOT/scripts/ai-sync/check-ai-context-freshness.sh" ]; then
  "$ROOT/scripts/ai-sync/check-ai-context-freshness.sh" 2>/dev/null || true
fi

PROJECTS_DIR="output/projects"

if [ ! -d "$PROJECTS_DIR" ]; then
  exit 0
fi

# 查找最近修改的项目（按修改时间排序，取最新）
LATEST=$(ls -t "$PROJECTS_DIR" 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  exit 0
fi

# 统计该项目的文件数量
PHASE_FILES=$(ls "$PROJECTS_DIR/$LATEST"/*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$PHASE_FILES" -gt 0 ]; then
  echo "🔍 检测到进行中的项目：$LATEST（共 $PHASE_FILES 个文件）"
  echo "   输入 /ai-pm continue 恢复，或 /ai-pm new 开始新项目"
fi

# Knowledge hook 周报：距上次显示 >= 7 天就自动跑一次注入欢迎信息
LAST_REPORT="$HOME/.ai-pm/last_weekly_report.ts"
mkdir -p "$(dirname "$LAST_REPORT")" 2>/dev/null
NOW=$(date +%s)
LAST=$(cat "$LAST_REPORT" 2>/dev/null || echo 0)
DAYS=$(( (NOW - LAST) / 86400 ))

if [ "$DAYS" -ge 7 ] && [ -x "$ROOT/scripts/knowledge-hook-weekly-report.sh" ]; then
  echo ""
  echo "═══ 知识 hook 周报（距上次 ${DAYS} 天）═══"
  bash "$ROOT/scripts/knowledge-hook-weekly-report.sh" "$DAYS"
  echo "═══════════════════════════════════"
  echo "$NOW" > "$LAST_REPORT"
fi
