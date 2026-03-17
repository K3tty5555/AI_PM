# AI Backend Selector — Design Document

**Date:** 2026-03-16
**Status:** Approved

## Problem

Kimi For Coding 等第三方 API 存在访问限制，用户需要一个零配置替代方案。已安装并登录 Claude Code CLI 的用户，不应被强制填写 API Key。

## Solution

在设置页新增 AI 后端选择，支持两种模式：
- **API Key 模式**（现有行为，保持不变）
- **Claude Code CLI 模式**（调本机 `claude --print` 子进程，复用用户已有授权）

## Architecture

### 新增 `providers/` 模块

```
src-tauri/src/
├── providers/
│   ├── mod.rs          # AiProvider trait + 公共类型
│   ├── anthropic.rs    # Anthropic 原生 HTTP（从 stream.rs 迁移）
│   ├── openai.rs       # OpenAI 兼容 HTTP（从 stream.rs 迁移）
│   └── claude_cli.rs   # 新：claude --print 子进程
└── commands/
    ├── config.rs       # 新增 backend 字段 + test_cli_config 命令
    └── stream.rs       # 瘦身为纯路由
```

### AiProvider Trait

```rust
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<String, String>;
}
```

### Config Schema

```json
{
  "backend": "claude_cli",   // 新增："api"（默认）或 "claude_cli"
  "apiKey": "sk-...",
  "baseUrl": "https://...",
  "model": "claude-sonnet-4-6",
  "projectsDir": "~/Documents/AI PM"
}
```

`backend` 缺省时视为 `"api"`，保持向后兼容。

### stream.rs 路由逻辑

```rust
let provider: Box<dyn AiProvider> = match config.backend {
    Backend::ClaudeCli => Box::new(ClaudeCliProvider),
    Backend::Api => {
        if is_anthropic(&base_url, &model) {
            Box::new(AnthropicProvider { api_key, base_url, model })
        } else {
            Box::new(OpenAIProvider { api_key, base_url, model })
        }
    }
};
let full_text = provider.stream(&system_prompt, &args.messages, &app).await?;
```

### ClaudeCliProvider

- 命令：`claude --print --output-format stream-json "<system+user prompt>"`
- 解析 JSONL stdout，提取 text delta，逐块 emit `stream_chunk`
- 静态方法 `check_available()` 用于测试连接（`which claude`）

## Frontend Changes

### Settings 页 UI

```
AI 后端
  ○ API Key 模式
  ● Claude Code CLI（推荐，本机已登录）
    状态：✓ 已检测到 claude v1.x.x

API Key（仅 API Key 模式显示）
  [__________________________]
Base URL（可选）
  [__________________________]
模型
  [claude-sonnet-4-6_________]
```

- 切换到 CLI 模式：API Key / Base URL / Model 三个字段隐藏
- 点"测试连接"：CLI 模式调 `test_cli_config` 命令

### 新增 Tauri 命令

| 命令 | 说明 |
|------|------|
| `test_cli_config` | 检测 `claude` 是否在 PATH，返回版本号 |

### 修改 Tauri 命令

| 命令 | 变更 |
|------|------|
| `get_config` | 返回新增 `backend` 字段 |
| `save_config` | 接受并保存 `backend` 字段 |
| `test_config` | 保持不变（仅 API Key 模式使用） |

## Error Handling

| 场景 | 处理 |
|------|------|
| `claude` 未安装 | test_cli_config 返回错误，Settings 显示"未找到 claude 命令，请先安装 Claude Code" |
| `claude` 未登录 | 子进程 stderr 捕获，emit `stream_error` |
| 子进程异常退出 | 检查 exit code，非 0 时 emit `stream_error` |
| full_text 为空 | 复用现有空响应检测逻辑 |

## Backward Compatibility

- `config.json` 无 `backend` 字段时，自动视为 `"api"` 模式
- 现有 API Key 配置完全不受影响
- `async_trait` crate 已在 Cargo.toml 中（Tauri 生态常用）

## Out of Scope

- CLI 模式下的模型选择（复用 CLI 自身配置）
- 多版本 claude CLI 管理
