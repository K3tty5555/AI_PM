#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"

CLAUDE_MEMORY_DIR_RESOLVED="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
CLAUDE_PROJECT_DIR_RESOLVED="${CLAUDE_PROJECT_DIR:-$(dirname "$CLAUDE_MEMORY_DIR_RESOLVED")}"
CODEX_HOME_RESOLVED="${CODEX_HOME:-$HOME/.codex}"
CODEX_MEMORY_IN_RESOLVED="${CODEX_MEMORY_IN:-$HOME/.codex/memories/AI_PM.md}"

MEMORY_SNAPSHOT_INDEX="$ROOT/.ai-shared/memory-snapshots/index.md"
CONVERSATION_INDEX="$ROOT/.ai-shared/conversations/index.jsonl"
CLAUDE_RAW_DIR="$ROOT/.ai-shared/conversations/raw/claude"
CODEX_RAW_DIR="$ROOT/.ai-shared/conversations/raw/codex"

stale=0

newer_than_index() {
  local source_dir="$1"
  local pattern="$2"
  local index_file="$3"

  [[ -d "$source_dir" ]] || return 1
  [[ -f "$index_file" ]] || return 0
  find "$source_dir" -maxdepth 1 -type f -name "$pattern" -newer "$index_file" | grep -q .
}

file_newer_or_missing_copy() {
  local source_file="$1"
  local target_file="$2"

  [[ -f "$source_file" ]] || return 1
  [[ ! -f "$target_file" ]] && return 0
  [[ "$source_file" -nt "$target_file" ]]
}

check_conversation_dir() {
  local source_dir="$1"
  local target_dir="$2"
  local label="$3"

  [[ -d "$source_dir" ]] || return 0
  while IFS= read -r -d '' source_file; do
    local target_file="$target_dir/$(basename "$source_file")"
    if file_newer_or_missing_copy "$source_file" "$target_file"; then
      echo "STALE: $label conversation snapshot needs refresh: $(basename "$source_file")"
      stale=1
      return 0
    fi
  done < <(find "$source_dir" -maxdepth 1 -type f -name '*.jsonl' -print0)
}

if newer_than_index "$CLAUDE_MEMORY_DIR_RESOLVED" '*.md' "$MEMORY_SNAPSHOT_INDEX"; then
  echo "STALE: Claude memory snapshot is older than source memory"
  stale=1
fi

if [[ -f "$CODEX_MEMORY_IN_RESOLVED" ]]; then
  CODEX_SNAPSHOT="$ROOT/.ai-shared/memory-snapshots/codex/$(basename "$CODEX_MEMORY_IN_RESOLVED")"
  if file_newer_or_missing_copy "$CODEX_MEMORY_IN_RESOLVED" "$CODEX_SNAPSHOT"; then
    echo "STALE: Codex memory snapshot is older than source memory"
    stale=1
  fi
fi

check_conversation_dir "$CLAUDE_PROJECT_DIR_RESOLVED" "$CLAUDE_RAW_DIR" "Claude"

if [[ -d "$CODEX_HOME_RESOLVED/archived_sessions" ]]; then
  check_conversation_dir "$CODEX_HOME_RESOLVED/archived_sessions" "$CODEX_RAW_DIR" "Codex"
fi

if [[ -f "$CODEX_HOME_RESOLVED/history.jsonl" ]]; then
  if file_newer_or_missing_copy "$CODEX_HOME_RESOLVED/history.jsonl" "$CODEX_RAW_DIR/history.jsonl"; then
    echo "STALE: Codex history snapshot needs refresh"
    stale=1
  fi
fi

if [[ -d "$ROOT/.ai-shared/conversations/raw" ]]; then
  if [[ ! -f "$CONVERSATION_INDEX" ]]; then
    echo "STALE: conversation index is missing"
    stale=1
  elif find "$ROOT/.ai-shared/conversations/raw" -type f -name '*.jsonl' -newer "$CONVERSATION_INDEX" | grep -q .; then
    echo "STALE: conversation index is older than local raw snapshots"
    stale=1
  fi
fi

if [[ "$stale" -eq 1 ]]; then
  cat <<EOF

AI shared context may be stale.
Run manually when convenient:
  scripts/ai-sync/sync-ai-context.sh
EOF
else
  echo "OK: AI shared context snapshots look fresh"
fi

exit 0
