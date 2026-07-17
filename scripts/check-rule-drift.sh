#!/usr/bin/env bash
# check-rule-drift.sh —— PM/原型核心规则跨文件漂移检测
#
# 背景：Claude Code 各文件（CLAUDE.md / agents / phase / 判断卡 / 模板）独立加载，
# 同一条规则必须在多处各留一份副本（pointer 救不了生成时刻）。重复是架构必需，
# 但会漂移（体检 2026-05-29 发现：自检项数 9/11、原型门槛 9/10 对不上）。
# 自检现在统一用「§9 守门 checklist」表述，不再写死项数。
# 本脚本不消除重复，只盯住几个关键事实别再跑偏。手动跑或挂 pre-commit。
#
# 用法：bash scripts/check-rule-drift.sh        # 退出码 0=一致，1=发现漂移

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

FAIL=0
note_fail() { FAIL=1; printf '  ❌ %s\n' "$1"; }
note_ok()   { printf '  ✅ %s\n' "$1"; }

# 只扫 git 追踪的规则相关文件
FILES=$(git -c core.quotepath=off ls-files | grep -E '^(CLAUDE\.md|\.claude/|templates/prd-styles/|templates/README)' | grep -E '\.md$')

echo "▶ 检查 1：PRD 守门自检 / PM 直觉不得写死项数"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "([0-9]+|[一二三四五六七八九十]+) ?项 ?(自检|checklist)|([0-9]+|[一二三四五六七八九十]+) ?条 ?PM ?直觉" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "出现固定项数表述（应写「§9 守门 checklist / PM 直觉」）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "未发现固定项数的 PRD 自检 / PM 直觉表述"; fi

echo "▶ 检查 2：原型 12 分制通过门槛应统一为「总分 ≥ 9」（不得出现 >= 10 / 总分 10 才通过）"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "总分 ?(>=|≥) ?10|总分.{0,4}10.{0,6}(可进|通过|评审)" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "出现 ≥10 的原型门槛（应为 ≥9）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "原型门槛未发现 ≥10 残留"; fi

echo "▶ 检查 3：复用对照表不得复活「迭代版必有/必备/标配」措辞"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "复用对照表.{0,12}(必有|必备|标配|迭代版本必|一定有)|(迭代版本?|迭代型).{0,12}复用对照表.{0,6}(必有|一定有|必备)" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "复用对照表又被写成迭代版必备（应为「仅功能迁移/接老存量类才写」）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "复用对照表口径未回退"; fi

echo "▶ 检查 4：pm-agent 单一事实源——不应再出现第二份 pm-agent.md 副本"
COPIES=$(git -c core.quotepath=off ls-files | grep -E 'pm-agent\.md$' | grep -v '^\.claude/agents/pm-agent\.md$')
if [ -n "$COPIES" ]; then note_fail "除 agents/pm-agent.md 外出现额外副本（应只有一份）："; printf '%s\n' "$COPIES" | sed 's/^/       /'
else note_ok "pm-agent.md 仅一份（agents/）"; fi

echo "▶ 检查 5：日期格式不得回退为点分断言（KettyWu 近期用连字符 YYYY-MM-DD）"
BAD=$(printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 grep -nE "日期.{0,8}(点分|YYYY\.MM\.DD)|不用连字符" 2>/dev/null)
if [ -n "$BAD" ]; then note_fail "出现点分日期断言（应为连字符）："; printf '%s\n' "$BAD" | sed 's/^/       /'
else note_ok "未发现点分日期断言"; fi

echo "▶ 检查 6：技术行话对照表两副本一致（单源=判断卡 §9.3，内化副本=pm-agent.md）"
extract_jargon() { awk '/^```jargon-blacklist$/{f=1;next} /^```$/{f=0} f' "$1"; }
J_CARD=$(extract_jargon .claude/skills/ai-pm/references/pm-judgment-card.md)
J_AGENT=$(extract_jargon .claude/agents/pm-agent.md)
if [ -z "$J_CARD" ]; then note_fail "判断卡缺 jargon-blacklist 机器块"
elif [ -z "$J_AGENT" ]; then note_fail "pm-agent.md 缺 jargon-blacklist 内化副本"
elif [ "$J_CARD" != "$J_AGENT" ]; then note_fail "行话表两副本内容不一致（diff 判断卡 vs pm-agent）："; diff <(printf '%s\n' "$J_CARD") <(printf '%s\n' "$J_AGENT") | sed 's/^/       /'
else note_ok "行话表两副本一致（$(printf '%s\n' "$J_CARD" | grep -cv '^#') 行词条）"; fi

