#!/usr/bin/env bash
# scripts/knowledge-hook-weekly-report.sh
set -e

LOG="$PWD/.claude/logs/knowledge-hook.log"
KB="templates/knowledge-base"
SINCE_DAYS="${1:-7}"
SINCE_DATE=$(date -v -"$SINCE_DAYS"d +%Y-%m-%d 2>/dev/null || date -d "$SINCE_DAYS days ago" +%Y-%m-%d)

echo "═══════════════════════════════════════════"
echo "知识库 hook 周报（最近 $SINCE_DAYS 天）"
echo "═══════════════════════════════════════════"

# 指标 1：触发次数
TRIGGER=$(grep -c "trigger:" "$LOG" 2>/dev/null || echo 0)
echo "触发次数:        $TRIGGER"

# 指标 2：跳过次数（节流 / 冷却）
SKIP=$(grep -c "skip:" "$LOG" 2>/dev/null || echo 0)
echo "跳过次数:        $SKIP"

# 指标 3：本周新 auto 卡片数
NEW_AUTO=$(find "$KB" -name '*.md' -newermt "$SINCE_DATE" -exec grep -l 'auto-generated: true' {} \; 2>/dev/null | wc -l | tr -d ' ')
echo "新 auto 卡片:    $NEW_AUTO"

# 指标 4：当前 auto+low 卡片总量
LOW_AUTO=$(grep -rl 'auto-generated: true' "$KB" 2>/dev/null | xargs grep -l 'confidence: low' 2>/dev/null | wc -l | tr -d ' ')
echo "auto+low 总量:   $LOW_AUTO"

echo ""
echo "—— 健康度判断 ——"
[[ $TRIGGER -lt 5 ]] && echo "⚠️  触发太少 (<5)，考虑调低 SAVE_INTERVAL"
[[ $TRIGGER -gt 30 ]] && echo "⚠️  触发过多 (>30)，可能打扰心流"
[[ $LOW_AUTO -gt 50 ]] && echo "⚠️  auto+low 堆积 (>50)，建议跑 review-low 或 cleanup-auto"
[[ $TRIGGER -gt 0 && $NEW_AUTO -eq 0 ]] && echo "⚠️  hook 触发但无新卡 — 检查 reason 提示词或 AI 行为"
