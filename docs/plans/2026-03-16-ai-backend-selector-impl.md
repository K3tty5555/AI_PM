# AI Backend Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让用户在设置页选择 AI 后端：API Key 模式（现有）或 Claude Code CLI 模式（调本机 `claude --print` 子进程，无需配置 Key）

**Architecture:** 新增 `src/providers/` 模块，定义 `AiProvider` trait，将 stream.rs 中的 HTTP 逻辑迁移到 AnthropicProvider / OpenAIProvider，新增 ClaudeCliProvider 调子进程。stream.rs 瘦身为路由层。Config 新增 `backend` 字段，Settings UI 添加后端选择器。

**Tech Stack:** Rust + async-trait（新增依赖）+ tokio::process, Tauri 2, React + TypeScript

---

## Task 1: 添加 async-trait 依赖 + 创建 providers 模块骨架

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/src/providers/mod.rs`
- Create: `app/src-tauri/src/providers/anthropic.rs`（空文件占位）
- Create: `app/src-tauri/src/providers/openai.rs`（空文件占位）
- Create: `app/src-tauri/src/providers/claude_cli.rs`（空文件占位）
- Modify: `app/src-tauri/src/lib.rs`

**Step 1: 在 Cargo.toml [dependencies] 末尾追加**

```toml
async-trait = "0.1"
```

完整 dependencies 末尾应为：
```toml
dirs = "5"
async-trait = "0.1"
```

**Step 2: 创建 `app/src-tauri/src/providers/mod.rs`**

```rust
use async_trait::async_trait;
use tauri::AppHandle;
use crate::commands::stream::ChatMessage;

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<String, String>;
}

pub mod anthropic;
pub mod openai;
pub mod claude_cli;
```

**Step 3: 创建三个空的占位文件**

`app/src-tauri/src/providers/anthropic.rs`:
```rust
// placeholder
```

`app/src-tauri/src/providers/openai.rs`:
```rust
// placeholder
```

`app/src-tauri/src/providers/claude_cli.rs`:
```rust
// placeholder
```

**Step 4: 在 `app/src-tauri/src/lib.rs` 顶部（`mod commands;` 之前）追加**

```rust
mod providers;
```

**Step 5: 验证编译通过**

```bash
cd app && cargo build 2>&1 | head -30
```

期望：无 error（可能有 warning 关于未使用的 pub mod，忽略）

**Step 6: Commit**

```bash
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock \
        app/src-tauri/src/providers/ app/src-tauri/src/lib.rs
git commit -m "feat: add providers module skeleton + async-trait dependency"
```

---

## Task 2: 实现 AnthropicProvider

**Files:**
- Modify: `app/src-tauri/src/providers/anthropic.rs`

**Step 1: 替换 anthropic.rs 内容**

```rust
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use crate::providers::AiProvider;
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
    ) -> Result<String, String> {
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

        Ok(full_text)
    }
}
```

**Step 2: 验证编译**

```bash
cd app && cargo build 2>&1 | grep -E "^error"
```

期望：无 error

**Step 3: Commit**

```bash
git add app/src-tauri/src/providers/anthropic.rs
git commit -m "feat: implement AnthropicProvider"
```

---

## Task 3: 实现 OpenAIProvider

**Files:**
- Modify: `app/src-tauri/src/providers/openai.rs`

**Step 1: 替换 openai.rs 内容**

```rust
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use crate::providers::AiProvider;
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
    ) -> Result<String, String> {
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

        Ok(full_text)
    }
}
```

**Step 2: 验证编译**

```bash
cd app && cargo build 2>&1 | grep -E "^error"
```

**Step 3: Commit**

```bash
git add app/src-tauri/src/providers/openai.rs
git commit -m "feat: implement OpenAIProvider"
```

---

## Task 4: 实现 ClaudeCliProvider

**Files:**
- Modify: `app/src-tauri/src/providers/claude_cli.rs`

**Step 1: 替换 claude_cli.rs 内容**

> **注意：** `claude --print` 调用时，系统 prompt 和用户 message 合并成一条 prompt 传入。
> 用 `tokio::process::Command` + `stdin(Stdio::piped())` 将合并内容写入 stdin，
> stdout 读取流式输出，stderr 捕获错误。

```rust
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use crate::providers::AiProvider;
use crate::commands::stream::ChatMessage;

pub struct ClaudeCliProvider;

