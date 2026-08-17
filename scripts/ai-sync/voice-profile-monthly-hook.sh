#!/usr/bin/env bash
set -euo pipefail

if [ "${AIPM_VOICE_PROFILE_CHILD:-0}" = "1" ]; then
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Project-local, fail-closed: even if this script is called from another repo,
# it must not create state or launch a background update there.
CALLER_ROOT="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
if [ "$CALLER_ROOT" != "$ROOT" ] \
  || [ ! -f "$ROOT/.claude/skills/ai-pm/SKILL.md" ] \
  || ! grep -q '^# AI_PM$' "$ROOT/CLAUDE.md" 2>/dev/null; then
  exit 0
fi

STATE_DIR="${AIPM_VOICE_PROFILE_STATE_DIR:-$HOME/.ai-pm/voice-profile}"
MONTH="$(date +%Y-%m)"
SUCCESS_FILE="$STATE_DIR/$MONTH.success"
ATTEMPT_FILE="$STATE_DIR/$MONTH.attempt"
TRIGGER_LOCK="$STATE_DIR/trigger.lock"

mkdir -p "$STATE_DIR/logs"
chmod 700 "$STATE_DIR" "$STATE_DIR/logs" 2>/dev/null || true

if [ -f "$SUCCESS_FILE" ]; then
  exit 0
fi

# Retry at most once per day after a failed background run.
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
nohup env AIPM_VOICE_PROFILE_CHILD=1 \
  "$ROOT/scripts/ai-sync/run-monthly-voice-profile-update.sh" \
  >> "$STATE_DIR/logs/monthly-update.log" 2>&1 < /dev/null &

exit 0
