#!/usr/bin/env bash
# fresh-clone 分发验收（五轮复验 §3.5 + 六轮复验 §三）：真实 clone 形态下
# regression --fast 必须全绿，且缺失项必须**诚实归类为 N/A**——只断言 exit 0 不够，
# 曾出现"目录缺失被 runner 显示成 ✅ 过"的展示层假绿。
#
# 做法：git clone（HEAD，天然 tracked-only）+ git diff --binary HEAD 叠加工作区
# 未提交的 tracked 改动。需要验证未跟踪的新文件时，重复传入：
#   --include-untracked 仓库根相对路径
# 脚本只复制该白名单下由 git 判定为未跟踪、且未被 ignore 的普通文件；拒绝
# 绝对路径、..、output/ 和符号链接。无需先 git add。
set -euo pipefail
cd "$(dirname "$0")/.." || exit 2

INCLUDE_UNTRACKED=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-untracked)
      [[ $# -ge 2 ]] || {
        echo "⛔ --include-untracked 缺少路径" >&2
        exit 2
      }
      INCLUDE_UNTRACKED+=("$2")
      shift 2
      ;;
    -h|--help)
      sed -n '1,16p' "$0"
      exit 0
      ;;
    *)
      echo "⛔ 未知参数：$1" >&2
      exit 2
      ;;
  esac
done

fail() { echo "⛔ fresh-clone 验收未过：$1"; exit 1; }

has_symlink_component() {
  local path="$1"
  local current=""
  local part
  local parts=()
  IFS='/' read -r -a parts <<< "$path"
  for part in "${parts[@]}"; do
    [[ -n "$part" ]] || continue
    if [[ -n "$current" ]]; then current="$current/$part"; else current="$part"; fi
    [[ ! -L "$current" ]] || return 0
  done
  return 1
}

validate_include_path() {
  local path="$1"
  [[ -n "$path" && "$path" != "." ]] || fail "未跟踪白名单不能是空路径或仓库根"
  [[ "$path" != /* ]] || fail "未跟踪白名单必须是仓库根相对路径：$path"
  [[ ! "$path" =~ (^|/)\.\.(/|$) ]] || fail "未跟踪白名单不能含 ..：$path"
  [[ "$path" != "output" && "$path" != output/* ]] || fail "禁止复制 output/：$path"
  has_symlink_component "$path" && fail "未跟踪白名单不能经过符号链接：$path"
  return 0
}

for include_path in "${INCLUDE_UNTRACKED[@]}"; do
  validate_include_path "$include_path"
done

TMP="$(mktemp -d -t aipm-fresh-clone)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --local --no-hardlinks . "$TMP/clone"
if ! git diff --quiet HEAD 2>/dev/null; then
  git diff --binary HEAD | git -C "$TMP/clone" apply --index
  echo "（已叠加工作区未提交 tracked 改动）"
fi

copied_untracked=0
for include_path in "${INCLUDE_UNTRACKED[@]}"; do
  while IFS= read -r -d '' source_path; do
    validate_include_path "$source_path"
    [[ ! -L "$source_path" ]] || fail "拒绝复制未跟踪符号链接：$source_path"
    [[ -f "$source_path" ]] || fail "未跟踪白名单只复制普通文件：$source_path"
    destination="$TMP/clone/$source_path"
    mkdir -p "$(dirname "$destination")"
    cp -p -- "$source_path" "$destination"
    copied_untracked=$((copied_untracked + 1))
  done < <(git ls-files -z --others --exclude-standard -- "$include_path")
done
if [[ ${#INCLUDE_UNTRACKED[@]} -gt 0 ]]; then
  echo "（已按白名单叠加 $copied_untracked 个未跟踪文件）"
fi

# 环境形态断言：分发形态下这两者必须缺席（在则说明克隆混入了本机私产，验收无效）
[[ ! -e "$TMP/clone/.claude/skills/xfchat-wiki" ]] || fail "克隆内出现私有插件（应不随仓分发）"
[[ ! -e "$TMP/clone/output" ]] || fail "克隆内出现 output/（应不随仓分发）"

echo "（fresh clone → regression --fast）"
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
