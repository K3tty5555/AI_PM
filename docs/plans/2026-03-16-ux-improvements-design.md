# UX Improvements Design Document

**Date:** 2026-03-16
**Status:** Approved

## Problems

1. **无思考动效/耗时/Token 信息** — 流开始前无视觉反馈，流结束后无元数据展示
2. **对话记录不持久** — `chatHistory` 是纯 React state，离开页面即丢失
3. **项目状态回显闪烁** — TitleBar 导航到 Settings/Dashboard 后，ProjectLayout unmount；返回时 ProjectStageBar 显示 "LOADING..." 等待 `api.getProject()`
4. **UI 设计待审视** — 用 frontend-design 单独处理

---

## Design

### Feature 1: 思考动效 + 流结束元数据

**Backend: `providers/mod.rs` + `commands/stream.rs`**

新增 `StreamResult` 结构体（提升 AiProvider trait 返回值）：

```rust
pub struct StreamResult {
    pub full_text: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}
```

`AiProvider::stream()` 返回类型从 `Result<String, String>` 改为 `Result<StreamResult, String>`。

`stream.rs` 在调用 provider 前记录 `start: std::time::Instant::now()`，结束后计算 `duration_ms`。`stream_done` payload 改为 JSON：

```json
{
  "outputFile": "02-analysis-report.md",
  "durationMs": 12300,
  "inputTokens": 4231,
  "outputTokens": 2048
}
```

**各 Provider token 解析：**
- `AnthropicProvider`：解析 `message_start`（input_tokens）和 `message_delta`（output_tokens）SSE 事件
- `OpenAIProvider`：解析末尾 usage chunk（`choices[]` 为空且有 `usage` 字段时）；无则返回 None
- `ClaudeCliProvider`：无 token 信息，input_tokens/output_tokens 均为 None

**Frontend: `use-ai-stream.ts`**

新增状态：
- `isThinking: boolean` = `isStreaming && text === ""`（计算属性，从返回值暴露）
- `streamMeta: { durationMs: number; inputTokens?: number; outputTokens?: number } | null`

`stream_done` 监听改为 `listen<StreamDonePayload>`，解析 JSON payload。

**Phase 页面（Analysis、Research、Review 等）**

- `isThinking` 时：在进度条下方显示 `正在思考...` 闪烁动效（替换或补充当前进度条）
- 流结束且 `streamMeta` 有值时：内容区底部显示一行 meta：
  ```
  API 模式：耗时 12.3s · 输入 4,231 tokens · 输出 2,048 tokens
  CLI 模式：耗时 12.3s
  ```
  样式：`text-xs text-[var(--text-muted)] font-mono`，只在本次 session 中显示（不持久化）

---

### Feature 2: 对话记录持久化

**范围：** 目前只有 Analysis 页有 chatHistory，先只改 Analysis。

**文件命名：** `02-analysis-messages.json`

**存储格式：**
```json
{
  "chatHistory": [
    { "question": "...", "answer": "..." }
  ],
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**加载时机：** `loadExisting()` 中，如果 `ANALYSIS_FILE` 存在，同时尝试加载 `02-analysis-messages.json`，有则恢复 `chatHistory` 和 `messages` 状态。

**保存时机：** `handleAnswer()` 后，将更新后的 `chatHistory` 和 `newMessages` 写入 `02-analysis-messages.json`。

**使用已有 API：** `api.readProjectFile` / `api.saveProjectFile`，JSON 序列化用 `JSON.parse` / `JSON.stringify`。

---

### Feature 3: 项目状态回显修复

**根因：** 每次 ProjectLayout mount，ProjectStageBar 调 `api.getProject()` 有 ~100-300ms 延迟，显示 "LOADING..."。

**方案：module-level cache**

新建 `src/lib/project-cache.ts`：

```typescript
const cache = new Map<string, ProjectData>()

export function getCachedProject(id: string): ProjectData | undefined {
  return cache.get(id)
}

export function setCachedProject(id: string, data: ProjectData): void {
  cache.set(id, data)
}

export function invalidateProject(id: string): void {
  cache.delete(id)
}
```

**`ProjectStageBar.tsx` 修改：**

mount 时：
1. 先查 cache，如果有 → 立即 `setProject(cached)`（跳过 LOADING）
2. 无论是否命中 cache，都在后台 fetch 并更新 cache + state

`advancePhase` / `updatePhase` 后：调用 `invalidateProject(projectId)` 使 cache 失效，保证下次 mount 取到最新数据。

**Phase 页面**（各 Phase 的 `handleAdvance` 函数）：

在调用 `api.advancePhase()` 后，调用 `invalidateProject(projectId)` 使项目 cache 失效。

---

### Feature 4: UI 设计审视

用 `frontend-design` skill 单独运行，生成改进方案后再实现。此 feature 不进入本次实现计划。

---

## Files Changed

| 文件 | 变更类型 |
|------|------|
| `src-tauri/src/providers/mod.rs` | 新增 StreamResult struct，更新 trait |
| `src-tauri/src/providers/anthropic.rs` | 解析 input/output tokens |
| `src-tauri/src/providers/openai.rs` | 解析 usage chunk tokens |
| `src-tauri/src/providers/claude_cli.rs` | 返回 StreamResult（tokens=None）|
| `src-tauri/src/commands/stream.rs` | 计时 + emit JSON stream_done |
| `src/hooks/use-ai-stream.ts` | isThinking + streamMeta + JSON parse |
| `src/lib/project-cache.ts` | 新文件：module-level project cache |
| `src/components/layout/ProjectStageBar.tsx` | 使用 cache，消除 LOADING flash |
| `src/pages/project/Analysis.tsx` | chatHistory 持久化 + thinking 动效 + meta bar |
| `src/pages/project/Research.tsx` | thinking 动效 + meta bar |
| `src/pages/project/Review.tsx` | thinking 动效 + meta bar |
| `src/pages/project/Stories.tsx` | thinking 动效 + meta bar |
| `src/pages/project/Prd.tsx` | thinking 动效 + meta bar |
