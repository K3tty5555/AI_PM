# 头脑风暴模式实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为客户端 3 个阶段页面（需求分析/用户故事/PRD）增加「先聊聊」头脑风暴模式，支持多轮 AI 对话后衔接生成产出物。

**Architecture:** 先改造事件通道支持 streamKey 隔离（P0），再新建对话存储表和 CRUD 命令（P1），然后实现 brainstorm_chat 流式命令（P2），最后在前端新建 PhaseShell + BrainstormChat 组件（P3-P5）。

**Tech Stack:** Rust (Tauri v2, rusqlite, serde_json), React/TypeScript, Tailwind CSS

---

## Task 1: P0 — 事件通道隔离（streamKey）

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs` — emit payload 格式
- Modify: `app/src/hooks/use-ai-stream.ts` — listener payload 处理

这是基础设施改造，必须先做。将 `stream_chunk` 的 payload 从纯字符串改为结构化对象。

**Step 1: 修改 Rust 端 emit**

在 `stream.rs` 中找到所有 `app.emit("stream_chunk", ...)` 的位置。当前 payload 是纯文本 `chunk`。改为：

```rust
// 构建 stream key
let stream_key = format!("generate:{}:{}", project_id, phase);

// 所有 stream_chunk emit 改为：
let _ = app.emit("stream_chunk", serde_json::json!({
    "streamKey": &stream_key,
    "text": &chunk,
}));
```

同样修改 `stream_done` 和 `stream_error` 的 payload，追加 `streamKey` 字段：
```rust
// stream_done payload 追加 streamKey
let done_payload = serde_json::json!({
    "streamKey": &stream_key,
    "outputFile": effective_output,
    "durationMs": duration_ms,
    // ... 其余字段不变
});
```

注意：`stream_key` 需要在 `start_stream` 函数开头构建，传入 provider 的回调中。检查 `AnthropicProvider` 和 `OpenAIProvider` 的 `stream` 方法中 `app.emit` 的位置——emit 可能在 provider 内部而非 `start_stream` 中。如果在 provider 内部，需要将 `stream_key` 传入 provider。

**Step 2: 修改前端 listener**

在 `use-ai-stream.ts` 中，找到 `listen<string>("stream_chunk", ...)` handler（约行 184）。改为：

```typescript
interface StreamChunkPayload {
  streamKey: string
  text: string
}

listen<StreamChunkPayload>("stream_chunk", (event) => {
  const { streamKey, text } = event.payload
  // 按 streamKey 路由到正确的 bg store entry
  const key = streamKey.replace("generate:", "")  // "projectId:phase"
  const bg = bgStore.get(key)
  if (!bg) return
  bg.text += text
  bg.notify?.({ textChunk: text })
})
```

同样修改 `stream_done` 和 `stream_error` 的 listener。

**Step 3: 验证**

```bash
cd app && npx tsc --noEmit
PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path src-tauri/Cargo.toml
```

启动 `npx tauri dev`，测试一个阶段的常规 AI 生成仍然正常工作。

**Step 4: 提交**

```bash
git commit -am "refactor: add streamKey to stream events for channel isolation"
```

---

## Task 2: P1 — 对话存储（SQLite 表 + CRUD 命令）

**Files:**
- Modify: `app/src-tauri/src/db.rs` — 新建表
- Create: `app/src-tauri/src/commands/brainstorm.rs` — CRUD 命令
- Modify: `app/src-tauri/src/commands/mod.rs` — 注册模块
- Modify: `app/src-tauri/src/lib.rs` — 注册命令
- Modify: `app/src/lib/tauri-api.ts` — 前端 API 封装

**Step 1: 新建 SQLite 表**

在 `db.rs` 的 `init_db` 函数的 `execute_batch` 中追加：

```sql
CREATE TABLE IF NOT EXISTS brainstorm_messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    seq INTEGER NOT NULL
);
```

在 `execute_batch` 之后追加索引（单独执行，迁移兼容）：
```rust
let _ = conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_bs_proj_phase ON brainstorm_messages(project_id, phase, seq)",
    [],
);
```

**Step 2: 创建 brainstorm.rs**

新建 `app/src-tauri/src/commands/brainstorm.rs`：

```rust
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrainstormMessage {
    pub id: String,
    pub project_id: String,
    pub phase: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub seq: i64,
}

