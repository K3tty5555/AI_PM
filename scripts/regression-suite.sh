#!/usr/bin/env bash
# regression-suite.sh —— AI_PM 全量回归一条命令（D2，2026-07-03 第三阶段主计划）
#
# 用法：
#   bash scripts/regression-suite.sh --fast   # skill 层：规则漂移/骨架fixture/引用存在/双拷贝（秒级）
#   bash scripts/regression-suite.sh --full   # --fast + 语料层（output/projects 全量 PRD 过原型cell协议）+ 分享就绪
#
# 纪律：改判断卡 / 模板 / 校验器 / agent 后跑 --full。
# 只做串接 + 一层结果解释，各检查器判定本体不动（操作前先查已有工具铁律）。
#
# 语料层结果解释（校验器本体不动）：
#   PASS               → 通过
#   ERROR 未找到详设标题 → SKIP（README/决策评审/无详设文件，不算失败）
#   FAIL 且在 baseline  → 已知历史问题（archived 原稿，用户 2026-07-03 拍板冻结不改）
#   FAIL 不在 baseline  → 新失败，套件红
# baseline 文件：scripts/.regression-baseline.local（gitignore，含内部项目路径不入库；
#   模板见 scripts/.regression-baseline.example）

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

MODE="${1:---fast}"
FAIL=0

run_check() { # name cmd...
  local name="$1"; shift
  echo "── $name"
  if "$@" >/tmp/regression-step.log 2>&1; then
    echo "   ✅ 过"
  else
    echo "   ❌ 未过（详情如下）"
    sed 's/^/   | /' /tmp/regression-step.log | tail -20
    FAIL=1
  fi
}

echo "▶▶ skill 层（--fast）"
run_check "规则一致性（check-rule-drift，9 项）" bash scripts/check-rule-drift.sh
run_check "骨架 canonical 单源（check-skeleton-rule-drift）" bash scripts/check-skeleton-rule-drift.sh
run_check "doctype 骨架 fixture 回归（check-prd-skeleton）" bash scripts/check-prd-skeleton.sh
run_check "skill 引用存在性（check-skill-ref-exists）" python3 scripts/check-skill-ref-exists.py
run_check "skill 双拷贝一致（check-skill-resource-drift）" bash scripts/check-skill-resource-drift.sh

if [ "$MODE" = "--full" ]; then
  echo ""
  echo "▶▶ 语料层（--full）"
  BASELINE="scripts/.regression-baseline.local"
  python3 - "$BASELINE" <<'PYEOF'
import subprocess, sys, glob
baseline_path = sys.argv[1]
try:
    baseline = {l.strip() for l in open(baseline_path, encoding="utf-8")
                if l.strip() and not l.startswith("#")}
except FileNotFoundError:
    baseline = set()
files = sorted(glob.glob("output/projects/*/05-prd/**/*.md", recursive=True))
print(f"语料命中 {len(files)} 份（output/projects/*/05-prd/**/*.md，活语料·勿引用快照数）")
if not files:
    print("⚠️ 语料为空（可能是 fresh clone），语料层跳过"); sys.exit(0)
r = subprocess.run(
    ["python3", ".claude/skills/ai-pm/scripts/validate_prd_source_prototype_cells.py", "--quiet", *files],
    capture_output=True, text=True)
n_pass = n_skip = n_known = 0
new_fail, odd_err = [], []
for line in (r.stdout + r.stderr).splitlines():
    if line.startswith("PASS"):
        n_pass += 1
    elif line.startswith("ERROR"):
        if "详细功能设计" in line:
            n_skip += 1          # 无详设章节 = 跳过，不算失败
        else:
            odd_err.append(line)
    elif line.startswith("FAIL"):
        path = line.split(":", 1)[0].removeprefix("FAIL").strip()
        if path in baseline:
            n_known += 1         # 已知历史问题（冻结）
        else:
            new_fail.append(line)
print(f"PASS {n_pass} / SKIP(无详设) {n_skip} / 已知冻结 {n_known} / 新失败 {len(new_fail)} / 异常 {len(odd_err)}")
for line in new_fail + odd_err:
    print("   |", line)
sys.exit(1 if (new_fail or odd_err) else 0)
PYEOF
  if [ $? -ne 0 ]; then echo "   ❌ 语料层未过"; FAIL=1; else echo "   ✅ 语料层过"; fi

  echo ""
  run_check "分享就绪（check-share-readiness --strict）" bash scripts/check-share-readiness.sh --strict
fi

echo ""
if [ "$FAIL" -eq 0 ]; then echo "✅✅ 回归套件全绿 [${MODE}]"; exit 0
else echo "❌❌ 回归套件有红项，先修再动 [${MODE}]"; exit 1; fi
