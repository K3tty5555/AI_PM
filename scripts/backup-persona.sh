#!/usr/bin/env bash
#
# backup-persona.sh — 把 AI 记忆里的个人 persona 文件备份到仓库侧 templates/persona/
#
# 权威 live 源：~/.claude/projects/<项目hash>/memory/  （Claude Code 自动召回的那份）
# 备份目的地：templates/persona/  （随仓库同步，内容已 gitignore、不上传 GitHub）
#
# persona 文件 = memory/ 下的 user_*.md（声音画像 / PRD 写作风格 / Agent 文体 / 用户角色…）
# feedback_* / project_* / pitfall_* 不属于 persona，不备份。
#
# 用法：
#   ./scripts/backup-persona.sh          # 同步
#   ./scripts/backup-persona.sh --dry-run  # 只看会改什么，不动文件
#   AI_PM_MEMORY_DIR=/path/to/memory ./scripts/backup-persona.sh  # 手动指定记忆目录
#
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" || "${1:-}" == "-n" ]] && DRY_RUN=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/templates/persona"

# 记忆目录：优先环境变量，否则按 Claude Code 规则从仓库路径派生（/ 和 _ 都转 -）
if [[ -n "${AI_PM_MEMORY_DIR:-}" ]]; then
  MEM="$AI_PM_MEMORY_DIR"
else
  HASH="$(printf '%s' "$REPO_ROOT" | sed 's#[/_]#-#g')"
  MEM="$HOME/.claude/projects/$HASH/memory"
fi

if [[ ! -d "$MEM" ]]; then
  echo "❌ 找不到记忆目录：$MEM" >&2
  echo "   用 AI_PM_MEMORY_DIR=/正确/路径 ./scripts/backup-persona.sh 手动指定" >&2
  exit 1
fi

mkdir -p "$DEST"

shopt -s nullglob
SRCS=("$MEM"/user_*.md)
shopt -u nullglob

if [[ ${#SRCS[@]} -eq 0 ]]; then
  echo "⚠️  记忆目录里没有 user_*.md persona 文件：$MEM" >&2
  exit 0
fi

echo "源 memory : $MEM"
echo "备份到    : $DEST"
[[ $DRY_RUN -eq 1 ]] && echo "（dry-run：不写文件）"
echo "---"

copied=0; updated=0; same=0
for src in "${SRCS[@]}"; do
  name="$(basename "$src")"
  dst="$DEST/$name"
  if [[ ! -f "$dst" ]]; then
    [[ $DRY_RUN -eq 0 ]] && cp "$src" "$dst"
    echo "＋ 新增  $name"; ((copied++)) || true
  elif ! cmp -s "$src" "$dst"; then
    [[ $DRY_RUN -eq 0 ]] && cp "$src" "$dst"
    echo "↻ 更新  $name"; ((updated++)) || true
  else
    echo "= 未变  $name"; ((same++)) || true
  fi
done

# 报告孤儿：备份区里有、但 memory/ 已无的 persona 文件（不自动删，交人判断）
echo "---"
shopt -s nullglob
for bak in "$DEST"/user_*.md; do
  bname="$(basename "$bak")"
  [[ -f "$MEM/$bname" ]] || echo "⚠️  孤儿（memory 已无，未删）：$bname"
done
shopt -u nullglob

echo "---"
echo "完成：新增 $copied / 更新 $updated / 未变 $same"
[[ $DRY_RUN -eq 1 ]] && echo "（以上为 dry-run 预览，未实际写入）"
# ── docs/ 本机备份（G1 · 2026-07-12，还 gen-opt v0.4 元悬账）──
# docs/ 整目录 gitignore（83+ 份计划含内部信息），仓库不保护它——镜像到仓外，防单点。
DOCS_SRC="$REPO_ROOT/docs"
DOCS_DST="$HOME/.ai-pm-backups/AI_PM-docs"
if [ -d "$DOCS_SRC" ]; then
  mkdir -p "$DOCS_DST"
  rsync -a "$DOCS_SRC"/ "$DOCS_DST"/ 2>/dev/null || cp -R "$DOCS_SRC"/. "$DOCS_DST"/
  echo "docs 备份  : $(find "$DOCS_DST" -name '*.md' | wc -l | tr -d ' ') 份 md → $DOCS_DST"
fi

exit 0