#[tauri::command]
pub fn load_brainstorm_messages(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<Vec<BrainstormMessage>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, project_id, phase, role, content, created_at, seq
         FROM brainstorm_messages
         WHERE project_id = ?1 AND phase = ?2
         ORDER BY seq ASC"
    ).map_err(|e| e.to_string())?;

    let messages = stmt.query_map(rusqlite::params![project_id, phase], |row| {
        Ok(BrainstormMessage {
            id: row.get(0)?,
            project_id: row.get(1)?,
            phase: row.get(2)?,
            role: row.get(3)?,
            content: row.get(4)?,
            created_at: row.get(5)?,
            seq: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(messages)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBrainstormArgs {
    pub project_id: String,
    pub phase: String,
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub fn save_brainstorm_message(
    state: State<'_, AppState>,
    args: SaveBrainstormArgs,
) -> Result<BrainstormMessage, String> {
    let db = state.db.lock().unwrap();

    // 获取下一个 seq
    let next_seq: i64 = db.query_row(
        "SELECT COALESCE(MAX(seq), 0) + 1 FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        rusqlite::params![args.project_id, args.phase],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let id = format!("bs-{}", uuid::Uuid::new_v4());
    let created_at = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO brainstorm_messages (id, project_id, phase, role, content, created_at, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, args.project_id, args.phase, args.role, args.content, created_at, next_seq],
    ).map_err(|e| e.to_string())?;

    Ok(BrainstormMessage {
        id,
        project_id: args.project_id,
        phase: args.phase,
        role: args.role,
        content: args.content,
        created_at,
        seq: next_seq,
    })
}

#[tauri::command]
pub fn clear_brainstorm(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "DELETE FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        rusqlite::params![project_id, phase],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn brainstorm_message_count(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> i64 {
    let db = state.db.lock().unwrap();
    db.query_row(
        "SELECT COUNT(*) FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        rusqlite::params![project_id, phase],
        |row| row.get(0),
    ).unwrap_or(0)
}
```

注意：检查 Cargo.toml 是否已有 `uuid` 和 `chrono` 依赖。如果没有，需要添加或改用其他方式生成 ID 和时间戳（如 `SystemTime` + 格式化）。

**Step 3: 注册模块和命令**

在 `commands/mod.rs` 中添加 `pub mod brainstorm;`。
在 `lib.rs` 的 `invoke_handler` 中添加 4 个命令。

**Step 4: 前端 API 封装**

在 `tauri-api.ts` 中新增类型和 API：

```typescript
export interface BrainstormMessage {
  id: string
  projectId: string
  phase: string
  role: string
  content: string
  createdAt: string
  seq: number
}

// API
loadBrainstormMessages: (projectId: string, phase: string) =>
  invoke<BrainstormMessage[]>("load_brainstorm_messages", { projectId, phase }),
saveBrainstormMessage: (args: { projectId: string; phase: string; role: string; content: string }) =>
  invoke<BrainstormMessage>("save_brainstorm_message", { args }),
clearBrainstorm: (projectId: string, phase: string) =>
  invoke<void>("clear_brainstorm", { projectId, phase }),
brainstormMessageCount: (projectId: string, phase: string) =>
  invoke<number>("brainstorm_message_count", { projectId, phase }),
```

**Step 5: 验证 + 提交**

```bash
cargo check && cd ../.. && npx tsc --noEmit
git commit -am "feat: brainstorm message storage (SQLite table + CRUD commands)"
```

---

## Task 3: P2 — brainstorm_chat 流式命令

**Files:**
- Modify: `app/src-tauri/src/commands/brainstorm.rs` — 新增 brainstorm_chat
- Modify: `app/src-tauri/src/lib.rs` — 注册命令

**Step 1: 实现 brainstorm_chat**

在 `brainstorm.rs` 中新增异步流式命令。复用现有 `AiProvider::stream`，system prompt 中加入头脑风暴引导规则：

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainstormChatArgs {
    pub project_id: String,
    pub phase: String,
    pub messages: Vec<crate::commands::stream::ChatMessage>,
}

#[tauri::command]
pub async fn brainstorm_chat(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    args: BrainstormChatArgs,
) -> Result<(), String> {
    // 1. 查询项目信息
    // 2. 构建 brainstorm system prompt（含前序产出物 + 知识库 + 头脑风暴引导规则）
    // 3. 选择 provider（API 或 CLI）
    // 4. 调用 provider.stream()，emit 事件用 streamKey = "brainstorm:{projectId}:{phase}"
    // 5. 流结束后，将 AI 回复保存到 brainstorm_messages
}
```

关键：system prompt 中增加头脑风暴引导规则：
```
你正在与产品经理进行头脑风暴讨论。
- 每次只问一个问题，帮助澄清需求
- 提供选项时优先用选择题
- 当讨论满足以下条件时，提议生成产出物：(a) 至少讨论了 3 轮 (b) 核心需求已明确
- 提议格式：在回复最后单独一行写 [SUGGEST_GENERATE]，前端会渲染为结构化卡片
```

**Step 2: 注册命令**

lib.rs invoke_handler 添加 `commands::brainstorm::brainstorm_chat`。

**Step 3: 前端 API**

```typescript
brainstormChat: (args: { projectId: string; phase: string; messages: ChatMessage[] }) =>
  invoke<void>("brainstorm_chat", { args }),
```

**Step 4: 验证 + 提交**

```bash
cargo check && npx tsc --noEmit
git commit -am "feat: brainstorm_chat streaming command with guided system prompt"
```

---

## Task 4: P3 — PhaseShell + BrainstormChat 前端组件

**Files:**
- Create: `app/src/components/phase-shell.tsx` — 模式切换布局壳
- Create: `app/src/components/brainstorm-chat.tsx` — 聊天 UI 组件
- Create: `app/src/hooks/use-brainstorm.ts` — 对话管理 hook
- Modify: `app/src/pages/project/Analysis.tsx` — 包裹 PhaseShell
- Modify: `app/src/pages/project/Stories.tsx` — 包裹 PhaseShell
- Modify: `app/src/pages/project/Prd.tsx` — 包裹 PhaseShell

**Step 1: 创建 useBrainstorm hook**

```typescript
// app/src/hooks/use-brainstorm.ts
export function useBrainstorm(projectId: string, phase: string) {
  const [messages, setMessages] = useState<BrainstormMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [messageCount, setMessageCount] = useState(0)

  // 加载历史对话
  // 发送消息（保存 user message → 调用 brainstorm_chat → 监听 stream events → 保存 assistant message）
  // 清空对话
  // 监听 stream_chunk/stream_done 事件（按 brainstorm:projectId:phase 过滤）

  return { messages, loading, streaming, messageCount, sendMessage, clearMessages }
}
```

**Step 2: 创建 BrainstormChat 组件**

```typescript
// app/src/components/brainstorm-chat.tsx
// 消息列表 + 输入框 + 发送按钮 + 底部固定生成按钮
// AI 回复用 font-serif，用户消息用 font-sans
// 流式输出时末尾 blink 光标
// [SUGGEST_GENERATE] 标记渲染为结构化卡片
// 空状态：引导语 + 快速提示词 chip
// 错误态：错误卡片 + 重试按钮
```

**Step 3: 创建 PhaseShell 组件**

```typescript
// app/src/components/phase-shell.tsx
interface PhaseShellProps {
  projectId: string
  phase: string
  phaseLabel: string
  brainstormEnabled: boolean  // 是否显示模式切换
  children: React.ReactNode   // 常规模式内容
  onBrainstormGenerate: () => void  // 「生成」按钮回调
}

// Segmented Control: 直接生成 | 先聊聊
// mode === "normal" → render children
// mode === "brainstorm" → render <BrainstormChat />
// 先聊聊按钮旁边显示对话数标记
```

**Step 4: 在 3 个阶段页面中集成**

以 Prd.tsx 为例：
```tsx
<PhaseShell
  projectId={projectId}
  phase="prd"
  phaseLabel="PRD"
  brainstormEnabled={true}
  onBrainstormGenerate={handleGenerate}
>
  {/* 现有的常规模式内容 */}
</PhaseShell>
```

Analysis.tsx 和 Stories.tsx 同理。

**Step 5: 验证 + 提交**

```bash
npx tsc --noEmit
git commit -am "feat: PhaseShell + BrainstormChat components with mode switching"
```

---

## Task 5: P4 — 对话衔接生成

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs` — build_system_prompt 注入对话记录
- Modify: `app/src-tauri/src/commands/brainstorm.rs` — 摘要生成函数

**Step 1: 在 build_system_prompt 中检查并注入对话记录**

在 `build_system_prompt` 函数中，前序产出物注入之后、最终拼装之前，检查是否有该 projectId + phase 的 brainstorm_messages：

```rust
// 注入头脑风暴讨论记录
let bs_messages = load_brainstorm_for_prompt(&state, &project_id, &phase);
if !bs_messages.is_empty() {
    ctx.push_str("\n\n### 头脑风暴讨论记录\n\n");
    ctx.push_str(&bs_messages);
}
```

**Step 2: 实现 load_brainstorm_for_prompt**

```rust
fn load_brainstorm_for_prompt(state: &AppState, project_id: &str, phase: &str) -> String {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT role, content FROM brainstorm_messages
         WHERE project_id = ?1 AND phase = ?2 ORDER BY seq ASC"
    ).ok();
    // ... 查询并格式化
    // 短对话（≤10 轮）：直接拼接
    // 长对话（>10 轮）：截取首轮 + 最近 5 轮，中间标注 [... 省略 N 轮讨论 ...]
}
```

注意：此函数需要在 build_system_prompt 中能访问到 state.db。检查 build_system_prompt 的参数列表，可能需要传入 db connection 或 state 引用。

**Step 3: 验证 + 提交**

```bash
cargo check
git commit -am "feat: inject brainstorm discussion into generation prompt"
```

---

## Task 6: P5 — 首次引导 + 空状态 + 错误态

**Files:**
- Modify: `app/src/components/brainstorm-chat.tsx` — 空状态和错误态
- Modify: `app/src/components/phase-shell.tsx` — 首次引导 tooltip

**Step 1: 空状态**

BrainstormChat 中 messages 为空时渲染：
- 居中对话气泡图标（lucide-react MessageCircle）
- 引导语「和 AI 聊聊你对这个阶段的想法」
- 2-3 个快速提示词 chip（rounded-full，点击即发送）
- 按 phase 动态生成提示词

**Step 2: 错误态**

- AI 回复失败：在消息位置渲染错误卡片（destructive 左条 + 重试按钮）
- 对话超 50 轮：AI 消息后追加提示卡片「对话较长，建议生成产出物后开启新对话」

**Step 3: 首次引导**

PhaseShell 中，第一次切换到「先聊聊」时（检查 localStorage `brainstorm-onboarded`）：
- 在「生成」按钮位置显示 Tooltip
- 内容三点说明
- 关闭后 localStorage 标记

**Step 4: 验证 + 提交**

```bash
npx tsc --noEmit
git commit -am "feat: brainstorm empty state, error handling, and onboarding tooltip"
```

---

## Task 7: 端到端验证

**Step 1:** 启动 `npx tauri dev`

**Step 2:** 测试常规生成（确认 streamKey 改造没破坏现有功能）
- 进入 PRD 阶段，点生成，确认流式输出正常

**Step 3:** 测试头脑风暴模式
- 切换到「先聊聊」→ 看到空状态 + 提示词
- 点击提示词 → AI 流式回复
- 多轮对话 → 切换到「直接生成」再切回来 → 对话保留
- 切换到其他阶段再回来 → 对话保留
- 点「生成 PRD」→ 触发生成，console 确认对话记录被注入

**Step 4:** 提交 + push

```bash
git push origin main
```
