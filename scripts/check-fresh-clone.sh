#!/usr/bin/env bash
# tracked-only 分发验收（五轮复验 §3.5 + 六轮复验 §三）：真实 fresh clone 形态下
# regression --fast 必须全绿，且缺失项必须**诚实归类为 N/A**——只断言 exit 0 不够，
# 曾出现"目录缺失被 runner 显示成 ✅ 过"的展示层假绿。
#
# 做法：git clone（HEAD，天然 tracked-only）+ git diff --binary HEAD 叠加工作区
# 未提交的 tracked 改动（六轮 §四：tar 覆盖表达不了删除/index 语义；未 git add 的
# 新文件不带——先 add 再验收）；在克隆里跑 --fast 并机械断言分类。
set -euo pipefail
cd "$(dirname "$0")/.." || exit 2

TMP="$(mktemp -d -t aipm-fresh-clone)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --local --no-hardlinks . "$TMP/clone"
if ! git diff --quiet HEAD 2>/dev/null; then
  git diff --binary HEAD | git -C "$TMP/clone" apply --index
  echo "（已叠加工作区未提交 tracked 改动）"
fi

fail() { echo "⛔ fresh-clone 验收未过：$1"; exit 1; }

# 环境形态断言：分发形态下这两者必须缺席（在则说明克隆混入了本机私产，验收无效）
[[ ! -e "$TMP/clone/.claude/skills/xfchat-wiki" ]] || fail "克隆内出现私有插件（应不随仓分发）"
[[ ! -e "$TMP/clone/output" ]] || fail "克隆内出现 output/（应不随仓分发）"

echo "（tracked-only 克隆 → regression --fast）"
if ! (cd "$TMP/clone" && bash scripts/regression-suite.sh --fast) > "$TMP/out.log" 2>&1; then
  echo "⛔ fresh-clone --fast 未过（真实分发环境会红）："
  tail -30 "$TMP/out.log" | sed 's/^/   | /'
  exit 1
fi

# 分类断言（六轮 §3.4：把"无伪 PASS"从文字要求变成机械验收）
grep -q "N/A：private output 未分发" "$TMP/out.log" \
  || fail "缺私有生产数据未见 N/A 输出（可能被吞成 PASS）"

tail -1 "$TMP/out.log"
echo "fresh-clone 分发验收 ok（--fast 全绿 + 私有 output 缺失诚实 N/A）"
