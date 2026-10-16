#!/usr/bin/env bash
# 跨系统启动可接管的独立浏览器，实际逻辑由 ai-pm-setup 维护。
HERE="$(cd "$(dirname "$0")" && pwd)"
SETUP="$HERE/../../ai-pm-setup/scripts/aipm_setup.py"
PY="$(command -v python3 || command -v python)"
if [ -z "$PY" ]; then echo "❌ 没找到 Python。先跑 /ai-pm setup 检查电脑环境。"; exit 2; fi
exec "$PY" "$SETUP" launch-browser --port "${1:-9223}" --url "${2:-about:blank}"
