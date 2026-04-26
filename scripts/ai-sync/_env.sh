#!/usr/bin/env bash

ai_pm_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$script_dir/../.." && pwd
}

ai_pm_claude_project_slug() {
  local root="$1"
  printf '%s' "$root" | sed 's#/#-#g'
}

ai_pm_resolve_claude_memory_dir() {
  local root="$1"

  if [[ -n "${CLAUDE_MEMORY_DIR:-}" ]]; then
    printf '%s\n' "$CLAUDE_MEMORY_DIR"
    return
  fi

  local slug
  slug="$(ai_pm_claude_project_slug "$root")"
  local slug_dash
  slug_dash="${slug//_/-}"

  local candidates=(
    "$HOME/.claude/projects/${slug}/memory"
    "$HOME/.claude/projects/${slug_dash}/memory"
    "$root/.claude/projects/${slug}/memory"
    "$root/.claude/projects/${slug_dash}/memory"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  printf '%s\n' "$HOME/.claude/projects/${slug}/memory"
}

ai_pm_explain_missing_memory_dir() {
  local dir="$1"
  cat >&2 <<EOF
Claude memory dir not found: $dir

Set CLAUDE_MEMORY_DIR to your Claude project memory directory, for example:
  CLAUDE_MEMORY_DIR="\$HOME/.claude/projects/<your-project-slug>/memory" $0

On this machine the script also auto-detects the existing AI_PM memory path when it exists.
EOF
}

ai_pm_display_path() {
  local path="$1"
  local root="${2:-}"

  if [[ -n "$root" && "$path" == "$root/"* ]]; then
    printf '%s\n' "${path#$root/}"
  elif [[ "$path" == "$HOME/"* ]]; then
    printf '$HOME/%s\n' "${path#$HOME/}"
  else
    printf '%s\n' "$path"
  fi
}

ai_pm_display_memory_source() {
  local path="$1"
  local root="$2"

  if [[ "$path" == "$root/"* ]]; then
    ai_pm_display_path "$path" "$root"
  elif [[ -n "${CLAUDE_MEMORY_DIR:-}" ]]; then
    printf '$CLAUDE_MEMORY_DIR\n'
  else
    printf 'auto-detected Claude project memory dir\n'
  fi
}
