#!/usr/bin/env bash
# check-update-contract.sh —— 升级 skill 与打包器之间的契约检查。
# 防的是：skill 里声明的受管范围与打包器实际收集的文件漂移。
#
# 断言一律**限定在目标表格区块内**（结构性断言）。全文子串匹配会被散文里复述的
# 同名字串喂饱——文档把表删了、只在正文提一句「用户删除」，测试照样全绿。那是假绿。
#
# 用法：bash scripts/check-update-contract.sh   # 0=一致 1=漂移
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

FAIL=0
note_fail() { FAIL=1; printf '  ❌ %s\n' "$1"; }
note_ok()   { printf '  ✅ %s\n' "$1"; }

SCOPE=".claude/skills/ai-pm-update/references/managed-scope.md"
PROTO=".claude/skills/ai-pm-update/references/merge-protocol.md"

# 受管清单：一条一行，路径在表内以反引号包裹
SCOPE_PATHS=( ".claude/skills/" ".claude/agents/" ".claude/hooks/" ".claude/settings.json" ".gitignore" ".codex/hooks.json" "CLAUDE.md" "templates/" "scripts/" )
# 判定表：8 个 (base, ours, theirs) 三值组合，一个都不能少
PROTO_COMBOS=( "无|无|有" "无|有|无" "无|有|有" "有|未改|改了" "有|改了|未改" "有|改了|改了" "有|无|有" "有|有|无" )
# 判定表的处置列要点名这几种情形（同样只在表区块内找）
PROTO_KEYS=( "官方新增" "用户新增" "用户删除" "官方废弃" "冲突 →" )

# 抽「表头行 → 其后第一个空行」这一段表格区块。整表被删则变量为空，断言随即全红。
extract_table() { sed -n "/$1/,/^\$/p" "$2" 2>/dev/null; }
# 抽「## 标题 → 下一个 ## 标题」这一段章节。散文里的交叉引用满足不了本节断言。
extract_section() { sed -n "/^## $1\$/,/^## /p" "$2" 2>/dev/null; }
# 数表内数据行：`| 单元格 … |` 的行数，扣掉表头行（表头由调用处的 anchor 指定）
count_rows() { printf '%s\n' "$1" | grep -c '^| [^-|]' || true; }
data_rows() { echo $(( $(count_rows "$1") - 1 )); }

SCOPE_TABLE="$(extract_table '^| 路径 | 说明 |' "$SCOPE")"
PROTO_TABLE="$(extract_table '^| base | ours | theirs |' "$PROTO")"
NEVER_TOUCH="$(extract_section '永不触碰' "$SCOPE")"

echo "▶ 检查 1：受管清单表内含全部 ${#SCOPE_PATHS[@]} 个受管路径"
for p in "${SCOPE_PATHS[@]}"; do
  grep -qF -- "| \`$p\` |" <<< "$SCOPE_TABLE" || note_fail "受管清单缺行：$p"
done
SCOPE_ROWS=$(data_rows "$SCOPE_TABLE")
if [ "$SCOPE_ROWS" -eq "${#SCOPE_PATHS[@]}" ]; then
  note_ok "受管清单表 ${SCOPE_ROWS} 行，与断言数组等长"
else
  note_fail "受管清单表 ${SCOPE_ROWS} 行，断言数组 ${#SCOPE_PATHS[@]} 项——表与断言已漂移"
fi
[ -f "$SCOPE" ] && note_ok "受管范围文件存在"

echo "▶ 检查 2：判定表覆盖全部 ${#PROTO_COMBOS[@]} 个三值组合"
for c in "${PROTO_COMBOS[@]}"; do
  grep -qF -- "| ${c//|/ | } |" <<< "$PROTO_TABLE" || note_fail "判定表缺组合 (${c//|/,})"
done
for k in "${PROTO_KEYS[@]}"; do
  grep -qF -- "$k" <<< "$PROTO_TABLE" || note_fail "判定表缺情形字串：$k"
done
PROTO_ROWS=$(data_rows "$PROTO_TABLE")
if [ "$PROTO_ROWS" -eq "${#PROTO_COMBOS[@]}" ]; then
  note_ok "判定表 ${PROTO_ROWS} 行，无重复无遗漏"
else
  note_fail "判定表 ${PROTO_ROWS} 行，应为 ${#PROTO_COMBOS[@]} 行"
fi
[ -f "$PROTO" ] && note_ok "合并协议文件存在"

echo "▶ 检查 3：受管范围文件的语义约束（禁令 / 白名单 / 分类键 / 数据资产排除）在位"
grep -qF "绝不目录级替换" "$SCOPE" 2>/dev/null && note_ok "目录级替换禁令在位" || note_fail "缺「绝不目录级替换」禁令"
grep -qF "未在受管清单中列出的路径一律不受管" "$SCOPE" 2>/dev/null && note_ok "显式白名单语义在位" || note_fail "缺「未在受管清单中列出的路径一律不受管」"
grep -qF "该文件是否 tracked" "$SCOPE" 2>/dev/null && note_ok "分类键为 tracked 在位" || note_fail "缺「分类的键是是否 tracked」表述"
grep -qF "由打包器 \`PRIVATE_EXTRA\` 携带的数据资产不在其列" <<< "$NEVER_TOUCH" && note_ok "「永不触碰」段内含数据资产排除条" || note_fail "「永不触碰」段内缺数据资产排除条（数据资产会撞上 templates/ 与 output/ 两条）"

echo "▶ 检查 4：报告格式含五类动作与对账行"
# 断言限定在表格/章节区块内——全文子串匹配会被散文里复述的同名字串喂饱（假绿）。
RPT=".claude/skills/ai-pm-update/references/report-format.md"
RPT_FIELDS=( "path" "kind" "base" "reason" )

RPT_TABLE="$(extract_table '^| 字段 | 取值 |' "$RPT")"
for f in "${RPT_FIELDS[@]}"; do
  grep -qF -- "| \`$f\` |" <<< "$RPT_TABLE" || note_fail "报告格式字段表缺字段：$f"
done
for k in "overwrite" "create" "delete" "conflict" "preserve"; do
  grep -qF -- "\`$k\`" <<< "$RPT_TABLE" || note_fail "报告格式字段表缺动作类型：$k"
done
RPT_ROWS=$(data_rows "$RPT_TABLE")
if [ "$RPT_ROWS" -eq "${#RPT_FIELDS[@]}" ]; then
  note_ok "报告格式字段表 ${RPT_ROWS} 行，与断言数组等长"
else
  note_fail "报告格式字段表 ${RPT_ROWS} 行，断言数组 ${#RPT_FIELDS[@]} 项——表与断言已漂移"
fi

RECON="$(extract_section '对账行（机械可判定）' "$RPT")"
grep -qF "未裁决" <<< "$RECON" || note_fail "对账行章节缺「未裁决」字段"
[ -f "$RPT" ] && note_ok "报告格式文件存在"

exit $FAIL
