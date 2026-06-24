#!/usr/bin/env bash
# 骨架二分「规则正文」单一事实源守卫。
# 规则正文只应在 pm-judgment-card §6；他处（CLAUDE.md / phase-5-prd / pm-agent / driver / ai-pm-prd / agent-team）
# 只能"指针引用「判断卡 §6 二分」"，不得复制规则正文——否则改一处忘改六处 = drift。
# 用法：bash scripts/check-skeleton-rule-drift.sh   （退出码 0=单源 OK / 1=drift）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIG='结构骨架（强制·迭代也不许少）'   # §6 二分规则正文签名（只此一份）
EXPECTED="$ROOT/.claude/skills/ai-pm/references/pm-judgment-card.md"

# 只查源树（.claude + 根 CLAUDE.md），排除 app/src-tauri/resources 同步拷贝
hits="$(grep -rl --include='*.md' "$SIG" "$ROOT/.claude" "$ROOT/CLAUDE.md" 2>/dev/null || true)"
n="$(printf '%s\n' "$hits" | grep -c . || true)"

echo "骨架二分规则正文签名命中文件数：$n"
[ -n "$hits" ] && printf '%s\n' "$hits" | sed "s#$ROOT/#  #"

if [ "$n" = "1" ] && [ "$hits" = "$EXPECTED" ]; then
  echo "✅ 单一事实源 OK（规则正文只在 pm-judgment-card §6，他处为指针）"
  exit 0
fi
echo "❌ DRIFT：规则正文出现在 ≠1 处或不在 pm-judgment-card——他处应改成指针引用「判断卡 §6 二分」，不复制正文"
exit 1
