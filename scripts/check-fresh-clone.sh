#!/usr/bin/env bash
# tracked-only 分发验收（五轮复验 §3.5）：真实 fresh clone 形态下 regression --fast 必须全绿。
# AIPM_DISABLE_PRIVATE_PLUGIN=1 只模拟"插件缺失"，测不出 gitignored 资源（resources/skills
# 构建期生成副本）与私有数据（output/ 生产 _status.json）缺失——那两类恰是五轮抓出的残口。
#
# 做法：git clone（HEAD，天然 tracked-only）+ 叠加工作区 tracked 文件的未提交改动
# （否则改完套件要先提交才能验收，鸡生蛋）；在克隆里跑 --fast。
set -euo pipefail
cd "$(dirname "$0")/.." || exit 2

TMP="$(mktemp -d -t aipm-fresh-clone)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --local --no-hardlinks . "$TMP/clone"
# 工作区未提交的 tracked 改动一并带上（新增未跟踪文件不带——它们本来就不随仓分发）
git ls-files -z | tar --null -T - -cf - 2>/dev/null | tar -xf - -C "$TMP/clone"

echo "（tracked-only 克隆 → regression --fast）"
if (cd "$TMP/clone" && bash scripts/regression-suite.sh --fast) > "$TMP/out.log" 2>&1; then
  tail -1 "$TMP/out.log"
  echo "fresh-clone 分发验收 ok（无插件/无私有数据/无生成副本环境 --fast 全绿）"
else
  echo "⛔ fresh-clone --fast 未过（真实分发环境会红）："
  tail -30 "$TMP/out.log" | sed 's/^/   | /'
  exit 1
fi
