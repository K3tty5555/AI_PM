#!/usr/bin/env bash
# 傻瓜起浏览器：开一个能被 AI 接管的浏览器窗口，用户只管在里面登录测试环境。
# 用户不用懂端口/协议——这些都在这。
#
# 用法：bash start-browser.sh [端口] [起始网址]
#   端口    默认 9223（被占就换一个，如 9224，并告诉 AI 用这个端口）
#   起始网址 可选，直接打开到测试环境登录页
#
# 起好后：在弹出的窗口里登录测试环境（验证码/SSO 正常过），登好告诉 AI "好了"，AI 接管驱动。

PORT="${1:-9223}"
START_URL="${2:-about:blank}"
PROFILE="/tmp/acceptance-browser-${PORT}"

# 找 Chrome（mac / linux 常见路径）
CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome 2>/dev/null)" \
  "$(command -v chromium 2>/dev/null)" \
  "$(command -v chromium-browser 2>/dev/null)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "❌ 没找到 Chrome/Chromium。装一个，或手动改本脚本里的路径。"
  exit 1
fi

# 端口占用检查
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️ 端口 $PORT 已被占用。换个端口重跑：bash start-browser.sh 9224"
  echo "   （如果是上次没关的验收浏览器，关掉它，或直接用那个端口连。）"
  exit 1
fi

echo "正在打开验收浏览器（端口 $PORT）…"
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check \
  "$START_URL" >/tmp/acceptance-browser-${PORT}.log 2>&1 &

sleep 1
echo "✅ 浏览器开好了。接下来："
echo "   1. 在弹出的窗口里打开测试环境、登录（验证码/SSO 正常操作）"
echo "   2. 登好后告诉 AI「好了」，AI 会接管这个窗口去验收"
echo "（这是个独立的干净浏览器，不动你日常用的那个；验收完关掉即可。）"
