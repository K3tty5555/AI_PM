#!/bin/bash

cd "$(dirname "$0")/web"

# 检查是否已在运行
if lsof -ti:3000 > /dev/null 2>&1; then
  echo "✓ AI PM 已在运行，打开浏览器..."
else
  echo "▶ 启动 AI PM Web..."
  npm run dev > /dev/null 2>&1 &
  sleep 5
  echo "✓ 启动完成"
fi

open http://localhost:3000
