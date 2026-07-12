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
if [ "$MODE" != "--fast" ] && [ "$MODE" != "--full" ]; then
  echo "❌ 未知参数：$MODE（只接受 --fast / --full）" >&2; exit 2
fi
FAIL=0
STEP_LOG="$(mktemp -t regression-step)"
trap 'rm -f "$STEP_LOG"' EXIT

run_check() { # name cmd...
  local name="$1"; shift
  echo "── $name"
  if "$@" >"$STEP_LOG" 2>&1; then
    echo "   ✅ 过"
  else
    echo "   ❌ 未过（详情如下）"
    sed 's/^/   | /' "$STEP_LOG" | tail -20
    FAIL=1
  fi
}

echo "▶▶ skill 层（--fast）"
run_check "规则一致性（check-rule-drift，9 项）" bash scripts/check-rule-drift.sh
run_check "骨架 canonical 单源（check-skeleton-rule-drift）" bash scripts/check-skeleton-rule-drift.sh
run_check "doctype 骨架 fixture 回归（check-prd-skeleton）" bash scripts/check-prd-skeleton.sh
run_check "skill 引用存在性（check-skill-ref-exists）" python3 scripts/check-skill-ref-exists.py
run_check "skill 双拷贝一致（check-skill-resource-drift）" bash scripts/check-skill-resource-drift.sh
run_check "超龄清单脚本冒烟（review-stale-list，防 date 解析静默崩）" bash scripts/review-stale-list.sh 36500
run_check "云文档 pull 离线自测（纯三方算法+复合键回写端到端）" python3 scripts/prd_pull.py --selftest
run_check "云文档共享层自测（指纹/删除判定/残留检查）" python3 scripts/_prd_common.py
run_check "状态契约子集校验自测（status_migrate --selftest）" python3 scripts/status_migrate.py --selftest
run_check "状态契约现状全绿（status_migrate --validate，真实生产数据）" python3 scripts/status_migrate.py --validate
run_check "staleness observed 遥测自测（正常项目事实非空）" bash scripts/ai-sync/staleness-selftest.sh

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
n_pass = n_skip = n_known = n_archive = 0
new_fail, odd_err = [], []
for line in (r.stdout + r.stderr).splitlines():
    if line.startswith("PASS"):
        n_pass += 1
    elif line.startswith("ERROR"):
        if "详细功能设计" in line:
            n_skip += 1          # 无详设章节 = not-applicable，不算失败
        else:
            odd_err.append(line)
    elif line.startswith("FAIL"):
        path = line.split(":", 1)[0].removeprefix("FAIL").strip()
        # 归档/存档目录里的历史定稿 = archive 类，不按活语料判（2026-07-12 合并计划波0B#3：
        # 历史原稿不改的拍板延续；归档新增快照曾撞 glob 制造"新失败"）
        if "/归档/" in path or "/archived/" in path:
            n_archive += 1
        elif path in baseline:
            n_known += 1         # 已知历史问题（冻结）
        else:
            new_fail.append(line)
print(f"五分类：PASS {n_pass} / not-applicable(无详设) {n_skip} / archive(归档) {n_archive} / 已知冻结 {n_known} / 新失败 {len(new_fail)}（异常 {len(odd_err)}）")
# 真对账（review 修复批：此前"执行率 100%/无原因 SKIP 0"是打印出来的恒真句，不是测出来的）
counted = n_pass + n_skip + n_archive + n_known + len(new_fail) + len(odd_err)
unexplained = len(files) - counted
print(f"分类对账：{counted}/{len(files)} 份有归类，未解释 {unexplained} 份")
if unexplained:
    print(f"   | ⛔ {unexplained} 份语料无判定输出（校验器 glob/输出可能漏检）——这就是要防的假绿")
for line in new_fail + odd_err:
    print("   |", line)
sys.exit(1 if (new_fail or odd_err or unexplained) else 0)
PYEOF
  if [ $? -ne 0 ]; then echo "   ❌ 语料层未过"; FAIL=1; else echo "   ✅ 语料层过"; fi

  echo ""
  run_check "分享就绪（check-share-readiness --strict）" bash scripts/check-share-readiness.sh --strict
fi

echo ""
if [ "$FAIL" -eq 0 ]; then echo "✅✅ 回归套件全绿 [${MODE}]"; exit 0
else echo "❌❌ 回归套件有红项，先修再动 [${MODE}]"; exit 1; fi
