# UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 四项 UX 改进：思考动效、流结束元数据栏、对话记录持久化、项目状态回显修复

**Architecture:** 后端 AiProvider trait 返回值升级为 StreamResult（带 token 信息）；stream.rs 计时并 emit JSON stream_done；前端 use-ai-stream 新增 isThinking/streamMeta；ProjectStageBar 用 module-level cache 消除 LOADING 闪烁；Analysis 页对话记录写入文件持久化。

**Tech Stack:** Rust async-trait, Tauri events, React + TypeScript, react-router-dom

---

## Task 1: 升级 AiProvider trait — 引入 StreamResult

**Files:**
- Modify: `app/src-tauri/src/providers/mod.rs`

**Step 1: 将 mod.rs 全部内容替换为**

```rust
use async_trait::async_trait;
use tauri::AppHandle;
use crate::commands::stream::ChatMessage;

pub struct StreamResult {
    pub full_text: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<StreamResult, String>;
}

pub mod anthropic;
pub mod openai;
pub mod claude_cli;
```

**Step 2: 验证编译（会报错，因为三个 provider 还返回 String — 属预期）**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && ~/.cargo/bin/cargo build 2>&1 | grep "^error" | head -10
```

期望：有 error（mismatched types），正常。

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/providers/mod.rs
git commit -m "feat: add StreamResult to AiProvider trait (breaks providers — fixed in next tasks)"
```

---

## Task 2: 更新 AnthropicProvider — 解析 token，返回 StreamResult

**Files:**
- Modify: `app/src-tauri/src/providers/anthropic.rs`

**Step 1: 将文件全部内容替换为以下（核心变化：解析 message_start/message_delta 中的 token 字段，返回 StreamResult）**

```rust
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use crate::providers::{AiProvider, StreamResult};
use crate::commands::stream::ChatMessage;

pub struct AnthropicProvider {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

#[async_trait]
impl AiProvider for AnthropicProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<StreamResult, String> {
        let url = format!("{}/v1/messages", self.base_url.trim_end_matches('/'));
        let messages_json: Vec<serde_json::Value> = messages.iter().map(|m| {
            serde_json::json!({"role": m.role, "content": m.content})
        }).collect();
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 8192,
            "stream": true,
            "system": system_prompt,
            "messages": messages_json,
        });

        let client = reqwest::Client::new();
        let mut resp = client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("API error: {}", err_body));
        }

        let mut full_text = String::new();
        let mut buffer = String::new();
        let mut input_tokens: Option<u32> = None;
        let mut output_tokens: Option<u32> = None;

        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Stream read error: {}", e))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            loop {
                if let Some(pos) = buffer.find("\n\n") {
                    let event_str = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();
                    for line in event_str.lines() {
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data == "[DONE]" { continue; }
                            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                                // 提取 input tokens (message_start)
                                if event["type"] == "message_start" {
                                    if let Some(n) = event["message"]["usage"]["input_tokens"].as_u64() {
                                        input_tokens = Some(n as u32);
                                    }
                                }
                                // 提取 output tokens (message_delta)
                                if event["type"] == "message_delta" {
                                    if let Some(n) = event["usage"]["output_tokens"].as_u64() {
                                        output_tokens = Some(n as u32);
                                    }
                                }
                                // 文本内容 (content_block_delta)
                                if event["type"] == "content_block_delta" {
                                    if let Some(text) = event["delta"]["text"].as_str() {
                                        full_text.push_str(text);
                                        let _ = app.emit("stream_chunk", text);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }

        if full_text.is_empty() {
            let error_msg = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&buffer) {
                json["error"]["message"]
                    .as_str()
                    .unwrap_or("API 返回了空响应，请检查 API 配置")
                    .to_string()
            } else if !buffer.trim().is_empty() {
                format!("API 返回了空响应：{}", buffer.trim().chars().take(200).collect::<String>())
            } else {
                "API 返回了空响应，请检查 API 配置".to_string()
            };
            return Err(error_msg);
        }

        Ok(StreamResult { full_text, input_tokens, output_tokens })
    }
}
```

**Step 2: 验证编译（anthropic.rs 应通过，其他两个 provider 仍报错）**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && ~/.cargo/bin/cargo build 2>&1 | grep "^error" | head -10
```

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/providers/anthropic.rs
git commit -m "feat: AnthropicProvider returns StreamResult with token counts"
```

