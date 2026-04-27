#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/ai-sync/_env.sh"
MEMORY_DIR="$(ai_pm_resolve_claude_memory_dir "$ROOT")"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$ROOT/.claude/skills}"
AGENTS_DIR="${CLAUDE_AGENTS_DIR:-$ROOT/.claude/agents}"
TAURI_RESOURCE_SKILLS="$ROOT/app/src-tauri/resources/skills"

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

check_required_client_skills() {
  local skills_dir="$1"
  shift
  local missing=()

  local skill
  for skill in "$@"; do
    if [[ ! -f "$skills_dir/$skill/SKILL.md" ]]; then
      missing+=("$skill")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "MISSING: client-required Claude skills: ${missing[*]}"
    fail=1
  else
    echo "OK: all client-required Claude skills exist"
  fi
}

check_no_tracked_generated_skills() {
  local tracked
  tracked="$(git -C "$ROOT" ls-files 'app/src-tauri/resources/skills/*' || true)"
  if [[ -n "$tracked" ]]; then
    echo "STALE: generated Tauri skill copies are still tracked:"
    echo "$tracked" | sed 's/^/  - /'
    echo "Run: git rm --cached -r app/src-tauri/resources/skills"
    fail=1
  else
    echo "OK: generated Tauri skill copies are not tracked"
  fi
}

check_resource_skill_drift() {
  [[ -d "$TAURI_RESOURCE_SKILLS" ]] || return 0

  local resource_only source_only
  resource_only="$(
    comm -13 \
      <(find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' -type f | sed "s#^$SKILLS_DIR/##; s#/SKILL.md##" | sort) \
      <(find "$TAURI_RESOURCE_SKILLS" -maxdepth 2 -name 'SKILL.md' -type f | sed "s#^$TAURI_RESOURCE_SKILLS/##; s#/SKILL.md##" | sort)
  )"
  source_only="$(
    comm -23 \
      <(find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' -type f | sed "s#^$SKILLS_DIR/##; s#/SKILL.md##" | sort) \
      <(find "$TAURI_RESOURCE_SKILLS" -maxdepth 2 -name 'SKILL.md' -type f | sed "s#^$TAURI_RESOURCE_SKILLS/##; s#/SKILL.md##" | sort)
  )"

  if [[ -n "$resource_only" || -n "$source_only" ]]; then
    echo "INFO: app/src-tauri/resources/skills differs from .claude/skills"
    [[ -n "$resource_only" ]] && { echo "  resource only:"; echo "$resource_only" | sed 's/^/    - /'; }
    [[ -n "$source_only" ]] && { echo "  source only:"; echo "$source_only" | sed 's/^/    - /'; }
    echo "  Generated resources are ignored; Tauri build.rs will regenerate them from .claude/skills."
  else
    echo "OK: generated Tauri skill copies match Claude skills"
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
  check_required_client_skills "$SKILLS_DIR" \
    ai-pm \
    ai-pm-analyze \
    ai-pm-brainstorm \
    ai-pm-data \
    ai-pm-design-spec \
    ai-pm-driver \
    ai-pm-interview \
    ai-pm-knowledge \
    ai-pm-persona \
    ai-pm-prd \
    ai-pm-priority \
    ai-pm-prototype \
    ai-pm-research \
    ai-pm-retrospective \
    ai-pm-review \
    ai-pm-review-modify \
    ai-pm-story \
    ai-pm-weekly \
    Humanizer-zh \
    frontend-design \
    ui-ux-pro-max
  check_no_tracked_generated_skills
  check_resource_skill_drift
fi
if [[ -d "$AGENTS_DIR" ]]; then
  check_newer "$AGENTS_DIR" '*.md' "$ROOT/.ai-shared/agent-index.md" "agent"
fi

CONVERSATION_RAW_DIR="$ROOT/.ai-shared/conversations/raw"
CONVERSATION_INDEX="$ROOT/.ai-shared/conversations/index.jsonl"
if [[ -d "$CONVERSATION_RAW_DIR" ]]; then
  if [[ ! -f "$CONVERSATION_INDEX" ]]; then
    echo "MISSING: conversation index not found: $CONVERSATION_INDEX"
    fail=1
  elif find "$CONVERSATION_RAW_DIR" -type f -name '*.jsonl' -newer "$CONVERSATION_INDEX" | grep -q .; then
    echo "STALE: conversation index is older than raw conversation snapshots"
    fail=1
  else
    echo "OK: conversation index is current"
  fi
fi

if [[ "$fail" -eq 1 ]]; then
  echo
  echo "Run:"
  echo "  scripts/ai-sync/build-memory-index.sh"
  echo "  scripts/ai-sync/build-skill-index.sh"
  echo "  scripts/ai-sync/build-agent-index.sh"
  echo "  scripts/ai-sync/sync-ai-context.sh"
  exit 1
fi

echo "AI context indexes are in sync."
