#!/usr/bin/env bash
# 骨架二分「canonical 全文」单源守卫 —— 射程有限，别当全量防 drift。
# 守的是：§6 二分的 canonical 全文签名只应在 pm-judgment-card §6 出现一次，不被整段复制到他处。
# ⚠️ 不守的是：CLAUDE.md / phase-5-prd / pm-agent / ai-pm-driver / ai-pm-prd / agent-team 等处
#    **本就有运行时摘要**（ad-hoc 读规范 / 写时反射 / lint 机器块需要、不是纯指针）——
#    那些摘要的语义漂移本守卫**抓不到、需人工核**。本守卫只防"最坏的整段全文复制"，不声称全量单源。
# 用法：bash scripts/check-skeleton-rule-drift.sh   （退出码 0=canonical 全文单源 OK / 1=被复制）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIG='结构骨架（强制·迭代也不许少）'   # §6 二分 canonical 全文签名句（只此一份）
EXPECTED="$ROOT/.claude/skills/ai-pm/references/pm-judgment-card.md"

# 只查源树（.claude + 根 CLAUDE.md）
hits="$(grep -rl --include='*.md' "$SIG" "$ROOT/.claude" "$ROOT/CLAUDE.md" 2>/dev/null || true)"
n="$(printf '%s\n' "$hits" | grep -c . || true)"

echo "骨架二分 canonical 全文签名命中文件数：${n}（他处运行时摘要不含此签名、不计入、需人工核）"
[ -n "$hits" ] && printf '%s\n' "$hits" | sed "s#$ROOT/#  #"

if [ "$n" = "1" ] && [ "$hits" = "$EXPECTED" ]; then
  echo "✅ canonical 全文单源 OK（§6 是唯一全文承载；他处为运行时摘要 / 指针，本守卫不覆盖其漂移）"
  exit 0
fi
echo "❌ canonical 全文被复制到 ≠1 处或不在 §6——整段二分全文只该在 pm-judgment-card §6，他处用运行时摘要 / 指针、别复制全文"
exit 1
