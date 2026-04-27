#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"$ROOT/scripts/ai-sync/build-memory-index.sh"
"$ROOT/scripts/ai-sync/build-skill-index.sh"
"$ROOT/scripts/ai-sync/build-agent-index.sh"
"$ROOT/scripts/ai-sync/sync-claude-memory-to-codex.sh"
"$ROOT/scripts/ai-sync/snapshot-ai-memory.sh"
"$ROOT/scripts/ai-sync/snapshot-claude-conversations.sh"
"$ROOT/scripts/ai-sync/snapshot-codex-conversations.sh"
"$ROOT/scripts/ai-sync/build-conversation-index.py"

echo "AI context sync complete."
