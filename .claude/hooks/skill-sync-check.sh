#!/bin/bash
# 技能文件变更时轻量提醒
# 不做跨文件解析，只输出提醒文本
# 防抖: 10 秒内不重复触发

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

# 只处理 Edit/Write 工具写入 .claude/skills/ 的情况
if [[ "$TOOL" != "Edit" && "$TOOL" != "Write" ]]; then
  exit 0
fi

if [[ "$FILE_PATH" != */.claude/skills/* ]]; then
  exit 0
fi

# 防抖：10 秒内不重复触发
DEBOUNCE_FILE="/tmp/ai-pm-skill-sync-last"
NOW=$(date +%s)

if [ -f "$DEBOUNCE_FILE" ]; then
  LAST=$(cat "$DEBOUNCE_FILE")
  if [ $((NOW - LAST)) -lt 10 ]; then
    exit 0
  fi
fi
echo "$NOW" > "$DEBOUNCE_FILE"

echo "⚠️ 技能文件已修改，建议运行 /ai-pm doctor 检查关联文件是否需要同步更新"
