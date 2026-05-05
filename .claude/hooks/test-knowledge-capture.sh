#!/usr/bin/env bash
set -e
HOOK=".claude/hooks/knowledge-capture.sh"
FLAG=".claude/hooks/.knowledge-capture.enabled"

# Test 1: 灰度关闭时返回空 JSON
rm -f "$FLAG"
RESULT=$(echo '{"hook_event_name":"Stop"}' | bash "$HOOK")
[[ "$RESULT" == "{}" ]] || { echo "FAIL T1: expected {}, got '$RESULT'"; exit 1; }
echo "PASS T1: 灰度关闭返回空"

touch "$FLAG"   # 启用灰度
STATE_DIR="$HOME/.ai-pm/hook_state"
mkdir -p "$STATE_DIR"

# Test 2: stop_hook_active=true 应放行
RESULT=$(echo '{"hook_event_name":"Stop","stop_hook_active":true,"session_id":"test1"}' | bash "$HOOK")
[[ "$RESULT" == "{}" ]] || { echo "FAIL T2: stop_hook_active 未生效"; exit 1; }
echo "PASS T2: active flag 放行"

# Test 3: 60s 冷却内重复触发应放行
NOW=$(date +%s)
echo "$NOW" > "$STATE_DIR/test2.ts"
RESULT=$(echo '{"hook_event_name":"Stop","session_id":"test2"}' | bash "$HOOK")
[[ "$RESULT" == "{}" ]] || { echo "FAIL T3: cooldown 未生效"; exit 1; }
echo "PASS T3: 60s 冷却生效"