echo "▶ 检查 7：决策评审八条必答项——模板为唯一事实源，判断卡 / phase-5 只留指针"
TPL=templates/prd-styles/default/decision-review-template.md
if ! grep -q "八条必答项" "$TPL"; then note_fail "模板缺「八条必答项」事实源段"; fi
for f in .claude/skills/ai-pm/references/pm-judgment-card.md .claude/skills/ai-pm/phases/phase-5-prd.md; do
  if ! grep -q "八条必答" "$f"; then note_fail "$f 缺「八条必答」指针"; fi
done
MISS=0
for tag in "必答①" "必答②" "必答③" "必答④" "必答⑤" "必答⑥" "必答⑦" "必答⑧"; do
  grep -q "$tag" "$TPL" || { MISS=1; note_fail "模板正文缺 ${tag} 落位锚点"; }
done
[ "$MISS" -eq 0 ] && grep -q "八条必答项" "$TPL" && note_ok "八必答：模板事实源 + 正文 ①-⑧ 锚点 + 两处指针齐全"

echo "▶ 检查 8：原型示意判定正则跨副本一致（源侧校验器 / 云侧校验器 / push 计数器；精确比对走 python）"
if python3 scripts/check-prototype-regex-drift.py | sed 's/^/  /'; then :; else note_fail "原型示意判定正则漂移（详见上方输出；唯一源=2026-07-02 计划附录 A）"; fi

echo "▶ 检查 9：填充废话三反模式锚点在位（单源=判断卡 §七闸 0，内化=pm-agent 直觉+⓪quater，引用=driver 7bis）"
grep -q "三类填充废话同属本闸" .claude/skills/ai-pm/references/pm-judgment-card.md || note_fail "判断卡 §七闸 0 缺三反模式事实源段"
grep -q "填充废话反射" .claude/agents/pm-agent.md || note_fail "pm-agent 缺「填充废话反射」直觉内化"
grep -q "⓪quater 填充废话窄检" .claude/agents/pm-agent.md || note_fail "pm-agent Mode C 缺 ⓪quater 窄检程序"
grep -q "7bis. 填充废话窄检" .claude/skills/ai-pm-driver/SKILL.md || note_fail "driver 缺 7bis 填充废话引用"
grep -q "三类填充废话同属本闸" .claude/skills/ai-pm/references/pm-judgment-card.md && grep -q "⓪quater 填充废话窄检" .claude/agents/pm-agent.md && grep -q "7bis. 填充废话窄检" .claude/skills/ai-pm-driver/SKILL.md && note_ok "三反模式锚点三处齐全（判断卡/pm-agent/driver）"

echo "▶ 检查 10：PRD 字数三档（单源=判断卡 §7.1，口径实现=check-prd-word-count.py；2026-07-15 落地）"
# 10a 负向：追踪规则文件不得残留旧行数豁免语（600-800 不算超类）
WC_RULE_FILES=".claude/skills/ai-pm/references/pm-judgment-card.md .claude/agents/pm-agent.md .claude/skills/ai-pm-driver/SKILL.md .claude/skills/ai-pm/phases/phase-5-prd.md templates/prd-styles/default/feishu-template.md templates/prd-styles/default/agent-supplement.md CLAUDE.md"
for f in $WC_RULE_FILES; do
  if grep -E "600-800 不算超|总数到 600-800" "$f" | grep -v "已废\|取代\|墓碑" | grep -q .; then note_fail "$f 残留旧行数豁免语（600-800 不算超）"; fi
