#!/usr/bin/env bash
# 可选回归 smoke：对 3 份 doctype fixture 跑确定性骨架检测，打印 期望 vs 实测 STRUCTURE_HINT。
# 这是 fixture 级确定性回归，**不是 PRD 硬 gate**——真实 PRD 的 lint 走 pm-agent Mode C（模型在环）。
# 用法：bash scripts/check-prd-skeleton.sh   （退出码 0=全对 / 1=有不符）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/tests/fixtures/prd-doctype"
fail=0

detect() {
  f="$1"
  dt="$(grep -oE '<!-- doctype: (full|decision_review) -->' "$f" 2>/dev/null | head -1 | grep -oE 'full|decision_review')"
  if [ "$dt" = "decision_review" ]; then echo "skipped_decision_review"; return; fi
  # full / 缺标记：窄检三类骨架（零歧义信号，不认列名）
  has_log=0;  grep -qE '修订|版本' "$f" && grep -qE '^\|.*\|' "$f" && has_log=1
  has_list=0; grep -qE '功能清单|功能点' "$f" && has_list=1
  has_det=0;  grep -qE '详细功能设计|用户场景|功能描述' "$f" && has_det=1
  if [ "$has_log" = 1 ] && [ "$has_list" = 1 ] && [ "$has_det" = 1 ]; then echo "pass"; else echo "missing_skeleton"; fi
}

for f in bullet-bad.md lean-good.md decision-review-good.md; do
  case "$f" in
    bullet-bad.md)            exp=missing_skeleton ;;
    lean-good.md)             exp=pass ;;
    decision-review-good.md)  exp=skipped_decision_review ;;
  esac
  got="$(detect "$DIR/$f")"
  if [ "$got" = "$exp" ]; then
    echo "✅ $f → STRUCTURE_HINT: $got"
  else
    echo "❌ $f → 期望 $exp 实测 $got"; fail=1
  fi
done
exit $fail