impl ClaudeCliProvider {
    /// 检测 `claude` 是否在 PATH 中，返回版本行或错误信息
    pub async fn check_available() -> Result<String, String> {
        let output = tokio::process::Command::new("claude")
            .arg("--version")
            .output()
            .await
            .map_err(|_| "未找到 claude 命令，请先安装 Claude Code：https://claude.ai/code".to_string())?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(if version.is_empty() { "claude (已安装)".to_string() } else { version })
        } else {
            Err("claude 命令存在但返回错误，请检查安装".to_string())
        }
    }
}

#[async_trait]
impl AiProvider for ClaudeCliProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<String, String> {
        let last_user = messages.iter().rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.as_str())
            .unwrap_or("");

        // 合并 system prompt 和用户输入，通过 stdin 传入（避免命令行长度限制）
        let combined = format!("{}\n\n---\n\n用户输入：{}", system_prompt, last_user);

        let mut child = tokio::process::Command::new("claude")
            .arg("--print")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("无法启动 claude 命令：{}。请确认已安装 Claude Code。", e))?;

        // 写入 stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(combined.as_bytes()).await
                .map_err(|e| format!("写入 stdin 失败：{}", e))?;
            // drop stdin → 关闭管道 → claude 收到 EOF 开始处理
        }

        // 流式读取 stdout
        let mut stdout = child.stdout.take()
            .ok_or_else(|| "无法获取 stdout".to_string())?;

        let mut full_text = String::new();
        let mut buf = vec![0u8; 4096];

        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    full_text.push_str(&chunk);
                    let _ = app.emit("stream_chunk", chunk.as_ref());
                }
                Err(e) => return Err(format!("读取 stdout 失败：{}", e)),
            }
        }

        // 等待进程结束
        let status = child.wait().await
            .map_err(|e| format!("等待进程失败：{}", e))?;

        if !status.success() {
            // 尝试读取 stderr
            let stderr_text = if let Some(mut stderr) = child.stderr.take() {
                let mut s = String::new();
                let _ = stderr.read_to_string(&mut s).await;
                s
            } else {
                String::new()
            };
            let msg = if stderr_text.trim().is_empty() {
                format!("claude 进程异常退出（exit code: {:?}）", status.code())
            } else {
                format!("claude 执行出错：{}", stderr_text.trim().chars().take(300).collect::<String>())
            };
            return Err(msg);
        }

        if full_text.trim().is_empty() {
            return Err("claude 返回了空响应，请检查登录状态（运行 `claude` 确认可用）".to_string());
        }

        Ok(full_text)
    }
}
```

> **实现说明：**
> - stderr 取出时机：`child.wait()` 之后 `child.stderr.take()` 可能拿不到（已被 move）。
>   如需读 stderr，应在 spawn 后立刻 take，并在读 stdout 同时并行读 stderr。
>   上面代码简化处理：只有进程失败时才尝试读 stderr（通常 stderr 不会太大）。
>   如果编译报 borrow 错误，改为在 spawn 后立刻 `let stderr_handle = child.stderr.take()`，
>   在 wait 之后用 `stderr_handle`。

**Step 2: 验证编译**

```bash
cd app && cargo build 2>&1 | grep -E "^error"
```

如有 borrow 错误，按上述说明调整 stderr 读取位置。

**Step 3: Commit**

```bash
git add app/src-tauri/src/providers/claude_cli.rs
git commit -m "feat: implement ClaudeCliProvider (claude --print subprocess)"
```

---

## Task 5: 更新 config.rs（新增 backend 字段）

**Files:**
- Modify: `app/src-tauri/src/commands/config.rs`

**Step 1: 在文件顶部 `use` 之后添加 Backend 枚举和更新 ClaudeConfig**

在 `const DEFAULT_MODEL` 上方插入：

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    Api,
    ClaudeCli,
}

impl Default for Backend {
    fn default() -> Self { Backend::Api }
}
```

**Step 2: 更新 ClaudeConfig struct**（在现有定义中加 backend 字段）

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeConfig {
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "baseUrl")]
    pub base_url: Option<String>,
    pub model: String,
    #[serde(default)]
    pub backend: Backend,
}
```

**Step 3: 更新 ConfigState struct**（加 backend 字段）

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigState {
    pub has_config: bool,
    pub config_source: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: String,
    pub backend: String,  // "api" 或 "claude_cli"
}
```

**Step 4: 更新 read_config_internal**

当前逻辑在没有 api_key 时返回 None。CLI 模式下不需要 api_key，需要改为：

