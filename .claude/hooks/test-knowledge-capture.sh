#!/usr/bin/env bash
set -euo pipefail

# 旧自测会改真实 ~/.ai-pm 水位与队列，且仍断言 Stop 返回 block。
# 现统一转到隔离 HOME/PWD 的集成自测，不碰生产队列。
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$ROOT/scripts/kc-hook-selftest.py"
