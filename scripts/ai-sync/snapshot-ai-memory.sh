#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"

CLAUDE_MEMORY_DIR_RESOLVED="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
CODEX_MEMORY_IN="${CODEX_MEMORY_IN:-$HOME/.codex/memories/AI_PM.md}"
CLAUDE_OUT="$ROOT/.ai-shared/memory-snapshots/claude"
CODEX_OUT="$ROOT/.ai-shared/memory-snapshots/codex"

redact_file() {
  sed -E \
    -e 's/(sk-[A-Za-z0-9_-]+)/[REDACTED_API_KEY]/g' \
    -e 's/(AKIA[0-9A-Z]{16})/[REDACTED_AWS_KEY]/g' \
    -e 's/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[^-]*(-----END [A-Z ]*PRIVATE KEY-----)/[REDACTED_PRIVATE_KEY]/g' \
    -e 's/([A-Za-z0-9_=-]{32,})/[REDACTED_SECRET]/g'
}

mkdir -p "$CLAUDE_OUT" "$CODEX_OUT"

claude_count=0
if [[ -d "$CLAUDE_MEMORY_DIR_RESOLVED" ]]; then
  while IFS= read -r -d '' file; do
    redact_file < "$file" > "$CLAUDE_OUT/$(basename "$file")"
    claude_count=$((claude_count + 1))
  done < <(find "$CLAUDE_MEMORY_DIR_RESOLVED" -maxdepth 1 -type f -name '*.md' -print0 | sort -z)
else
  echo "Claude memory dir not found: $CLAUDE_MEMORY_DIR_RESOLVED" >&2
fi

codex_count=0
if [[ -f "$CODEX_MEMORY_IN" ]]; then
  redact_file < "$CODEX_MEMORY_IN" > "$CODEX_OUT/$(basename "$CODEX_MEMORY_IN")"
  codex_count=1
fi

cat > "$ROOT/.ai-shared/memory-snapshots/index.md" <<EOF
# AI Memory Snapshot Index

- generated_at: $(date '+%Y-%m-%d %H:%M:%S %z')
- claude_source: $(ai_pm_display_memory_source "$CLAUDE_MEMORY_DIR_RESOLVED" "$ROOT")
- codex_source: ${CODEX_MEMORY_IN/#$HOME/\$HOME}

| 来源 | 文件数 | 目录 |
|------|------:|------|
| Claude memory | $claude_count | \`.ai-shared/memory-snapshots/claude/\` |
| Codex memory | $codex_count | \`.ai-shared/memory-snapshots/codex/\` |

说明：本目录是脱敏副本，不替代各工具自己的 memory 主源。
EOF

echo "Wrote memory snapshots: Claude=$claude_count Codex=$codex_count"