```rust
pub fn read_config_internal(config_dir: &str) -> Option<ClaudeConfig> {
    // Tier 1: 环境变量（只对 API 模式有效）
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return Some(ClaudeConfig {
                api_key: Some(key),
                base_url: std::env::var("ANTHROPIC_BASE_URL")
                    .ok()
                    .filter(|s| !s.is_empty()),
                model: std::env::var("ANTHROPIC_MODEL")
                    .ok()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
                backend: Backend::Api,
            });
        }
    }

    // Tier 2: 本地 config.json
    let config_path = get_config_path(config_dir);
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<ClaudeConfig>(&raw) {
            // CLI 模式：不需要 api_key
            if config.backend == Backend::ClaudeCli {
                return Some(config);
            }
            // API 模式：需要 api_key
            if config.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false) {
                return Some(config);
            }
        }
    }

    None
}
```

**Step 5: 更新 get_config 命令**

在返回 `ConfigState` 的各处加上 `backend` 字段。找到所有 `ConfigState {` 实例，加上：
- 环境变量分支：`backend: "api".to_string()`
- 本地配置分支：`backend: if config.backend == Backend::ClaudeCli { "claude_cli".to_string() } else { "api".to_string() }`
- 默认 none 分支：`backend: "api".to_string()`

**Step 6: 更新 SaveConfigArgs + save_config**

在 `SaveConfigArgs` 加 backend 字段：
```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigArgs {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub backend: Option<String>,  // 新增
}
```

在 `save_config` 的 merge 逻辑末尾加：
```rust
if let Some(backend) = args.backend {
    if !backend.is_empty() {
        existing["backend"] = serde_json::Value::String(backend);
    }
}
```

**Step 7: 新增 test_cli_config 命令**

在文件末尾追加：

```rust
#[tauri::command]
pub async fn test_cli_config() -> Result<serde_json::Value, String> {
    match crate::providers::claude_cli::ClaudeCliProvider::check_available().await {
        Ok(version) => Ok(serde_json::json!({ "ok": true, "version": version })),
        Err(msg) => Ok(serde_json::json!({ "ok": false, "error": msg })),
    }
}
```

**Step 8: 验证编译**

```bash
cd app && cargo build 2>&1 | grep -E "^error"
```

**Step 9: Commit**

```bash
git add app/src-tauri/src/commands/config.rs
git commit -m "feat: add backend field to config (api/claude_cli) + test_cli_config command"
```

---

## Task 6: 重构 stream.rs（瘦身为路由层）

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs`

**Step 1: 替换 stream.rs 中的 `start_stream` 函数**

保留文件顶部的 imports、`phase_config`、`load_skill`、`build_system_prompt`、`ChatMessage`、`StartStreamArgs` 不变。

将 `start_stream` 函数替换为：

```rust
#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    args: StartStreamArgs,
) -> Result<(), String> {
    let (project_name, output_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let result = db.query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ).map_err(|e| format!("Project not found: {}", e))?;
        result
    };

    let (skill_name, input_files, output_file) = phase_config(&args.phase)
        .ok_or_else(|| format!("Unknown phase: {}", args.phase))?;

    let last_user_msg = args.messages.iter().rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str());

    let system_prompt = build_system_prompt(
        &state.ai_pm_root,
        &output_dir,
        &project_name,
        skill_name,
        input_files,
        last_user_msg,
    ).map_err(|e| {
        let _ = app.emit("stream_error", &e);
        e
    })?;

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    // 选择 provider
    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        crate::commands::config::Backend::ClaudeCli => {
            Box::new(crate::providers::claude_cli::ClaudeCliProvider)
        }
        crate::commands::config::Backend::Api => {
            let base_url = config.base_url
                .unwrap_or_else(|| "https://api.anthropic.com".to_string());
            let api_key = config.api_key.unwrap_or_default();
            let model = config.model.clone();

            let anthropic = base_url.contains("anthropic.com")
                || model.starts_with("claude-")
                || base_url == "https://api.anthropic.com";

            if anthropic {
                Box::new(crate::providers::anthropic::AnthropicProvider {
                    api_key, base_url, model,
                })
            } else {
                Box::new(crate::providers::openai::OpenAIProvider {
                    api_key, base_url, model,
                })
            }
        }
    };

    // 调用 provider
    match provider.stream(&system_prompt, &args.messages, &app).await {
        Ok(full_text) => {
            // 保存输出文件
            let file_path = std::path::Path::new(&output_dir).join(output_file);
            if let Some(parent) = file_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&file_path, &full_text);
            let _ = app.emit("stream_done", output_file);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }

    Ok(())
}
```

**Step 2: 清理 stream.rs 顶部不再需要的 imports**

原来的 `use reqwest` 相关 import 可以删除，因为 HTTP 逻辑已移到 providers。
保留：`use rusqlite::params`, `use serde`, `use std::fs`, `use std::path::Path`, `use tauri::{AppHandle, Emitter, State}`, `use crate::state::AppState`, `use crate::commands::config::read_config_internal`

**Step 3: 验证编译**

```bash
cd app && cargo build 2>&1 | grep -E "^error"
```

如有 unused import warning，删除对应 import。

**Step 4: Commit**

```bash
git add app/src-tauri/src/commands/stream.rs
git commit -m "refactor: stream.rs → pure router using AiProvider trait"
```

---

## Task 7: 注册 test_cli_config 命令

**Files:**
- Modify: `app/src-tauri/src/lib.rs`

**Step 1: 在 invoke_handler 列表中追加 `test_cli_config`**

找到：
```rust
commands::config::save_projects_dir,
```

改为：
```rust
commands::config::save_projects_dir,
commands::config::test_cli_config,
```

**Step 2: 验证编译**

```bash
cd app && cargo build 2>&1 | grep -E "^error"
```

**Step 3: Commit**

```bash
git add app/src-tauri/src/lib.rs
git commit -m "feat: register test_cli_config Tauri command"
```

---

## Task 8: 更新 tauri-api.ts（前端类型 + 新命令）

**Files:**
- Modify: `app/src/lib/tauri-api.ts`

**Step 1: 更新 ConfigState 接口，加 backend 字段**

```typescript
export interface ConfigState {
  hasConfig: boolean
  configSource: string
  apiKey: string | null
  baseUrl: string | null
  model: string
  backend: "api" | "claude_cli"  // 新增
}
```

**Step 2: 在 api 对象中，save_config args 加 backend**

```typescript
saveConfig: (args: { apiKey?: string; baseUrl?: string; model?: string; backend?: string }) =>
  invoke<{ ok: boolean }>("save_config", { args }),
