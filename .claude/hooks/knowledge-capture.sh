#!/usr/bin/env bash
set +e
trap 'echo "{}"; exit 0' ERR

COOLDOWN_SECONDS=60
SAVE_INTERVAL=30
STATE_DIR="${HOME}/.ai-pm/hook_state"
ENABLED_FLAG="${PWD}/.claude/hooks/.knowledge-capture.enabled"

[[ -f "$ENABLED_FLAG" ]] || { echo "{}"; exit 0; }
command -v jq >/dev/null 2>&1 || { echo "{}"; exit 0; }

# 死循环防护 0：后台无头消费会话自己的 Stop 不再触发沉淀（环境变量标记）
[[ -n "${AIPM_KC_CHILD:-}" ]] && { echo "{}"; exit 0; }

mkdir -p "$STATE_DIR" 2>/dev/null

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# 死循环防护 1：stop_hook_active flag
[[ "$ACTIVE" == "true" ]] && { echo "{}"; exit 0; }

# PreCompact / SessionEnd 直接放行——知识沉淀只在 Stop 时做，不挡 /compact、不挡会话收尾
# （2026-06-29 修：原本 PreCompact/SessionEnd 也走到末尾 block——PreCompact 反复挡压缩、SessionEnd 挡会话结束且 block 在 SessionEnd 本就无效）
[[ "$EVENT" == "PreCompact" || "$EVENT" == "SessionEnd" ]] && { echo "{}"; exit 0; }

# 死循环防护 2：60s 冷却
START_TS=$(date +%s)
LAST_TS_FILE="$STATE_DIR/${SESSION}.ts"
LAST_TS=$(cat "$LAST_TS_FILE" 2>/dev/null || echo 0)
if (( START_TS - LAST_TS < COOLDOWN_SECONDS )); then
  echo "{}"; exit 0
fi

# Stop 事件按 msg 数节流（PreCompact / SessionEnd 直接通过）
if [[ "$EVENT" == "Stop" ]]; then
  [[ -f "$TRANSCRIPT" ]] || { echo "{}"; exit 0; }
  COUNT=$(grep -c '"type":"user"' "$TRANSCRIPT" 2>/dev/null || echo 0)
  LAST_COUNT_FILE="$STATE_DIR/${SESSION}.last_count"
  LAST_COUNT=$(cat "$LAST_COUNT_FILE" 2>/dev/null || echo 0)
  DELTA=$(( COUNT - LAST_COUNT ))
  if (( DELTA < SAVE_INTERVAL )); then
    echo "{}"; exit 0
  fi
  echo "$COUNT" > "$LAST_COUNT_FILE"
fi

# 节流通过，记录时间戳
echo "$START_TS" > "$LAST_TS_FILE"

LOG_FILE="${PWD}/.claude/logs/knowledge-hook.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

# 静默排队 + 后台无头消费（2026-07-13 两步演进，均用户拍板）：
# 账本住 ~/.ai-pm/knowledge/ 而非 .claude/logs/——.claude/ 是配置域，无头会话写它会被
# sensitive-file 门拦死（无人值守没人点批准，allowedTools 不豁免；07-13 实测）。

# ①不再 block 主对话——旧模式把主对话拽回前台跑沉淀、工具调用刷屏，违反静默护栏；
# ②消费不等用户显式跑知识命令——用户实测从不显式跑，纯排队制=渠道悄悄关死
#   （自动化别甩锅给用户）。改为 hook 后台拉 headless claude 消费，主对话零感知。
PENDING_FILE="${HOME}/.ai-pm/knowledge/pending.jsonl"
mkdir -p "$(dirname "$PENDING_FILE")" 2>/dev/null
printf '{"ts":"%s","session":"%s","transcript":"%s","from_count":%s,"to_count":%s}\n' \
  "$(date '+%F %T')" "$SESSION" "$TRANSCRIPT" "${LAST_COUNT:-0}" "${COUNT:-0}" >> "$PENDING_FILE"
chmod 600 "$PENDING_FILE" 2>/dev/null

if ! command -v claude >/dev/null 2>&1; then
  # claude CLI 不可用：候选留在队列，由下次显式 /ai-pm-knowledge sync|add 兜底消费
  echo "[$(date '+%F %T')] $SESSION queued only (claude CLI absent) range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
elif pgrep -f "claude -p 后台知识沉淀" >/dev/null 2>&1; then
  # 单飞行员锁：已有消费者在跑就只排队不再拉新进程——两个消费者并发重写同一队列文件会互相踩；
  # 残留行由下一次触发的消费者顺带清（prompt 里有"顺带处理残留"）
  echo "[$(date '+%F %T')] $SESSION queued only (consumer already running) range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
else
  KC_PROMPT="后台知识沉淀作业（无人值守，AIPM_KC_CHILD）：读 ${HOME}/.ai-pm/knowledge/pending.jsonl，处理 session 为 ${SESSION} 的行——按行内 transcript 路径读该会话从 from_count 到 to_count 的增量对话，严格按 CLAUDE.md §知识沉淀Hook 的判断标准执行沉淀（问题场景+解决方案缺一不沉淀；先 grep 去重、相似即追加不新建；不做退役；卡片带 auto-generated 标记；处置结果按协议追加到 ${HOME}/.ai-pm/knowledge/capture-events.jsonl 一行）。顺带处理队列里其他残留行（若有）。全部处理完把已消费行从 pending 队列删掉。卫生纪律：读 transcript 直接用 Read 分段读，不写解析脚本；确需中间文件一律放 ${HOME}/.ai-pm/knowledge/work/ 并在退出前删掉；严禁在项目目录（项目根 / tmp/ / output/ 等任何位置）创建文件——项目内你只允许动知识库卡片本身。你没有汇报对象，完成即退出。"
  # 注意：无头会话要加载全套 CLAUDE.md+memory 再读 transcript 增量，跑 5-10 分钟属正常——
  # 判"卡死"前先看产物侧（memory/卡片 mtime）有没有进展，别只看进程没退出（07-13 误杀实证）
  mkdir -p "${HOME}/.ai-pm/knowledge/work"   # 消费者的中间文件专用区（07-15：治 .tmp_* 落项目根）
  ( nohup env AIPM_KC_CHILD=1 claude -p "$KC_PROMPT" \
      --model sonnet --max-turns 40 \
      --allowedTools "Read,Grep,Glob,Write,Edit,Bash(printf *),Bash(chmod *),Bash(grep *)" \
      >> "$LOG_FILE" 2>&1 & ) 2>/dev/null   # macOS 无 setsid；子 shell+nohup 已脱离 hook 生命周期
  echo "[$(date '+%F %T')] $SESSION queued+spawned headless consumer range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
fi

echo "{}"

# state 清理（每次顺手清 7 天前）
find "$STATE_DIR" -name "*.last_count" -mtime +7 -delete 2>/dev/null
find "$STATE_DIR" -name "*.ts" -mtime +7 -delete 2>/dev/null
