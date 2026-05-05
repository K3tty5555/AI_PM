#!/usr/bin/env bash
set -e
HOOK=".claude/hooks/knowledge-capture.sh"
FLAG=".claude/hooks/.knowledge-capture.enabled"

# Test 1: 灰度关闭时返回空 JSON
rm -f "$FLAG"
RESULT=$(echo '{"hook_event_name":"Stop"}' | bash "$HOOK")
[[ "$RESULT" == "{}" ]] || { echo "FAIL T1: expected {}, got '$RESULT'"; exit 1; }
echo "PASS T1: 灰度关闭返回空"
