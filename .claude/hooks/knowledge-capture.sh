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

# PreCompact / SessionEnd 直接放行——知识沉淀只在 Stop 时做，不挡 /compact、不挡会话收尾
# （2026-06-29 修：原本 PreCompact/SessionEnd 也走到末尾 block——PreCompact 反复挡压缩、SessionEnd 挡会话结束且 block 在 SessionEnd 本就无效）
[[ "$EVENT" == "PreCompact" || "$EVENT" == "SessionEnd" ]] && { echo "{}"; exit 0; }

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

# 静默排队（2026-07-13 改：不再 block 主对话）——此前输出 decision:block 会把主对话
# 拽回前台跑沉淀，工具调用刷进对话流，违反静默护栏第一原则（"耗时执行只在显式调用
# 知识命令时发生"）。现在只把候选区间记进 pending 队列（亚秒、零前台痕迹），
# 消费=用户显式跑 /ai-pm-knowledge sync|add 时批量处理（协议见 CLAUDE.md §知识沉淀Hook）。
# 备选方案（如嫌沉淀密度低可切换）：这里后台拉起 headless `claude -p` 读 transcript
# 自动沉淀——对话流同样不断，代价=每次触发一个小会话的 token。
PENDING_FILE="${PWD}/.claude/logs/knowledge-pending.jsonl"
printf '{"ts":"%s","session":"%s","transcript":"%s","from_count":%s,"to_count":%s}\n' \
  "$(date '+%F %T')" "$SESSION" "$TRANSCRIPT" "${LAST_COUNT:-0}" "${COUNT:-0}" >> "$PENDING_FILE"
chmod 600 "$PENDING_FILE" 2>/dev/null

echo "[$(date '+%F %T')] $SESSION queued:$EVENT count=${COUNT:-N/A} range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"

echo "{}"

# state 清理（每次顺手清 7 天前）
find "$STATE_DIR" -name "*.last_count" -mtime +7 -delete 2>/dev/null
find "$STATE_DIR" -name "*.ts" -mtime +7 -delete 2>/dev/null
