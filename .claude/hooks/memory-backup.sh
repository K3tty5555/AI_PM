#!/bin/bash
# memory-backup.sh
# PostToolUse hook：检测到 Write 工具写入 memory/ 目录时，自动备份到 projects_dir

INPUT=$(cat)

# 提取 tool_name 和 file_path
TOOL=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_name', ''))
except:
    print('')
" 2>/dev/null)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# 只处理 Write 工具写入 memory/ 的情况
if [[ "$TOOL" != "Write" ]] || [[ "$FILE_PATH" != */memory/* ]]; then
  exit 0
fi

# 读取 projects_dir
PROJECTS_DIR=$(python3 -c "
import json, os
try:
    with open(os.path.expanduser('~/.ai-pm-config')) as f:
        print(json.load(f)['projects_dir'])
except:
    print('')
" 2>/dev/null)

if [ -z "$PROJECTS_DIR" ]; then
  exit 0
fi

# 计算当前项目对应的 claude 记忆目录
CLAUDE_DIR_NAME=$(pwd | sed 's|/|-|g')
MEMORY_SRC="$HOME/.claude/projects/$CLAUDE_DIR_NAME/memory"
MEMORY_BACKUP="$PROJECTS_DIR/.ai-pm-memory"

if [ -d "$MEMORY_SRC" ]; then
  cp -r "$MEMORY_SRC" "$MEMORY_BACKUP" 2>/dev/null
fi
