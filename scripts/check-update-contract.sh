#!/usr/bin/env bash
# check-update-contract.sh —— 升级 skill 与打包器之间的契约检查。
# 防的是：skill 里声明的受管范围与打包器实际收集的文件漂移。
# 用法：bash scripts/check-update-contract.sh   # 0=一致 1=漂移
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

FAIL=0
note_fail() { FAIL=1; printf '  ❌ %s\n' "$1"; }
note_ok()   { printf '  ✅ %s\n' "$1"; }

SCOPE=".claude/skills/ai-pm-update/references/managed-scope.md"
PROTO=".claude/skills/ai-pm-update/references/merge-protocol.md"

echo "▶ 检查 1：受管范围文件存在且含全部六个受管路径"
for p in ".claude/skills/" ".claude/agents/" ".claude/hooks/" ".claude/settings.json" "CLAUDE.md" "templates/" "scripts/"; do
  grep -qF -- "$p" "$SCOPE" 2>/dev/null || note_fail "受管范围缺路径：$p"
done
[ -f "$SCOPE" ] && note_ok "受管范围文件存在"

echo "▶ 检查 2：合并协议含七种判定情形"
for k in "用户新增" "用户删除" "官方废弃" "冲突 →"; do
  grep -qF -- "$k" "$PROTO" 2>/dev/null || note_fail "合并协议缺情形：$k"
done
[ -f "$PROTO" ] && note_ok "合并协议文件存在"

echo "▶ 检查 3：禁令在受管范围文件里明写"
grep -qF "绝不目录级替换" "$SCOPE" 2>/dev/null && note_ok "目录级替换禁令在位" || note_fail "缺「绝不目录级替换」禁令"

exit $FAIL