```

**Step 3: 追加 testCliConfig 函数**

在 `testConfig` 下方追加：

```typescript
testCliConfig: () =>
  invoke<{ ok: boolean; version?: string; error?: string }>("test_cli_config"),
```

**Step 4: Commit**

```bash
git add app/src/lib/tauri-api.ts
git commit -m "feat: update tauri-api.ts — add backend field + testCliConfig"
```

---

## Task 9: 更新 Settings.tsx（后端选择器 UI）

**Files:**
- Modify: `app/src/pages/Settings.tsx`

**Step 1: 在现有 state 声明区域（`const [dirty, setDirty]` 附近）追加**

```typescript
const [backend, setBackend] = useState<"api" | "claude_cli">("api")
const [cliChecking, setCliChecking] = useState(false)
const [cliStatus, setCliStatus] = useState<{ ok: boolean; message: string } | null>(null)
```

**Step 2: 在 fetchConfig 中初始化 backend**

在 `setModel(data.model)` 下方追加：
```typescript
setBackend((data.backend as "api" | "claude_cli") || "api")
```

**Step 3: 新增 handleTestCli 函数**（放在 handleTest 下方）

```typescript
const handleTestCli = async () => {
  setCliChecking(true)
  setCliStatus(null)
  try {
    const data = await api.testCliConfig()
    if (data.ok) {
      setCliStatus({ ok: true, message: `已检测到：${data.version}` })
    } else {
      setCliStatus({ ok: false, message: data.error || "检测失败" })
    }
  } catch (err) {
    setCliStatus({
      ok: false,
      message: typeof err === "string" ? err : "检测失败",
    })
  } finally {
    setCliChecking(false)
  }
}
```

**Step 4: 更新 handleSave 函数**，保存时带上 backend

将 `api.saveConfig({...})` 调用改为：
```typescript
await api.saveConfig({
  ...(apiKey ? { apiKey } : {}),
  ...(baseUrl !== undefined ? { baseUrl } : {}),
  ...(model ? { model } : {}),
  backend,
})
```

**Step 5: 在 CardContent 中，API Key 字段上方插入后端选择器**

找到 `{/* API Key */}` 注释，在其上方插入：

```tsx
{/* Backend Selector */}
<div className="flex flex-col gap-2">
  <label className="text-sm font-medium text-[var(--dark)]">AI 后端</label>
  <div className="flex flex-col gap-2">
    {/* API Key 选项 */}
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="radio"
        name="backend"
        value="api"
        checked={backend === "api"}
        onChange={() => { setBackend("api"); setDirty(true); setCliStatus(null) }}
        className="mt-0.5 accent-[var(--yellow)]"
      />
      <div>
        <span className="text-sm text-[var(--dark)]">API Key 模式</span>
        <p className="text-xs text-[var(--text-muted)]">自行配置 API Key，支持 Anthropic 及 OpenAI 兼容接口</p>
      </div>
    </label>
    {/* Claude Code CLI 选项 */}
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="radio"
        name="backend"
        value="claude_cli"
        checked={backend === "claude_cli"}
        onChange={() => { setBackend("claude_cli"); setDirty(true); setCliStatus(null) }}
        className="mt-0.5 accent-[var(--yellow)]"
      />
      <div className="flex-1">
        <span className="text-sm text-[var(--dark)]">Claude Code CLI</span>
        <p className="text-xs text-[var(--text-muted)]">复用本机已登录的 Claude Code，无需单独配置 Key</p>
        {/* CLI 检测状态 */}
        {backend === "claude_cli" && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestCli}
              disabled={cliChecking}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              {cliChecking && <Loader2 className="size-3 animate-spin" />}
              检测 claude 命令
            </Button>
            {cliStatus && (
              <span className={`flex items-center gap-1 text-xs ${cliStatus.ok ? "text-[var(--green)]" : "text-[var(--destructive)]"}`}>
                {cliStatus.ok
                  ? <CheckCircle2 className="size-3" />
                  : <XCircle className="size-3" />
                }
                {cliStatus.message}
              </span>
            )}
          </div>
        )}
      </div>
    </label>
  </div>
