#!/usr/bin/env bash
# review-stale 第一步：确定性地生成超龄卡复核清单。
# 纯脚本、零 token、不调模型——只算龄、过滤、排序、出清单。
# AI 分诊（核实 still-true / 退役 / 改 / 删）在拿到本清单后才介入。
#
# 用法：
#   scripts/review-stale-list.sh [阈值天数=90] [--all]
#     默认只列 state 类（pitfalls/decisions/insights）超龄卡——review-stale 的处理范围。
#     --all 额外列 technique 类（patterns/metrics/playbooks），中性显龄、不催办。
set -e

KB_DIR="templates/knowledge-base"
THRESHOLD="${1:-90}"
[[ "$THRESHOLD" =~ ^[0-9]+$ ]] || THRESHOLD=90
SHOW_ALL=false
[[ "$1" == "--all" || "$2" == "--all" ]] && SHOW_ALL=true

STATE_CATS=" pitfalls decisions insights "      # 会烂，纳入催办
TODAY_EPOCH=$(date "+%s")

# frontmatter 取值：fm <file> <key>
fm() { awk -F': *' -v k="^$2:" '$0 ~ k {sub(/[[:space:]]*#.*/,"",$2); gsub(/^[[:space:]]+|[[:space:]]+$/,"",$2); print $2; exit}' "$1"; }
to_epoch() { date -j -f "%Y-%m-%d" "$1" "+%s" 2>/dev/null; }

state_rows=""
tech_rows=""
state_count=0
tech_count=0
unknown_count=0

while IFS= read -r f; do
  [[ "$(basename "$f")" == "README.md" ]] && continue

  sup=$(fm "$f" "superseded-by")
  [[ -n "$sup" ]] && continue                              # 已退役，跳过

  auto=$(fm "$f" "auto-generated")
  conf=$(fm "$f" "confidence")
  [[ "$auto" == "true" && "$conf" == "low" ]] && continue  # 未提升的 auto 卡归 review-low

  cat=$(fm "$f" "category")
  [[ -z "$cat" ]] && cat=$(basename "$(dirname "$f")")
  id=$(fm "$f" "id")
  [[ -z "$id" ]] && id=$(basename "$f" .md)
  title=$(grep -m1 '^# ' "$f" | sed 's/^#[[:space:]]*//')

  lv=$(fm "$f" "last-verified")
  basis="last-verified"
  if [[ -z "$lv" ]]; then lv=$(fm "$f" "created"); basis="created"; fi

  is_state=false
  [[ "$STATE_CATS" == *" $cat "* ]] && is_state=true

  if [[ -z "$lv" ]]; then
    age="龄未知"; age_n=999999
  else
    lv_epoch=$(to_epoch "$lv")
    if [[ -z "$lv_epoch" ]]; then age="龄未知"; age_n=999999
    else age_n=$(( (TODAY_EPOCH - lv_epoch) / 86400 )); age="${age_n} 天"; fi
  fi

  (( age_n <= THRESHOLD )) && continue                     # 未超龄

  row=$(printf '  [%-14s] %-44s %-7s %-10s (%s %s)' "$id" "$title" "$age" "$cat" "$basis" "${lv:-—}")
  if $is_state; then
    state_rows+="${age_n}|${row}"$'\n'; state_count=$((state_count+1))
  else
    tech_rows+="${age_n}|${row}"$'\n'; tech_count=$((tech_count+1))
  fi
  [[ "$age" == "龄未知" ]] && unknown_count=$((unknown_count+1))
done < <(find "$KB_DIR" -name '*.md' ! -name 'README.md')

echo "超龄卡复核清单 · $(date '+%Y-%m-%d') · 阈值 ${THRESHOLD} 天"
echo "（已排除：已退役 superseded / 未提升 auto+low）"
echo

echo "▼ state 类（会烂，review-stale 处理范围）—— ${state_count} 张超龄"
if [[ -n "$state_rows" ]]; then
  printf '%s' "$state_rows" | sort -t'|' -k1 -rn | cut -d'|' -f2-
else
  echo "  （无）"
fi

if $SHOW_ALL; then
  echo
  echo "▼ technique 类（方法管用就管用，仅供参考、不催办）—— ${tech_count} 张超龄"
  if [[ -n "$tech_rows" ]]; then
    printf '%s' "$tech_rows" | sort -t'|' -k1 -rn | cut -d'|' -f2-
  else
    echo "  （无）"
  fi
fi

echo
echo "小结：state 超龄 ${state_count} 张$([[ $unknown_count -gt 0 ]] && echo "（含龄未知 ${unknown_count} 张）")。"
echo "下一步：交 review-stale AI 分诊——能核的自动刷新，只把残差升给你。"