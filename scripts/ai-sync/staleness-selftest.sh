#!/usr/bin/env bash
# staleness observed 遥测自测（二轮复验 §六）：正常项目（updated=最新文件同日）
# 也必须回报 newestFile 非空、且不误报滞后——事实(observed)与告警(issues)分离的契约测试。
set -euo pipefail
cd "$(dirname "$0")/../.." || exit 2

TMP="$(mktemp -d -t staleness-selftest)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/projects/示例项目"
echo "内容" > "$TMP/projects/示例项目/需求.md"
printf '{"schema_version":1,"project":"示例项目","lifecycle":"active","updated":"%s"}\n' \
  "$(date +%F)" > "$TMP/projects/示例项目/_status.json"

# 不用管道喂 python3 -（heredoc 会抢占 stdin，管道数据静默丢失）——落文件传 argv
node scripts/ai-sync/check-status-staleness.js "$TMP/projects" --json --all > "$TMP/out.json"
python3 - "$TMP/out.json" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1]))
r = next(x for x in rows if x["name"] == "示例项目")
obs = r.get("observed") or {}
assert obs.get("newestFile") == "需求.md", f"正常项目 newestFile 应非空: {r}"
assert obs.get("newestDate"), f"正常项目 newestDate 应非空: {r}"
assert r["issues"]["stale"] is None, f"updated=最新文件同日不应报滞后: {r}"
print("staleness observed selftest ok（正常项目事实非空、不误报滞后）")
PY
