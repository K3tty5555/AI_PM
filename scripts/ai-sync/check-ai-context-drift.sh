#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"
MEMORY_DIR="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$ROOT/.claude/skills}"
AGENTS_DIR="${CLAUDE_AGENTS_DIR:-$ROOT/.claude/agents}"

fail=0

check_newer() {
  local source_dir="$1"
  local pattern="$2"
  local index_file="$3"
  local label="$4"

  if [[ ! -f "$index_file" ]]; then
    echo "MISSING: $label index not found: $index_file"
    fail=1
    return
  fi

  if find "$source_dir" -maxdepth 2 -name "$pattern" -type f -newer "$index_file" | grep -q .; then
    echo "STALE: $label index is older than source files"
    fail=1
  else
    echo "OK: $label index is current"
  fi
}

[[ -d "$MEMORY_DIR" ]] || { echo "MISSING: Claude memory dir $MEMORY_DIR"; echo "Set CLAUDE_MEMORY_DIR to your local Claude project memory path."; fail=1; }
[[ -d "$SKILLS_DIR" ]] || { echo "MISSING: Claude skills dir $SKILLS_DIR"; fail=1; }
[[ -d "$AGENTS_DIR" ]] || { echo "MISSING: Claude agents dir $AGENTS_DIR"; fail=1; }
[[ -f "$AGENTS_DIR/pm-agent.md" ]] || { echo "MISSING: pm-agent.md"; fail=1; }

if [[ -d "$MEMORY_DIR" ]]; then
  memory_count="$(find "$MEMORY_DIR" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
  echo "Claude memory files: $memory_count"
fi

if [[ -d "$MEMORY_DIR" ]]; then
  check_newer "$MEMORY_DIR" '*.md' "$ROOT/.ai-shared/memory-index.md" "memory"
fi
if [[ -d "$SKILLS_DIR" ]]; then
  check_newer "$SKILLS_DIR" 'SKILL.md' "$ROOT/.ai-shared/skill-index.md" "skill"
fi
if [[ -d "$AGENTS_DIR" ]]; then
  check_newer "$AGENTS_DIR" '*.md' "$ROOT/.ai-shared/agent-index.md" "agent"
fi

if [[ "$fail" -eq 1 ]]; then
  echo
  echo "Run:"
  echo "  scripts/ai-sync/build-memory-index.sh"
  echo "  scripts/ai-sync/build-skill-index.sh"
  echo "  scripts/ai-sync/build-agent-index.sh"
  exit 1
fi

echo "AI context indexes are in sync."
