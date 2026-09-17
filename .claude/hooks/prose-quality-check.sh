#!/bin/bash
# 给人看的 .md 落盘后自动过文字关（2026-09-17 新增）
#
# 为什么要 hook 而不是靠自觉：2026-09 实测发现，「接住」这个词早就写在
# humanizer-pm 的黑名单里，但整整两天的产出里反复出现。规则列了不等于会被执行——
# 只有 harness 强制触发才拦得住。
#
# 静默护栏（CLAUDE.md §知识沉淀Hook 第一原则）：
#   - 干净时完全静默，一个字不输出
#   - 亚秒级，不阻断
#   - 只看给人读的散文，不管代码/配置/脚本

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0
case "$FILE_PATH" in
    *.md) ;;
    *) exit 0 ;;
esac

# 只管给人读的文档。排除：
#   _cloud/ 备份、归档语料（是人类正本，不该被我的尺子量）
#   README/索引、skill 与规则文件（是给机器读的配置，不是散文）
case "$FILE_PATH" in
    */_cloud/*|*/_feishu-archive/*|*i讯飞历史PRD归档*) exit 0 ;;
    */README.md|*/CLAUDE.md|*/SKILL.md) exit 0 ;;
    */.claude/*|*/templates/*|*/node_modules/*) exit 0 ;;
esac
case "$FILE_PATH" in
    */output/*|*/docs/*) ;;
    *) exit 0 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECKER="$ROOT/scripts/check-prose-quality.py"
[ -f "$CHECKER" ] || exit 0

# 防抖：同一文件 20 秒内只查一次（连续 Edit 很常见）
STAMP="/tmp/.aipm-prose-$(echo "$FILE_PATH" | md5 -q 2>/dev/null || echo "$FILE_PATH" | md5sum | cut -d' ' -f1)"
if [ -f "$STAMP" ]; then
    LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    [ $((NOW - LAST)) -lt 20 ] && exit 0
fi
date +%s > "$STAMP" 2>/dev/null

OUT=$(python3 "$CHECKER" "$FILE_PATH" 2>/dev/null)
RC=$?

# 过了就静默——这是护栏，不是可选项
[ $RC -eq 0 ] && exit 0

echo "📝 文字关未过：$(basename "$FILE_PATH")"
echo "$OUT" | grep -E "← 极端|命中|✗ 未过" | head -6
echo "   改法见 humanizer-pm 线 0（C1 删软评价 / C2 拆破折号 / C3 去同义复述）；"
echo "   短句占比偏低 = 句子都一样长，人类是长短交错的，拆几句短的进去。"
exit 0
