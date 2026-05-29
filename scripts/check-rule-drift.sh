#!/usr/bin/env bash
# check-rule-drift.sh —— PM/原型核心规则跨文件漂移检测
#
# 背景：Claude Code 各文件（CLAUDE.md / agents / phase / 判断卡 / 模板）独立加载，
# 同一条规则必须在多处各留一份副本（pointer 救不了生成时刻）。重复是架构必需，
# 但会漂移（体检 2026-05-29 发现：自检项数 9/11、原型门槛 9/10 对不上）。
# 本脚本不消除重复，只盯住几个关键事实别再跑偏。手动跑或挂 pre-commit。
#
# 用法：bash scripts/check-rule-drift.sh        # 退出码 0=一致，1=发现漂移

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

FAIL=0
note_fail() { FAIL=1; printf '  ❌ %s\n' "$1"; }
note_ok()   { printf '  ✅ %s\n' "$1"; }

# 只扫 git 追踪的规则相关文件
FILES=$(git ls-files | grep -E '^(CLAUDE\.md|\.claude/|templates/prd-styles/|templates/README)' | grep -E '\.md$')

echo "▶ 检查 1：自检项数应统一为「9 项」（不得出现 10/11 项自检）"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "(1[0-9]|[2-8]) ?项 ?(自检|checklist)" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "出现非 9 项的自检表述："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "未发现 9 以外的自检项数"; fi

echo "▶ 检查 2：原型 12 分制通过门槛应统一为「总分 ≥ 9」（不得出现 >= 10 / 总分 10 才通过）"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "总分 ?(>=|≥) ?10|总分.{0,4}10.{0,6}(可进|通过|评审)" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "出现 ≥10 的原型门槛（应为 ≥9）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "原型门槛未发现 ≥10 残留"; fi

echo "▶ 检查 3：复用对照表不得复活「迭代版必有/必备/标配」措辞"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "复用对照表.{0,12}(必有|必备|标配|迭代版本必|一定有)|(迭代版本?|迭代型).{0,12}复用对照表.{0,6}(必有|一定有|必备)" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "复用对照表又被写成迭代版必备（应为「仅功能迁移/接老存量类才写」）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "复用对照表口径未回退"; fi

echo "▶ 检查 4：pm-agent 单一事实源——不应再出现第二份 pm-agent.md 副本"
COPIES=$(git ls-files | grep -E 'pm-agent\.md$' | grep -v '^\.claude/agents/pm-agent\.md$')
if [ -n "$COPIES" ]; then note_fail "除 agents/pm-agent.md 外出现额外副本（应只有一份）："; printf '%s\n' "$COPIES" | sed 's/^/       /'
else note_ok "pm-agent.md 仅一份（agents/）"; fi

echo "▶ 检查 5：日期格式不得回退为点分断言（KettyWu 近期用连字符 YYYY-MM-DD）"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "日期.{0,8}(点分|YYYY\.MM\.DD)|不用连字符" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "出现点分日期断言（应为连字符）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "未发现点分日期断言"; fi

echo ""
if [ "$FAIL" -eq 0 ]; then echo "✅ 规则一致性检查全部通过"; exit 0
else echo "❌ 发现规则漂移，请把上述文件改回统一口径（单一事实源见 .claude/skills/ai-pm/references/pm-judgment-card.md）"; exit 1; fi
