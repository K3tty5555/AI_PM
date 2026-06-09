#!/bin/bash
# AI_PM Session Start Hook
# 检测进行中的项目，提示用户是否恢复

ROOT="$(pwd)"

# 字节透传：UTF-8 locale 下 bash 会揉烂变量里的多字节中文（项目名 $LATEST 回显成乱码），
# 改用 C locale 让 bash 纯字节透传；PYTHONUTF8=1 保证 python 输出仍是 UTF-8。
export LC_ALL=C PYTHONUTF8=1

if [ -x "$ROOT/scripts/ai-sync/check-ai-context-freshness.sh" ]; then
  "$ROOT/scripts/ai-sync/check-ai-context-freshness.sh" 2>/dev/null || true
fi

PROJECTS_DIR="output/projects"

# 首次使用检测：无项目 + 无生效个人风格 → 建议先做初始化（不强制）
HAS_PROJECT=""
if [ -d "$PROJECTS_DIR" ] && [ -n "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
  HAS_PROJECT="1"
fi
if [ -z "$HAS_PROJECT" ] && [ ! -f "$ROOT/templates/prd-styles/.active-persona" ]; then
  echo "👋 看起来是第一次用 AI_PM。建议先花 2 分钟做个初始化："
  echo "   /ai-pm init   —— 学你的写作风格 + 种知识库，之后产出更像你"
  echo "   也可以直接 /ai-pm [一句话需求] 开干。"
  exit 0
fi

if [ ! -d "$PROJECTS_DIR" ]; then
  exit 0
fi

# 查找最近修改的项目（用 python 取——hook 精简环境下 ls 读中文名会乱码/丢名，python 原生 UTF-8 不受 locale 影响）
LATEST=$(python3 -c "
import os,sys
d='$PROJECTS_DIR'
ps=[(os.path.getmtime(os.path.join(d,x)),x) for x in os.listdir(d) if os.path.isdir(os.path.join(d,x)) and not x.startswith('.')] if os.path.isdir(d) else []
sys.stdout.buffer.write((max(ps)[1] if ps else '').encode('utf-8'))
" 2>/dev/null)

if [ -z "$LATEST" ]; then
  exit 0
fi

# 统计该项目的文件数量
PHASE_FILES=$(ls "$PROJECTS_DIR/$LATEST"/*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$PHASE_FILES" -gt 0 ]; then
  echo "🔍 检测到进行中的项目：$LATEST（共 $PHASE_FILES 个文件）"
  echo "   输入 /ai-pm continue 恢复，或 /ai-pm new 开始新项目"
fi

# 开工前关联扫描（精确机制，治"旁边有对口项目却从零拼现状"的高频坑）
# 把当前项目的同主题兄弟项目推到面前——push 不是 pull，让 AI 跳不掉
if [ -f "$ROOT/scripts/related-scan.py" ] && command -v python3 >/dev/null 2>&1; then
  REL_OUT=$(python3 "$ROOT/scripts/related-scan.py" --latest 2>/dev/null)
  if echo "$REL_OUT" | grep -q "开工前关联扫描"; then
    echo ""
    echo "$REL_OUT"
  fi
fi

# README 索引漂移检测（A 档：只提醒，不自动写）——当前覆盖 07-references
if [ -x "$ROOT/scripts/ai-sync/check-readme-index-drift.js" ] && command -v node >/dev/null 2>&1; then
  DRIFT_OUT=$(node "$ROOT/scripts/ai-sync/check-readme-index-drift.js" "$PROJECTS_DIR/$LATEST" 2>/dev/null)
  if [ "$?" -eq 3 ]; then
    echo ""
    echo "📑 README 索引漂移（$LATEST/07-references）——在该 README 表格登记后，下次冷启动自动消失："
    echo "$DRIFT_OUT" | grep -E '🔴|🟡'
  fi
fi

# 项目状态保鲜 + 死链检测（A 档：只提醒，不自动写）——全项目扫描，区别于上面只查最近 1 个
if [ -x "$ROOT/scripts/ai-sync/check-status-staleness.js" ] && command -v node >/dev/null 2>&1; then
  STALE_OUT=$(node "$ROOT/scripts/ai-sync/check-status-staleness.js" "$PROJECTS_DIR" 2>/dev/null)
  if [ "$?" -eq 3 ]; then
    echo ""
    echo "🗂️  项目状态/索引可能滞后（校准对应 _status.json.updated 或修死链后自动消失）："
    echo "$STALE_OUT" | grep -E '🔸|✗'
  fi
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