---

## Task 3: 更新 OpenAIProvider — 解析 usage，返回 StreamResult

**Files:**
- Modify: `app/src-tauri/src/providers/openai.rs`

**Step 1: 将文件全部内容替换为（核心变化：检测末尾 usage chunk，返回 StreamResult）**

```rust
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use crate::providers::{AiProvider, StreamResult};
use crate::commands::stream::ChatMessage;

pub struct OpenAIProvider {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

#[async_trait]
impl AiProvider for OpenAIProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<StreamResult, String> {
        let url = format!("{}/v1/chat/completions", self.base_url.trim_end_matches('/'));
        let mut messages_json: Vec<serde_json::Value> = vec![
            serde_json::json!({"role": "system", "content": system_prompt})
        ];
        for m in messages {
            messages_json.push(serde_json::json!({"role": m.role, "content": m.content}));
        }
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 8192,
            "stream": true,
            "messages": messages_json,
        });

        let client = reqwest::Client::new();
        let mut resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .header("content-type", "application/json")
            .header("User-Agent", "claude-code/1.0.0")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("API error: {}", err_body));
        }

        let mut full_text = String::new();
        let mut buffer = String::new();
        let mut input_tokens: Option<u32> = None;
        let mut output_tokens: Option<u32> = None;

        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Stream read error: {}", e))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            loop {
                if let Some(pos) = buffer.find("\n\n") {
                    let event_str = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();
                    for line in event_str.lines() {
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data == "[DONE]" { continue; }
                            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                                // 文本 chunk
                                if let Some(choices) = event["choices"].as_array() {
                                    if let Some(choice) = choices.first() {
                                        if let Some(text) = choice["delta"]["content"].as_str() {
                                            if !text.is_empty() {
                                                full_text.push_str(text);
                                                let _ = app.emit("stream_chunk", text);
                                            }
                                        }
                                    }
                                }
                                // usage chunk（部分 provider 在末尾 chunk 中携带）
                                if let Some(usage) = event.get("usage") {
                                    if let Some(n) = usage["prompt_tokens"].as_u64() {
                                        input_tokens = Some(n as u32);
                                    }
                                    if let Some(n) = usage["completion_tokens"].as_u64() {
                                        output_tokens = Some(n as u32);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }

        if full_text.is_empty() {
            let error_msg = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&buffer) {
                json["error"]["message"]
                    .as_str()
                    .unwrap_or("API 返回了空响应，请检查 API 配置")
                    .to_string()
            } else if !buffer.trim().is_empty() {
                format!("API 返回了空响应：{}", buffer.trim().chars().take(200).collect::<String>())
            } else {
                "API 返回了空响应，请检查 API 配置".to_string()
            };
            return Err(error_msg);
        }

        Ok(StreamResult { full_text, input_tokens, output_tokens })
    }
}
```

**Step 2: 验证编译**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && ~/.cargo/bin/cargo build 2>&1 | grep "^error" | head -10
```

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/providers/openai.rs
git commit -m "feat: OpenAIProvider returns StreamResult with optional token counts"
```

---

## Task 4: 更新 ClaudeCliProvider — 返回 StreamResult

**Files:**
- Modify: `app/src-tauri/src/providers/claude_cli.rs`

**Step 1: 只需改两处：`use` 行加 StreamResult，返回值改 StreamResult**

找到：
```rust
use crate::providers::AiProvider;
```
改为：
```rust
use crate::providers::{AiProvider, StreamResult};
```

找到 `impl AiProvider for ClaudeCliProvider` 中的返回类型：
```rust
    ) -> Result<String, String> {
```
改为：
```rust
    ) -> Result<StreamResult, String> {
```

找到函数末尾的：
```rust
        Ok(full_text)
    }
```
改为：
```rust
        Ok(StreamResult { full_text, input_tokens: None, output_tokens: None })
    }
```

**Step 2: 验证编译**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && ~/.cargo/bin/cargo build 2>&1 | grep "^error" | head -10
```

期望：只剩 stream.rs 相关 error（使用 Ok(full_text) 的地方）。

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/providers/claude_cli.rs
git commit -m "feat: ClaudeCliProvider returns StreamResult"
```

---

