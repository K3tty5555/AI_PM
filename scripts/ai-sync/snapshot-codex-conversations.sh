#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
OUT="$ROOT/.ai-shared/conversations/raw/codex"

if [[ ! -d "$CODEX_HOME" ]]; then
  echo "Codex home not found: $CODEX_HOME" >&2
  echo "Set CODEX_HOME to your Codex home directory." >&2
  exit 1
fi

mkdir -p "$OUT"

count=0
if [[ -d "$CODEX_HOME/archived_sessions" ]]; then
  while IFS= read -r -d '' file; do
    cp -p "$file" "$OUT/$(basename "$file")"
    count=$((count + 1))
  done < <(find "$CODEX_HOME/archived_sessions" -maxdepth 1 -type f -name '*.jsonl' -print0 | sort -z)
fi

if [[ -f "$CODEX_HOME/history.jsonl" ]]; then
  cp -p "$CODEX_HOME/history.jsonl" "$OUT/history.jsonl"
  count=$((count + 1))
fi

echo "Copied $count Codex conversation/history files to $OUT"
