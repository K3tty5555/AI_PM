#!/usr/bin/env bash
set +e
trap 'echo "{}"; exit 0' ERR

COOLDOWN_SECONDS=60
STATE_DIR="${HOME}/.ai-pm/hook_state"
ENABLED_FLAG="${PWD}/.claude/hooks/.knowledge-capture.enabled"

[[ -f "$ENABLED_FLAG" ]] || { echo "{}"; exit 0; }
command -v jq >/dev/null 2>&1 || { echo "{}"; exit 0; }

mkdir -p "$STATE_DIR" 2>/dev/null

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# 死循环防护 1：stop_hook_active flag
[[ "$ACTIVE" == "true" ]] && { echo "{}"; exit 0; }

# 死循环防护 2：60s 冷却
START_TS=$(date +%s)
LAST_TS_FILE="$STATE_DIR/${SESSION}.ts"
LAST_TS=$(cat "$LAST_TS_FILE" 2>/dev/null || echo 0)
if (( START_TS - LAST_TS < COOLDOWN_SECONDS )); then
  echo "{}"; exit 0
fi

# 占位：后续 task 填充节流 + block 逻辑
echo "{}"
