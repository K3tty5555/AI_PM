#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 2026-07-10 合并计划波0A#3：raw 会话快照默认关闭（最小必要复制——摘要/索引才是交换物，
# 原始对话含潜在敏感上下文，默认不再复制进桥接层；历史快照保留为档案、权限 0700/0600 不删）。
# 显式需要时：sync-ai-context.sh --include-raw；直读原生日志的水位式索引方案见合并计划波4。
INCLUDE_RAW=0
for arg in "$@"; do
  [ "$arg" = "--include-raw" ] && INCLUDE_RAW=1
done

"$ROOT/scripts/ai-sync/build-memory-index.sh"
"$ROOT/scripts/ai-sync/build-skill-index.sh"
"$ROOT/scripts/ai-sync/build-agent-index.sh"
"$ROOT/scripts/ai-sync/sync-claude-memory-to-codex.sh"
"$ROOT/scripts/ai-sync/snapshot-ai-memory.sh"
if [ "$INCLUDE_RAW" = "1" ]; then
  "$ROOT/scripts/ai-sync/snapshot-claude-conversations.sh"
  "$ROOT/scripts/ai-sync/snapshot-codex-conversations.sh"
  chmod -R go-rwx "$ROOT/.ai-shared/conversations/raw" 2>/dev/null || true
else
  echo "ℹ️  raw 会话快照默认关闭（需要时 --include-raw 显式开启）；会话索引暂基于既有快照。"
fi
"$ROOT/scripts/ai-sync/build-conversation-index.py"

echo "AI context sync complete."
