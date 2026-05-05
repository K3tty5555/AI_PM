#!/usr/bin/env bash
set +e
trap 'echo "{}"; exit 0' ERR

ENABLED_FLAG="${PWD}/.claude/hooks/.knowledge-capture.enabled"
[[ -f "$ENABLED_FLAG" ]] || { echo "{}"; exit 0; }

# TODO: 后续 task 填充逻辑
echo "{}"
