#!/usr/bin/env bash
set +e
trap 'echo "{}"; exit 0' ERR

COOLDOWN_SECONDS=60
SAVE_INTERVAL=30
STATE_DIR="${HOME}/.ai-pm/hook_state"
ENABLED_FLAG="${PWD}/.claude/hooks/.knowledge-capture.enabled"

[[ -f "$ENABLED_FLAG" ]] || { echo "{}"; exit 0; }
command -v jq >/dev/null 2>&1 || { echo "{}"; exit 0; }

mkdir -p "$STATE_DIR" 2>/dev/null

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# 死循环防护 1：stop_hook_active flag
[[ "$ACTIVE" == "true" ]] && { echo "{}"; exit 0; }

# 死循环防护 2：60s 冷却
START_TS=$(date +%s)
LAST_TS_FILE="$STATE_DIR/${SESSION}.ts"
LAST_TS=$(cat "$LAST_TS_FILE" 2>/dev/null || echo 0)
if (( START_TS - LAST_TS < COOLDOWN_SECONDS )); then
  echo "{}"; exit 0
fi

# Stop 事件按 msg 数节流（PreCompact / SessionEnd 直接通过）
if [[ "$EVENT" == "Stop" ]]; then
  [[ -f "$TRANSCRIPT" ]] || { echo "{}"; exit 0; }
  COUNT=$(grep -c '"type":"user"' "$TRANSCRIPT" 2>/dev/null || echo 0)
  LAST_COUNT_FILE="$STATE_DIR/${SESSION}.last_count"
  LAST_COUNT=$(cat "$LAST_COUNT_FILE" 2>/dev/null || echo 0)
  DELTA=$(( COUNT - LAST_COUNT ))
  if (( DELTA < SAVE_INTERVAL )); then
    echo "{}"; exit 0
  fi
  echo "$COUNT" > "$LAST_COUNT_FILE"
fi

# 节流通过，记录时间戳
echo "$START_TS" > "$LAST_TS_FILE"

LOG_FILE="${PWD}/.claude/logs/knowledge-hook.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

DURATION=$(( $(date +%s) - START_TS ))
echo "[$(date '+%F %T')] $SESSION trigger:$EVENT count=${COUNT:-N/A} duration=${DURATION}s" >> "$LOG_FILE"

cat <<'EOF'
{
  "decision": "block",
  "reason": "回顾本轮对话，是否有值得沉淀的踩坑/决策/规则/方法论/pattern？\n\n判断要求：\n1. 必须含「问题场景 + 解决方案」结构，缺任一段不沉淀\n2. 跨次去重：调 add 前先 grep 现有卡片标题/前 200 字，相似度高 → 追加验证数据而非新建\n3. source-project 双重校验：cwd 路径 + 对话提及项目名，不一致或拿不准 → 标 unknown\n4. 卡片标记：confidence=low, auto-generated=true, source-session=<session_id>\n\n动作：\n- 有 → 直接调 ai-pm-knowledge add（不要打字到聊天窗，不要问用户）\n- 无 → 直接 stop（hook 二次触发会自动放行）\n\n超时：30 秒内必须完成所有 add，否则跳过本次沉淀。"
}
EOF

# state 清理（每次顺手清 7 天前）
find "$STATE_DIR" -name "*.last_count" -mtime +7 -delete 2>/dev/null
find "$STATE_DIR" -name "*.ts" -mtime +7 -delete 2>/dev/null