</div>
```

**Step 6: 用条件渲染包裹 API Key / Base URL / Model 三个字段**

找到 `{/* API Key */}` 注释处，用如下条件包裹三个字段块：

```tsx
{backend === "api" && (
  <>
    {/* API Key */}
    {/* ... 现有 API Key JSX ... */}

    {/* Base URL */}
    {/* ... 现有 Base URL JSX ... */}

    {/* Model */}
    {/* ... 现有 Model JSX ... */}
  </>
)}
```

**Step 7: 更新 CardTitle 区域的状态 badge 逻辑**

当前逻辑：`config?.hasConfig ? "ACTIVE" : "INACTIVE"`

更新为同时考虑 CLI 模式：
```tsx
<Badge variant={config?.hasConfig || backend === "claude_cli" ? "default" : "outline"}>
  {backend === "claude_cli" ? "CLI" : config?.hasConfig ? "ACTIVE" : "INACTIVE"}
</Badge>
```

**Step 8: 在 CardFooter 更新"测试连接"按钮逻辑**

CLI 模式下"测试连接"按钮调 handleTestCli，API 模式调 handleTest：

```tsx
<Button
  variant="outline"
  size="default"
  onClick={backend === "claude_cli" ? handleTestCli : handleTest}
  disabled={testing || cliChecking}
  className="gap-2"
>
  {(testing || cliChecking) && <Loader2 className="size-4 animate-spin" />}
  测试连接
</Button>
```

**Step 9: 验证前端编译**

```bash
cd app && npm run build 2>&1 | tail -20
```

**Step 10: Commit**

```bash
git add app/src/pages/Settings.tsx
git commit -m "feat: Settings UI — add AI backend selector (API Key / Claude Code CLI)"
```

---

## Task 10: 联调验证

**Step 1: 启动 dev 模式**

```bash
cd app && npm run tauri dev
```

**Step 2: 验证 API Key 模式（回归）**

1. 设置页选择"API Key 模式"
2. 填写已有 API Key，点"保存配置"
3. 新建项目，运行一个 Phase
4. 期望：正常工作，与之前行为一致

**Step 3: 验证 CLI 模式**

1. 设置页切换到"Claude Code CLI"
2. 点"检测 claude 命令"，期望显示版本号
3. 保存配置
4. 新建项目，运行一个 Phase
5. 期望：通过 claude 子进程生成内容，界面正常流式显示

**Step 4: 验证错误场景**

- CLI 模式下"检测 claude 命令"，期望显示友好提示
- CLI 模式下若 claude 未登录，运行 Phase 后 emit stream_error，UI 正常展示错误

**Step 5: 验证向后兼容**

检查 `~/.config/ai-pm/config.json` 中旧格式（无 backend 字段）是否仍能正常工作：
```bash
cat ~/.config/ai-pm/config.json
# 确认无 backend 字段时默认走 api 模式
```
