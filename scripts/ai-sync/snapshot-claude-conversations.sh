#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"

MEMORY_DIR="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(dirname "$MEMORY_DIR")}"
OUT="$ROOT/.ai-shared/conversations/raw/claude"

if [[ ! -d "$CLAUDE_PROJECT_DIR" ]]; then
  echo "Claude project dir not found: $CLAUDE_PROJECT_DIR" >&2
  echo "Set CLAUDE_PROJECT_DIR to the directory containing Claude session JSONL files." >&2
  exit 1
fi

mkdir -p "$OUT"

count=0
while IFS= read -r -d '' file; do
  cp -p "$file" "$OUT/$(basename "$file")"
  count=$((count + 1))
done < <(find "$CLAUDE_PROJECT_DIR" -maxdepth 1 -type f -name '*.jsonl' -print0 | sort -z)

echo "Copied $count Claude conversation files to $OUT"
