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
EVENTS_FILE="${HOME}/.ai-pm/knowledge/capture-events.jsonl"
CONSUMER_LOCK="${HOME}/.ai-pm/knowledge/consumer.lock"
KC_DIGEST="${PWD}/scripts/kc-digest.py"
mkdir -p "$(dirname "$PENDING_FILE")" 2>/dev/null

# enqueue 与后台压缩共用 kc-digest.py 里的 fcntl 锁；队列行带稳定 queue_id，
# 同一区间重试幂等。助手异常时不绕开共享锁做保底 append，且不推进水位；
# 下次 Stop 在助手恢复后重试同一区间。已存的上线前无 id 旧行仍由 prepare_queue 补 id。
ENQUEUE_READY=0
if [[ -f "$KC_DIGEST" ]] && python3 "$KC_DIGEST" --enqueue --queue "$PENDING_FILE" \
    --session "$SESSION" --transcript "$TRANSCRIPT" \
    --from-count "${LAST_COUNT:-0}" --to-count "${COUNT:-0}" \
    --ts "$(date '+%F %T')" >> "$LOG_FILE" 2>&1; then
  ENQUEUE_READY=1
  [[ "$EVENT" == "Stop" ]] && echo "$COUNT" > "$LAST_COUNT_FILE"
else
  echo "[$(date '+%F %T')] $SESSION enqueue failed; watermark unchanged range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
fi

acquire_consumer_lock() {
  if mkdir "$CONSUMER_LOCK" 2>/dev/null; then
    printf '%s\n' "$$" > "$CONSUMER_LOCK/pid"
    return 0
  fi
  local owner=""
  owner=$(cat "$CONSUMER_LOCK/pid" 2>/dev/null || true)
  if [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then
    return 1
  fi
  # 创建 lockdir 到写 pid 之间有极短窗口：无 pid 的新锁先当活锁；超 1 分钟才按崩溃残留回收。
  if [[ -z "$owner" ]] && [[ -z "$(find "$CONSUMER_LOCK" -maxdepth 0 -mmin +1 -print 2>/dev/null)" ]]; then
    return 1
  fi
  [[ -f "$CONSUMER_LOCK/pid" ]] && unlink "$CONSUMER_LOCK/pid" 2>/dev/null
  rmdir "$CONSUMER_LOCK" 2>/dev/null || return 1
  mkdir "$CONSUMER_LOCK" 2>/dev/null || return 1
  printf '%s\n' "$$" > "$CONSUMER_LOCK/pid"
  return 0
}

if ! command -v claude >/dev/null 2>&1; then
  # claude CLI 不可用：候选留在队列，由下次显式 /ai-pm-knowledge sync|add 兜底消费
  echo "[$(date '+%F %T')] $SESSION queued only (claude CLI absent) range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
elif (( ENQUEUE_READY != 1 )); then
  : # 上面已留失败日志；水位未变，下次 Stop 重试。
elif ! acquire_consumer_lock; then
  # 原子 lockdir 覆盖“摘要→claude→退出”全生命周期；已有消费者时只排队。
  echo "[$(date '+%F %T')] $SESSION queued only (consumer already running) range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
else
  KC_PROMPT="后台知识沉淀作业（无人值守，AIPM_KC_CHILD）：读 ${PENDING_FILE}，优先处理 session 为 ${SESSION} 的行，随后处理其余残留行。每行都有稳定 queue_id；对应增量已分片提取到 ${HOME}/.ai-pm/knowledge/work/digests/<session>__<from_count>-<to_count>__part-*-of-*.md。先用 Glob 取该行全部 part，按编号逐个 Read；必须读完全部 part 才能处置该行，不得只看首片。若一个 part 都缺失，才按行内 transcript 路径分段 Read 兜底。判断标准严格按 CLAUDE.md §知识沉淀Hook：问题场景+解决方案缺一不沉淀；先 grep 去重，相似即追加不新建；不做退役；卡片带 auto-generated 标记。逐行闭环：每处理完一行——含 skip——立即向 ${EVENTS_FILE} 只追加 ack 留痕，一行 JSON 必须含 queue_id、session、from_count、to_count、outcome(written|merged|skipped)、artifacts、reason，再开始下一行。严禁 Edit 或 Write ${PENDING_FILE}；下次摘要器会根据 ack 在与 enqueue 共用的锁下确定性压缩已消费行。一次跑不完整个队列属正常，但未读完全部 part 的行不得 ack。摘要文件不用你删，下轮自动清无主文件。卫生纪律：不写解析脚本，不留探针/临时文件，项目内只允许动知识库卡片本身。你没有汇报对象，完成即退出。"
  # 注意：无头会话要加载全套 CLAUDE.md+memory 再读 transcript 增量，跑 5-10 分钟属正常——
  # 判"卡死"前先看产物侧（memory/卡片 mtime）有没有进展，别只看进程没退出（07-13 误杀实证）
  mkdir -p "${HOME}/.ai-pm/knowledge/work"   # 消费者的中间文件专用区（07-15：治 .tmp_* 落项目根）
  # T1 二修（2026-07-17）：max-turns 40→80 + 摘要器前置。日志实证 13 次 Reached max turns(40)，
  # 且 80 轮复验仍零产出——瓶颈=消费者生读原始 jsonl（51/80 轮耗在 Read transcript，会话 479ed334）。
  # 原子 lockdir 在摘要前已获取；nohup bash 不 exec claude，确保 EXIT trap 覆盖到消费者真退出。
  nohup env AIPM_KC_CHILD=1 KC_PROMPT="$KC_PROMPT" KC_DIGEST="$KC_DIGEST" \
      PENDING_FILE="$PENDING_FILE" EVENTS_FILE="$EVENTS_FILE" CONSUMER_LOCK="$CONSUMER_LOCK" \
      bash -c '
        cleanup_lock() {
          [ -f "$CONSUMER_LOCK/pid" ] && unlink "$CONSUMER_LOCK/pid" 2>/dev/null
          rmdir "$CONSUMER_LOCK" 2>/dev/null
        }
        trap cleanup_lock EXIT
        python3 "$KC_DIGEST" --queue "$PENDING_FILE" --events "$EVENTS_FILE" \
          --outdir "$HOME/.ai-pm/knowledge/work/digests" 2>&1
        claude -p "$KC_PROMPT" --model sonnet --max-turns 80 \
          --allowedTools "Read,Grep,Glob,Write,Edit,Bash(printf *),Bash(chmod *),Bash(grep *)"
      ' >> "$LOG_FILE" 2>&1 </dev/null &
  CONSUMER_PID=$!
  printf '%s\n' "$CONSUMER_PID" > "$CONSUMER_LOCK/pid" 2>/dev/null
  echo "[$(date '+%F %T')] $SESSION queued+spawned headless consumer range=${LAST_COUNT:-0}-${COUNT:-0}" >> "$LOG_FILE"
fi

echo "{}"

# state 清理（每次顺手清 7 天前）
find "$STATE_DIR" -name "*.last_count" -mtime +7 -delete 2>/dev/null
find "$STATE_DIR" -name "*.ts" -mtime +7 -delete 2>/dev/null
