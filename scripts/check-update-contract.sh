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

# 标题里的计数从数组长度取，避免"标题写 N 个、循环跑 M 个"这类漂移
SCOPE_PATHS=( ".claude/skills/" ".claude/agents/" ".claude/hooks/" ".claude/settings.json" ".gitignore" ".codex/hooks.json" "CLAUDE.md" "templates/" "scripts/" )
PROTO_KEYS=( "官方新增" "用户新增" "用户删除" "官方废弃" "冲突 →" )

echo "▶ 检查 1：受管范围文件存在且含全部 ${#SCOPE_PATHS[@]} 个受管路径"
for p in "${SCOPE_PATHS[@]}"; do
  grep -qF -- "$p" "$SCOPE" 2>/dev/null || note_fail "受管范围缺路径：$p"
done
# 全角引号包裹的表格行，防"路径只出现在永不触碰段"被当满足
for p in ".gitignore" ".codex/hooks.json"; do
  grep -qF -- "| \`$p\` |" "$SCOPE" 2>/dev/null || note_fail "受管清单缺行：$p"
done
[ -f "$SCOPE" ] && note_ok "受管范围文件存在"

echo "▶ 检查 2：合并协议含全部 ${#PROTO_KEYS[@]} 个判定情形关键字串"
for k in "${PROTO_KEYS[@]}"; do
  grep -qF -- "$k" "$PROTO" 2>/dev/null || note_fail "合并协议缺情形：$k"
done
[ -f "$PROTO" ] && note_ok "合并协议文件存在"

echo "▶ 检查 3：受管范围文件的语义约束（禁令 / 白名单 / 分类键）在位"
grep -qF "绝不目录级替换" "$SCOPE" 2>/dev/null && note_ok "目录级替换禁令在位" || note_fail "缺「绝不目录级替换」禁令"
grep -qF "未在受管清单中列出的路径一律不受管" "$SCOPE" 2>/dev/null && note_ok "显式白名单语义在位" || note_fail "缺「未在受管清单中列出的路径一律不受管」"
grep -qF "该文件是否 tracked" "$SCOPE" 2>/dev/null && note_ok "分类键为 tracked 在位" || note_fail "缺「分类的键是是否 tracked」表述"

exit $FAIL
