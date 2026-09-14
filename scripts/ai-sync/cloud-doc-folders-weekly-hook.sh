#!/usr/bin/env bash
# 每周首次进入项目时，在后台静默核对云文档目录漂移，把结果写成一行摘要。
# 冷启动只读那行摘要（亚秒），不在前台等这 1~2 分钟的云盘遍历。
# 沿用 voice-profile-monthly-hook.sh 的三件套：周键 success/attempt 文件 + 原子 trigger.lock + nohup 子进程。
set -euo pipefail

if [ "${AIPM_CLOUD_DOC_CHILD:-0}" = "1" ]; then
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 项目内 fail-closed：从别的仓被调到也不建状态、不起后台任务
CALLER_ROOT="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
if [ "$CALLER_ROOT" != "$ROOT" ] \
  || [ ! -f "$ROOT/.claude/skills/ai-pm/SKILL.md" ] \
  || ! grep -q '^# AI_PM$' "$ROOT/CLAUDE.md" 2>/dev/null; then
  exit 0
fi

STATE_DIR="${AIPM_CLOUD_DOC_STATE_DIR:-$HOME/.ai-pm/cloud-doc-folders}"
WEEK="$(date +%Y-W%V)"
SUCCESS_FILE="$STATE_DIR/$WEEK.success"
ATTEMPT_FILE="$STATE_DIR/$WEEK.attempt"
TRIGGER_LOCK="$STATE_DIR/trigger.lock"

mkdir -p "$STATE_DIR/logs"
chmod 700 "$STATE_DIR" "$STATE_DIR/logs" 2>/dev/null || true

# 本周已成功跑过就不再跑
if [ -f "$SUCCESS_FILE" ]; then
  exit 0
fi

# 失败后一天最多重试一次（云盘不可达时别每次开会话都重敲 API）
if [ -f "$ATTEMPT_FILE" ]; then
  NOW="$(date +%s)"
  LAST="$(stat -f %m "$ATTEMPT_FILE" 2>/dev/null || stat -c %Y "$ATTEMPT_FILE" 2>/dev/null || echo 0)"
  if [ $((NOW - LAST)) -lt 86400 ]; then
    exit 0
  fi
fi

if ! mkdir "$TRIGGER_LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$TRIGGER_LOCK" 2>/dev/null || true' EXIT INT TERM

touch "$ATTEMPT_FILE"
chmod 600 "$ATTEMPT_FILE" 2>/dev/null || true

nohup env AIPM_CLOUD_DOC_CHILD=1 bash -c "
  rc=0
  python3 '$ROOT/scripts/ai-sync/check-cloud-doc-folders.py' --summary-out '$STATE_DIR' || rc=\$?
  # 0=clean、3=有漂移，都算「跑完了」：摘要已落盘，本周不必再跑；只有 1（云盘不可达）才留给明天重试
  if [ \"\$rc\" -eq 0 ] || [ \"\$rc\" -eq 3 ]; then
    touch '$SUCCESS_FILE'
  fi
" >> "$STATE_DIR/logs/weekly-check.log" 2>&1 < /dev/null &

exit 0
