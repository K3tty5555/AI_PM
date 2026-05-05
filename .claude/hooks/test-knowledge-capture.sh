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

# 准备假 transcript 文件
FAKE_TRANSCRIPT="/tmp/fake-transcript.jsonl"
> "$FAKE_TRANSCRIPT"
for i in $(seq 1 5); do
  echo '{"type":"user","content":"msg '"$i"'"}' >> "$FAKE_TRANSCRIPT"
done

# Test 4: msg < 30 应放行（节流）
echo "0" > "$STATE_DIR/test4.last_count"   # 上次 count=0
echo "0" > "$STATE_DIR/test4.ts"           # 远古时间戳，不受 cooldown 限
RESULT=$(echo "{\"hook_event_name\":\"Stop\",\"session_id\":\"test4\",\"transcript_path\":\"$FAKE_TRANSCRIPT\"}" | bash "$HOOK")
[[ "$RESULT" == "{}" ]] || { echo "FAIL T4: 5 msg 不应触发"; exit 1; }
echo "PASS T4: 5 msg 节流放行"

# Test 5: msg >= 30 应触发（生成 block）
> "$FAKE_TRANSCRIPT"
for i in $(seq 1 35); do
  echo '{"type":"user","content":"msg '"$i"'"}' >> "$FAKE_TRANSCRIPT"
done
echo "0" > "$STATE_DIR/test5.last_count"
echo "0" > "$STATE_DIR/test5.ts"
RESULT=$(echo "{\"hook_event_name\":\"Stop\",\"session_id\":\"test5\",\"transcript_path\":\"$FAKE_TRANSCRIPT\"}" | bash "$HOOK")
echo "$RESULT" | jq -e '.decision == "block"' >/dev/null || { echo "FAIL T5: 35 msg 应触发 block, got: $RESULT"; exit 1; }
echo "PASS T5: 35 msg 触发 block"

# Test 6: PreCompact 直接触发不数 msg
echo "0" > "$STATE_DIR/test6.ts"
RESULT=$(echo '{"hook_event_name":"PreCompact","session_id":"test6"}' | bash "$HOOK")
echo "$RESULT" | jq -e '.decision == "block"' >/dev/null || { echo "FAIL T6: PreCompact 应直接 block, got: $RESULT"; exit 1; }
echo "PASS T6: PreCompact 直接 block"

# Test 7: block reason 含关键指令
echo "0" > "$STATE_DIR/test7.ts"
RESULT=$(echo '{"hook_event_name":"PreCompact","session_id":"test7"}' | bash "$HOOK")
echo "$RESULT" | jq -e '.reason | contains("ai-pm-knowledge add")' >/dev/null \
  || { echo "FAIL T7: reason 缺指令, got: $RESULT"; exit 1; }
echo "$RESULT" | jq -e '.reason | contains("auto-generated")' >/dev/null \
  || { echo "FAIL T7b: reason 缺标记说明"; exit 1; }
echo "PASS T7: reason 完整"

# Test 8: 日志文件存在
LOG_FILE="$PWD/.claude/logs/knowledge-hook.log"
[[ -f "$LOG_FILE" ]] || { echo "FAIL T8: 日志未创建"; exit 1; }
grep -q "test7" "$LOG_FILE" || { echo "FAIL T8b: 日志未记录 session"; exit 1; }
echo "PASS T8: 日志正常"