## Task 5: 更新 stream.rs — 计时 + emit JSON stream_done

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs`

**Step 1: 在文件顶部 `use` 区域，已有 `use std::fs;` 行下方加一行**

```rust
use std::time::Instant;
```

**Step 2: 在 `start_stream` 函数中，找到**

```rust
    // 选择 provider
    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
```

在这行**上方**插入：

```rust
    let stream_start = Instant::now();
```

**Step 3: 找到现有的 provider 调用和结果处理块**

```rust
    match provider.stream(&system_prompt, &args.messages, &app).await {
        Ok(full_text) => {
            let file_path = Path::new(&output_dir).join(output_file);
            if let Some(parent) = file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&file_path, &full_text);
            let _ = app.emit("stream_done", output_file);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }
```

替换为：

```rust
    match provider.stream(&system_prompt, &args.messages, &app).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;
            let file_path = Path::new(&output_dir).join(output_file);
            if let Some(parent) = file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&file_path, &result.full_text);
            let done_payload = serde_json::json!({
                "outputFile": output_file,
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }
```

**Step 4: 验证编译通过（无 error）**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && ~/.cargo/bin/cargo build 2>&1 | tail -3
```

期望：`Finished dev profile`

**Step 5: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/commands/stream.rs
git commit -m "feat: stream.rs emit JSON stream_done with timing and token counts"
```

---

## Task 6: 更新 use-ai-stream.ts — isThinking + streamMeta

**Files:**
- Modify: `app/src/hooks/use-ai-stream.ts`

**Step 1: 将文件全部内容替换为**

```typescript
import { useState, useCallback, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface UseAiStreamOptions {
  projectId: string
  phase: string
}

interface StreamDonePayload {
  outputFile: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

export interface StreamMeta {
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

interface UseAiStreamReturn {
  text: string
  isStreaming: boolean
  isThinking: boolean
  error: string | null
  outputFile: string | null
  streamMeta: StreamMeta | null
  start: (messages: Array<{ role: string; content: string }>) => void
  reset: () => void
}

export function useAiStream({ projectId, phase }: UseAiStreamOptions): UseAiStreamReturn {
  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputFile, setOutputFile] = useState<string | null>(null)
  const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(null)
  const cleanupRef = useRef<UnlistenFn[]>([])

  // isThinking: stream started but no text yet
  const isThinking = isStreaming && text === ""

  const cleanup = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setText("")
    setIsStreaming(false)
    setError(null)
    setOutputFile(null)
    setStreamMeta(null)
  }, [cleanup])

  const start = useCallback(
    (messages: Array<{ role: string; content: string }>) => {
      cleanup()
      setText("")
      setError(null)
      setOutputFile(null)
      setStreamMeta(null)
      setIsStreaming(true)

      // Set up listeners BEFORE invoking (to avoid missing early events)
      Promise.all([
        listen<string>("stream_chunk", (event) => {
          setText((prev) => prev + event.payload)
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const p = event.payload
          setOutputFile(p.outputFile)
          setStreamMeta({
            durationMs: p.durationMs,
            inputTokens: p.inputTokens,
            outputTokens: p.outputTokens,
          })
          setIsStreaming(false)
          cleanup()
        }),
        listen<string>("stream_error", (event) => {
          setError(event.payload)
          setIsStreaming(false)
          cleanup()
        }),
      ]).then((unlisteners) => {
        cleanupRef.current = unlisteners

        // Fire-and-forget: invoke starts streaming in Rust background
        api.startStream({ projectId, phase, messages }).catch((err: unknown) => {
          setError(String(err))
          setIsStreaming(false)
          cleanup()
        })
      })
    },
    [projectId, phase, cleanup]
  )

  return { text, isStreaming, isThinking, error, outputFile, streamMeta, start, reset }
}
```

**Step 2: 验证 TypeScript 无错误**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -20
```

期望：有些 error（调用方还在用旧 `outputFile: string` 解构），正常。

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src/hooks/use-ai-stream.ts
git commit -m "feat: use-ai-stream — add isThinking, streamMeta, parse JSON stream_done"
```

---

## Task 7: 创建 project-cache.ts + 更新 ProjectStageBar

**Files:**
- Create: `app/src/lib/project-cache.ts`
- Modify: `app/src/components/layout/ProjectStageBar.tsx`

**Step 1: 创建 `app/src/lib/project-cache.ts`**

```typescript
interface CachedProject {
  id: string
  currentPhase: string
  phases: Array<{ phase: string; status: string }>
}

const cache = new Map<string, CachedProject>()

export function getCachedProject(id: string): CachedProject | undefined {
  return cache.get(id)
}

export function setCachedProject(id: string, data: CachedProject): void {
  cache.set(id, data)
}

export function invalidateProject(id: string): void {
  cache.delete(id)
}
```

**Step 2: 修改 `app/src/components/layout/ProjectStageBar.tsx`**

在文件顶部 `import { api }` 下方追加：
```typescript
import { getCachedProject, setCachedProject } from "@/lib/project-cache"
```

将现有 `useEffect` 替换为：
```typescript
  useEffect(() => {
    if (!projectId) return

    // Immediately render from cache (no LOADING flash)
    const cached = getCachedProject(projectId)
    if (cached) {
      setProject(cached)
    }

    // Always fetch fresh in background
    api.getProject(projectId)
      .then((data) => {
        if (data && data.id) {
          setProject(data)
          setCachedProject(projectId, data)
        }
      })
      .catch((err) => console.error("Failed to load project:", err))
  }, [projectId])
```

**Step 3: 验证编译**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | grep "project-cache\|ProjectStageBar" | head -10
```

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src/lib/project-cache.ts app/src/components/layout/ProjectStageBar.tsx
git commit -m "feat: project-cache + ProjectStageBar cache-first render (no LOADING flash)"
```

---

## Task 8: 更新 Analysis.tsx — 思考动效 + meta 栏 + chatHistory 持久化

**Files:**
- Modify: `app/src/pages/project/Analysis.tsx`

**Step 1: 在顶部 import 区，加入 StreamMeta**

找到：
```typescript
import { useAiStream } from "@/hooks/use-ai-stream"
```
改为：
```typescript
import { useAiStream, type StreamMeta } from "@/hooks/use-ai-stream"
```

**Step 2: 解构时加入新字段**

找到：
```typescript
  const { text, isStreaming, error, outputFile, start, reset } = useAiStream({
```
改为：
```typescript
  const { text, isStreaming, isThinking, error, outputFile, streamMeta, start, reset } = useAiStream({
```

**Step 3: 在 `loadExisting` 函数中，加载 chatHistory**

找到（`loadExisting` 函数内）：
```typescript
        if (content) {
            setExistingContent(content)
          } else {
```
改为：
```typescript
        if (content) {
            setExistingContent(content)
            // Restore chat history if available
            try {
              const savedMsgs = await api.readProjectFile(projectId, "02-analysis-messages.json")
              if (savedMsgs) {
                const parsed = JSON.parse(savedMsgs) as {
                  chatHistory: ChatRound[]
                  messages: Message[]
                }
                if (parsed.chatHistory?.length > 0) setChatHistory(parsed.chatHistory)
                if (parsed.messages?.length > 0) setMessages(parsed.messages)
              }
            } catch {
              // ignore — non-critical
            }
          } else {
```

**Step 4: 在 `handleAnswer` 中保存 chatHistory**

找到 `handleAnswer` 函数中：
```typescript
      setChatHistory((prev) => [
        ...prev,
        { question: questionInfo.question, answer },
      ])

      // Build new messages array with the conversation so far
      const newMessages: Message[] = [
```

在 `setChatHistory` 调用之后、`const newMessages` 之前插入：
```typescript
      const newChatHistory = [
        ...chatHistory,
        { question: questionInfo.question, answer },
      ]
      setChatHistory(newChatHistory)
```

然后把原来的 `setChatHistory((prev) => [...])` 删掉（已替换）。

在 `start(newMessages)` 之后追加：
```typescript
      // Persist chat history (non-critical)
      api.saveProjectFile({
        projectId,
        fileName: "02-analysis-messages.json",
        content: JSON.stringify(
          { chatHistory: newChatHistory, messages: newMessages },
          null,
          2
        ),
      }).catch(() => {})
```

**Step 5: 在渲染区加入思考动效（替换现有的 `isStreaming` 进度条块）**

找到：
```tsx
      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
        </div>
      )}
```

替换为：
```tsx
      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          {isThinking ? (
            <p className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs animate-pulse text-[var(--text-muted)]">
              正在思考...
            </p>
          ) : (
            <ProgressBar value={progressValue} animated />
          )}
        </div>
      )}
```

**Step 6: 在内容区底部加入 meta 栏**

找到：
```tsx
      {/* Chat history (collapsed previous rounds) */}
```

在此注释**上方**插入：
```tsx
      {/* Stream meta */}
      {streamMeta && !isStreaming && (
        <div className="mt-3 flex items-center gap-1 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-[10px] text-[var(--text-muted)]">
          <span>耗时 {(streamMeta.durationMs / 1000).toFixed(1)}s</span>
          {streamMeta.inputTokens != null && (
            <>
              <span className="mx-1 opacity-40">·</span>
              <span>输入 {streamMeta.inputTokens.toLocaleString()} tokens</span>
              <span className="mx-1 opacity-40">·</span>
              <span>输出 {(streamMeta.outputTokens ?? 0).toLocaleString()} tokens</span>
            </>
          )}
        </div>
      )}
```

**Step 7: 验证 TypeScript 无 error**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | grep "Analysis" | head -10
```

**Step 8: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src/pages/project/Analysis.tsx
git commit -m "feat: Analysis — thinking animation, stream meta bar, chatHistory persistence"
```

---

## Task 9: 更新 Research、Review、Stories、Prd 页面 — 思考动效 + meta 栏

> **注意：** 这四个页面结构相似，均需要：
> 1. 解构时加 `isThinking, streamMeta`
> 2. 把 streaming 进度条块替换为 isThinking/ProgressBar 条件渲染
> 3. 在合适位置加 meta 栏

**Files:**
- Modify: `app/src/pages/project/Research.tsx`
- Modify: `app/src/pages/project/Review.tsx`
- Modify: `app/src/pages/project/Stories.tsx`
- Modify: `app/src/pages/project/Prd.tsx`

对每个文件，执行以下三处修改（逐文件进行）：

**修改 A：解构加字段**

找到（各文件类似）：
```typescript
  const { text, isStreaming, error, outputFile, start, reset } = useAiStream({
```
加入 `isThinking, streamMeta`：
```typescript
  const { text, isStreaming, isThinking, error, outputFile, streamMeta, start, reset } = useAiStream({
```

> **Prd.tsx 有两个 useAiStream**，只修改第一个（初始生成用的那个）。

**修改 B：替换进度条块**

找到（各文件类似）：
```tsx
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
        </div>
      )}
```
替换为：
```tsx
      {isStreaming && (
        <div className="mt-4">
          {isThinking ? (
            <p className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs animate-pulse text-[var(--text-muted)]">
              正在思考...
            </p>
          ) : (
            <ProgressBar value={progressValue} animated />
          )}
        </div>
      )}
```

**修改 C：加 meta 栏**

在内容渲染块（AnalysisCards / StoryBoard / PrdViewer / markdown div）之后，底部 action bar 之前，插入：

```tsx
      {/* Stream meta */}
      {streamMeta && !isStreaming && (
        <div className="mt-3 flex items-center gap-1 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-[10px] text-[var(--text-muted)]">
          <span>耗时 {(streamMeta.durationMs / 1000).toFixed(1)}s</span>
          {streamMeta.inputTokens != null && (
            <>
              <span className="mx-1 opacity-40">·</span>
              <span>输入 {streamMeta.inputTokens.toLocaleString()} tokens</span>
              <span className="mx-1 opacity-40">·</span>
              <span>输出 {(streamMeta.outputTokens ?? 0).toLocaleString()} tokens</span>
            </>
          )}
        </div>
      )}
```

**各页面修改后验证**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -20
```

期望：无 error。

**Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src/pages/project/Research.tsx app/src/pages/project/Review.tsx app/src/pages/project/Stories.tsx app/src/pages/project/Prd.tsx
git commit -m "feat: Research/Review/Stories/Prd — thinking animation + stream meta bar"
```

---

## Task 10: 最终构建验证

**Step 1: Rust 后端**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && ~/.cargo/bin/cargo build 2>&1 | tail -3
```

期望：`Finished dev profile`

**Step 2: TypeScript 前端**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1
```

期望：无输出（零 error）

**Step 3: Commit（如有未提交改动）**

```bash
cd /Users/xiaowu/workplace/AI_PM && git status
```
