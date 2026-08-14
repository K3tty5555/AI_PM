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
    # N/A 约定（六轮复验 §三）：检查器输出行首 "N/A:" = 该检查在本环境无对象（如构建期
    # 生成副本未构建）——runner 必须原样透出 ➖，不得吞成 "✅ 过"（没比较过≠比较通过）
    if grep -q '^N/A:' "$STEP_LOG"; then
      grep '^N/A:' "$STEP_LOG" | sed 's/^/   ➖ /'
    else
      echo "   ✅ 过"
    fi
  else
    echo "   ❌ 未过（详情如下）"
    sed 's/^/   | /' "$STEP_LOG" | tail -20
    FAIL=1
  fi
}

echo "▶▶ skill 层（--fast）"
run_check "规则一致性（check-rule-drift，10 项）" bash scripts/check-rule-drift.sh
run_check "骨架 canonical 单源（check-skeleton-rule-drift）" bash scripts/check-skeleton-rule-drift.sh
run_check "doctype 骨架 fixture 回归（check-prd-skeleton）" bash scripts/check-prd-skeleton.sh
run_check "PRD 字数三档口径自测（check-prd-word-count --selftest）" python3 scripts/check-prd-word-count.py --selftest
# 判断卡自身篇幅预算（2026-07-17 T5 拍板轻量版）：硬线 600 行，超线先合并/收编旧规则再新增（单源=判断卡头部预算注）
run_check "判断卡篇幅预算（≤600 行，防只加不减膨胀）" bash -c '
  n=$(wc -l < .claude/skills/ai-pm/references/pm-judgment-card.md)
  if [ "$n" -gt 600 ]; then echo "判断卡 $n 行 > 600 预算线：先合并/收编旧规则再新增（判断卡头部预算注）"; exit 1; fi
  echo "判断卡 $n/600 行"'
run_check "知识沉淀队列+摘要自测（id/ack竞态/分片）" python3 scripts/kc-digest.py --selftest
run_check "知识沉淀 hook 单飞自测（双 Stop 只起一消费者）" python3 scripts/kc-hook-selftest.py
run_check "skill 引用存在性（check-skill-ref-exists）" python3 scripts/check-skill-ref-exists.py
run_check "经验分享文章工具自测" python3 -m unittest tests.test_ai_pm_sharing_tools
run_check "经验分享文章契约自测" python3 -m unittest tests.test_ai_pm_sharing_contract
run_check "output 容器注册单源自测" python3 scripts/check-output-container-registry.py
run_check "超龄清单脚本冒烟（review-stale-list，防 date 解析静默崩）" bash scripts/review-stale-list.sh 36500
run_check "云文档 pull 离线自测（纯三方算法+复合键回写端到端）" python3 scripts/prd_pull.py --selftest
run_check "云文档共享层自测（指纹/删除判定/残留检查）" python3 scripts/_prd_common.py
run_check "云文档 publish 守门自测（存量缺基线阻断+adopt 零差异/有损闸）" python3 scripts/prd_publish.py --selftest
run_check "publish 守门自测·私有插件禁用模拟（只测插件缺失，非完整分发环境）" env AIPM_DISABLE_PRIVATE_PLUGIN=1 python3 scripts/prd_publish.py --selftest
run_check "状态契约子集校验自测（status_migrate --selftest）" python3 scripts/status_migrate.py --selftest
run_check "六模式 capability 注册表（mode 不造第二套 phase）" python3 scripts/aipm_contracts.py capabilities
run_check "下一版本 PRD / bootstrap 契约自测" python3 scripts/aipm_contracts.py selftest
run_check "跨产物只读对账自测（残留/阴性/本地编辑）" python3 scripts/aipm_reconcile.py --selftest
run_check "上线影响证据门禁自测" python3 scripts/aipm_impact.py selftest
run_check "对话索引时间覆盖自测" python3 scripts/ai-sync/conversation-coverage.py --selftest
run_check "AI_PM 系统复盘边界自测" python3 scripts/aipm_system_retrospective.py --selftest
run_check "下一版本固定回归 + 阴性 + 冷测" python3 -m unittest tests.test_aipm_nextgen_contracts
# 生产数据校验只在私有 output 存在时跑（五轮复验 §3.4）：output/ gitignore 不随仓分发，
# fresh clone 无生产数据是正确形态、不是契约失败；validate 本体保持"无数据即红"防真实工作区假绿
if compgen -G "output/projects/*/_status.json" > /dev/null; then
  run_check "状态契约现状全绿（status_migrate --validate，真实生产数据）" python3 scripts/status_migrate.py --validate
else
  echo "── 状态契约现状全绿（status_migrate --validate）"
  echo "   ➖ N/A：private output 未分发（fresh clone 无生产数据；契约逻辑已由 --selftest 覆盖）"
fi
run_check "staleness observed 遥测自测（正常项目事实非空）" bash scripts/ai-sync/staleness-selftest.sh
run_check "AI context 鲜度口径自测（按会话活动时间，不按索引 mtime）" python3 scripts/ai-sync/freshness-summary.py --selftest

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
  run_check "fresh-clone 分发验收（显式叠加本任务文件后跑 --fast）" \
    bash scripts/check-fresh-clone.sh \
      --include-untracked .claude/skills/ai-pm-sharing \
      --include-untracked .claude/skills/ai-pm/references/output-containers.md \
      --include-untracked templates/sharing \
      --include-untracked tests/fixtures/sharing \
      --include-untracked tests/test_ai_pm_sharing_tools.py \
      --include-untracked tests/test_ai_pm_sharing_contract.py \
      --include-untracked scripts/check-output-container-registry.py \
      --include-untracked .claude/skills/ai-pm-impact \
      --include-untracked .claude/skills/ai-pm-reconcile \
      --include-untracked templates/configs/capability-registry.json \
      --include-untracked templates/project-index/baseline-manifest.schema.json \
      --include-untracked templates/project-index/prototype-source-manifest.schema.json \
      --include-untracked templates/project-index/impact-record.schema.json \
      --include-untracked scripts/aipm_core.py \
      --include-untracked scripts/aipm_contracts.py \
      --include-untracked scripts/aipm_reconcile.py \
      --include-untracked scripts/aipm_impact.py \
      --include-untracked scripts/aipm_system_retrospective.py \
      --include-untracked scripts/ai-sync/conversation-coverage.py \
      --include-untracked tests/fixtures/nextgen \
      --include-untracked tests/test_aipm_nextgen_contracts.py
fi

echo ""
if [ "$FAIL" -eq 0 ]; then echo "✅✅ 回归套件全绿 [${MODE}]"; exit 0
else echo "❌❌ 回归套件有红项，先修再动 [${MODE}]"; exit 1; fi