done
# 10b 三档表达精确校验（python 精确匹配）：
# ⚠️ 待检查行的识别**只用纯语义锚点、彻底不看数字**——绝不能用"阈值对不对"当"要不要查"的门槛，
#    否则数字改坏那行就不再匹配→被排除→逃检（Codex 2026-07-15 复验实证：达标行 10000→12000 假绿）。
# 锚点=达标/说理区/超硬线/字数三档/三档约束/over-budget/超因（专属三档，随阈值改动不变）；
# 命中锚点的行提取全部 万-token 与 4 位数值 token，白名单 万:{1,1.5} 数:{10000,10001,15000,15001}，
# 出现集合外数值=篡改红；文件级软/硬线必达。评测语境的"达标"行不含万/4位数、选中无害（不假红不假绿）。
WC_MISS=0
if ! python3 - <<'PY'
import re, sys
FILES = [
    '.claude/skills/ai-pm/references/pm-judgment-card.md',
    '.claude/agents/pm-agent.md',
    '.claude/skills/ai-pm/phases/phase-5-prd.md',
    'templates/prd-styles/default/feishu-template.md',
    'templates/prd-styles/default/agent-supplement.md',
    'CLAUDE.md',
]
WAN = re.compile(r'([0-9]+(?:\.[0-9]+)?)\s*万')
NUM = re.compile(r'\d{1,3}(?:,\d{3})+|\d{4,}')
ROW_ANCHOR = re.compile(r'说理区|超硬线|字数三档|三档约束|over-budget|超因|达标')  # 纯语义、不含数字
ALLOWED_WAN, ALLOWED_NUM = {'1', '1.5'}, {10000, 10001, 15000, 15001}
def norm_wan(t): return t.rstrip('0').rstrip('.') if '.' in t else t
fails = []
for f in FILES:
    text = open(f, encoding='utf-8').read()
    sig_wan, sig_num, has_soft, has_hard = set(), set(), False, False
    for raw in text.split('\n'):
        if not ROW_ANCHOR.search(raw):     # 只用语义锚点选行——不看数字
            continue
        line = re.sub(r'\d{4}-\d{2}-\d{2}', '', raw)             # 剔日期
        wans = {norm_wan(t) for t in WAN.findall(line)}
        nums = {int(t.replace(',', '')) for t in NUM.findall(line)}
        sig_wan |= wans; sig_num |= nums
        has_soft |= ('1' in wans) or bool(nums & {10000, 10001})
        has_hard |= ('1.5' in wans) or bool(nums & {15000, 15001})
    bad = sorted(t for t in sig_wan if t not in ALLOWED_WAN) + \
          sorted(str(n) for n in sig_num if n not in ALLOWED_NUM)
    if bad:
        fails.append('%s 三档锚点行含集合外数值: %s（白名单 万:1/1.5 数:10000/10001/15000/15001）' % (f, ','.join(bad)))
    if not has_soft:
        fails.append('%s 缺字数软线（1 万/10000）三档锚点' % f)
    if not has_hard:
        fails.append('%s 缺字数硬线（1.5 万/15000）三档锚点' % f)
for m in fails:
    print('  ❌ ' + m)
sys.exit(1 if fails else 0)
PY
then WC_MISS=1; FAIL=1; fi
if ! (grep -q "check-prd-word-count.py" .claude/skills/ai-pm-driver/SKILL.md && grep -q "BAND" .claude/skills/ai-pm-driver/SKILL.md); then WC_MISS=1; note_fail "driver 缺字数机械检引用（脚本名/BAND）"; fi
# 10c 脚本 selftest 在位且通过（口径回归）
if python3 scripts/check-prd-word-count.py --selftest >/dev/null 2>&1; then :; else note_fail "check-prd-word-count.py --selftest 失败（口径/阈值/机器行契约漂移）"; fi
[ "$WC_MISS" -eq 0 ] && python3 scripts/check-prd-word-count.py --selftest >/dev/null 2>&1 && note_ok "字数三档：无豁免语残留 + 七点位硬线锚点齐 + 脚本 selftest 过"

echo ""
if [ "$FAIL" -eq 0 ]; then echo "✅ 规则一致性检查全部通过"; exit 0
else echo "❌ 发现规则漂移，请把上述文件改回统一口径（事实源：pm-agent 单源 / 行话表→判断卡 §9.3；八条必答→decision-review 模板头部注释）"; exit 1; fi
