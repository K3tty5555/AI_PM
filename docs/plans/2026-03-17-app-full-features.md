# AI PM App 全功能扩展计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 将 Claude Code 版 AI PM 的全部功能移植到桌面 App，并打磨原型预览体验。

**Architecture:** 原型页增强设备模拟器；新增独立工具层（Tools），通过新 `run_tool` Tauri 命令调用各技能；工具页共享 `useToolStream` 钩子；Sidebar 增加 TOOLS 导航区。

**Tech Stack:** Tauri 2, Rust, React/TypeScript, react-router-dom, Tauri 事件系统（stream_chunk / stream_done / stream_error）

---

## 第一批：打磨现有流程

### Task 1：原型页 — 设备切换预览

**Files:**
- Modify: `app/src/pages/project/Prototype.tsx`

**背景：** 当前 iframe 固定 `h-[600px]` 全宽，没有设备模拟。用户想在 App 内看到移动端/平板/桌面三种视口效果。

**Step 1：添加 device 状态**

在 `const [advancing, setAdvancing] = useState(false)` 之后插入：

```tsx
const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("desktop")
const DEVICE_WIDTHS = { mobile: 375, tablet: 768, desktop: 0 }
```

**Step 2：替换 iframe 区块**

找到 `{blobUrl && (` 开始的整个 JSX 块（当前约 line 176-194），替换为：

```tsx
{blobUrl && (
  <div className="mt-6 border border-[var(--border)]">
    {/* 工具栏 */}
    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4 py-2">
      <div className="flex items-center gap-1">
        {(["mobile", "tablet", "desktop"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDevice(d)}
            className={cn(
              "px-2.5 py-1 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-[10px] uppercase tracking-[1px] transition-colors",
              device === d
                ? "bg-[var(--yellow)] text-[var(--dark)]"
                : "text-[var(--text-muted)] hover:text-[var(--dark)]"
            )}
          >
            {d === "mobile" ? "375" : d === "tablet" ? "768" : "全屏"}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={handleOpenInBrowser} className="gap-1.5 text-xs">
        <ExternalLink className="size-3" />
        在浏览器中打开
      </Button>
    </div>
    {/* iframe 容器 */}
    <div className="flex justify-center bg-[var(--secondary)]/30 py-4">
      <iframe
        src={blobUrl}
        style={
          device === "desktop"
            ? { width: "100%", height: 680, border: "none" }
            : { width: DEVICE_WIDTHS[device], height: 680, border: "none", boxShadow: "0 0 0 1px var(--border)" }
        }
        sandbox="allow-scripts allow-same-origin"
        title="原型预览"
      />
    </div>
  </div>
)}
```

**Step 3：移除 Header 中重复的"在浏览器中打开"按钮**

删除 Header 区域（`<div className="mb-6 flex items-center justify-between">` 里）的那个 ExternalLink 按钮，因为工具栏里已有。

**Step 4：验证**

```bash
cd app && npx tsc --noEmit
```

预期：无错误。

**Step 5：手动测试**

启动 app，进入任意项目的原型页，确认：
- 三个切换按钮（375 / 768 / 全屏）显示正常
- 点击各按钮后 iframe 宽度改变
- "在浏览器中打开"仍正常工作

**Step 6：提交**

```bash
git add app/src/pages/project/Prototype.tsx
git commit -m "feat: prototype preview device switcher (375/768/desktop)"
```

---

## 第二批：独立工具基础设施

### Task 2：后端 `run_tool` 命令

**Files:**
- Create: `app/src-tauri/src/commands/tools.rs`
- Modify: `app/src-tauri/src/commands/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/lib/tauri-api.ts`

**背景：** `start_stream` 需要 project_id。独立工具（priority/weekly/data/interview）不属于任何项目，需要一个不依赖项目上下文的流式命令。

**Step 1：创建 tools.rs**

```rust
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::state::AppState;
use crate::commands::config::{read_config_internal, Backend};
use crate::commands::stream::ChatMessage;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunToolArgs {
    pub tool_name: String,
    pub user_input: String,
    /// 可选：附加文件路径（数据分析场景）
    pub file_path: Option<String>,
}

#[tauri::command]
pub async fn run_tool(
    app: AppHandle,
    state: State<'_, AppState>,
    args: RunToolArgs,
) -> Result<(), String> {
    // 加载 skill
    let skills_root = app.path().resource_dir()
        .map_err(|e| {
            let msg = format!("无法获取资源目录：{}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?
        .join("skills")
        .to_string_lossy()
        .to_string();

    let skill_path = Path::new(&skills_root).join(&args.tool_name).join("SKILL.md");
    if !skill_path.exists() {
        let msg = format!("Skill not found: {} (looked in {})", args.tool_name, skills_root);
        let _ = app.emit("stream_error", &msg);
        return Err(msg);
    }
    let skill_content = fs::read_to_string(&skill_path).map_err(|e| e.to_string())?;

    // 若有附加文件，读取内容追加到 user_input
    let user_input_full = if let Some(fpath) = &args.file_path {
        match fs::read_to_string(fpath) {
            Ok(content) => format!("{}\n\n---\n\n附件内容（{}）：\n\n{}", args.user_input, fpath, content),
            Err(e) => {
                let msg = format!("无法读取文件 {}: {}", fpath, e);
                let _ = app.emit("stream_error", &msg);
                return Err(msg);
            }
        }
    } else {
        args.user_input.clone()
    };

    // 构建 system prompt
    let system_prompt = format!(
        "{}\n\n---\n\n### ⚠️ 非交互模式（优先级最高，覆盖以上所有指令）\n\n你正在 AI PM 桌面应用的流式输出模式中运行，你的整个回复内容就是文档本身。\n\n**强制规则：**\n1. **第一行就是文档标题**（如 `# 优先级评估报告`），直接开始输出\n2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」等一律不输出\n3. **禁止调用工具**：Write、Edit、Bash、AskUserQuestion 均不可用\n4. **禁止提问或确认**，直接按默认参数生成\n5. **禁止过渡语句**，从文档第一行开始",
        skill_content
    );

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    let stream_start = Instant::now();

    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        Backend::ClaudeCli => Box::new(crate::providers::claude_cli::ClaudeCliProvider {
            work_dir: state.projects_dir.clone(),
        }),
        Backend::Api => {
            let base_url = config.base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string());
            let api_key = config.api_key.unwrap_or_default();
            let model = config.model.clone();
            if crate::commands::config::is_anthropic(&base_url, &model) {
                Box::new(crate::providers::anthropic::AnthropicProvider { api_key, base_url, model })
            } else {
                Box::new(crate::providers::openai::OpenAIProvider { api_key, base_url, model })
            }
        }
    };

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: user_input_full,
    }];

    match provider.stream(&system_prompt, &messages, &app).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;

            // 保存到 tools 目录
            let tools_dir = Path::new(&state.projects_dir).join("tools").join(&args.tool_name);
            let _ = fs::create_dir_all(&tools_dir);
            let out_path = tools_dir.join("output.md");
            let _ = fs::write(&out_path, &result.full_text);

            let done_payload = serde_json::json!({
                "outputFile": out_path.to_string_lossy(),
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "finalText": result.full_text,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }

    Ok(())
}
```

**Step 2：注册到 commands/mod.rs**

```rust
pub mod config;
pub mod files;
pub mod knowledge;
pub mod projects;
pub mod stream;
pub mod tools;
```

（knowledge 在 Task 7 中添加，这里一并列出以免忘记）

**Step 3：注册命令到 lib.rs**

在 `invoke_handler` 宏列表末尾添加：

```rust
commands::tools::run_tool,
```

**Step 4：添加到 tauri-api.ts**

在 `api` 对象末尾追加：

```ts
runTool: (args: { toolName: string; userInput: string; filePath?: string }) =>
  invoke<void>("run_tool", { args }),
```

**Step 5：验证**

```bash
cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check
```

预期：`Finished dev profile`，无错误。

**Step 6：提交**

```bash
git add app/src-tauri/src/commands/tools.rs app/src-tauri/src/commands/mod.rs app/src-tauri/src/lib.rs app/src/lib/tauri-api.ts
git commit -m "feat: run_tool Tauri command for standalone skill execution"
```

---

### Task 3：`useToolStream` Hook

**Files:**
- Create: `app/src/hooks/use-tool-stream.ts`

**背景：** 工具页不需要 project/phase 概念，需要一个简化版的流式 hook，调用 `api.runTool`。

**Step 1：创建 use-tool-stream.ts**

```ts
import { useState, useCallback, useRef, useEffect } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface StreamDonePayload {
  outputFile: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  finalText?: string
}

interface StreamMeta {
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

interface UseToolStreamReturn {
  text: string
  isStreaming: boolean
  isThinking: boolean
  elapsedSeconds: number
  error: string | null
  streamMeta: StreamMeta | null
  run: (userInput: string, filePath?: string) => void
  reset: () => void
}

export function useToolStream(toolName: string): UseToolStreamReturn {
  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const unlistenersRef = useRef<UnlistenFn[]>([])

  const isThinking = isStreaming && text === ""

  useEffect(() => {
    if (!isStreaming) return
    setElapsedSeconds(0)
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [isStreaming])

  const reset = useCallback(() => {
    unlistenersRef.current.forEach((fn) => fn())
    unlistenersRef.current = []
    setText("")
    setIsStreaming(false)
    setError(null)
    setStreamMeta(null)
  }, [])

  const run = useCallback(
    (userInput: string, filePath?: string) => {
      // 清理上次的 listeners
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []
      setText("")
      setError(null)
      setStreamMeta(null)
      setIsStreaming(true)

      Promise.all([
        listen<string>("stream_chunk", (event) => {
          setText((prev) => prev + event.payload)
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { durationMs, inputTokens, outputTokens, finalText } = event.payload
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setStreamMeta({ durationMs, inputTokens, outputTokens })
          // 如果 finalText 比 stream 累积内容更长（CLI 写文件场景），替换显示
          if (finalText && finalText.trim().length > 0) {
            setText(finalText)
          }
        }),
        listen<string>("stream_error", (event) => {
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setError(event.payload)
        }),
      ]).then((unlisteners) => {
        unlistenersRef.current = unlisteners
        api.runTool({ toolName, userInput, filePath }).catch((err: unknown) => {
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
          setIsStreaming(false)
          setError(String(err))
        })
      })
    },
    [toolName]
  )

  return { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset }
}
```

**Step 2：验证**

```bash
cd app && npx tsc --noEmit
```

**Step 3：提交**

```bash
git add app/src/hooks/use-tool-stream.ts
git commit -m "feat: useToolStream hook for standalone tool pages"
```

---

### Task 4：Tools 布局 + Sidebar 导航 + 路由

**Files:**
- Create: `app/src/layouts/ToolsLayout.tsx`
- Create: `app/src/pages/tools/Priority.tsx` (stub)
- Create: `app/src/pages/tools/Weekly.tsx` (stub)
- Create: `app/src/pages/tools/Knowledge.tsx` (stub)
- Create: `app/src/pages/tools/Persona.tsx` (stub)
- Create: `app/src/pages/tools/Data.tsx` (stub)
- Create: `app/src/pages/tools/Interview.tsx` (stub)
- Modify: `app/src/components/layout/Sidebar.tsx`
- Modify: `app/src/router.tsx`

**Step 1：创建 ToolsLayout.tsx**

```tsx
import { Outlet } from "react-router-dom"
import { TitleBar } from "@/components/layout/TitleBar"
import { SidebarShell } from "@/components/layout/SidebarShell"

export function ToolsLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <SidebarShell />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

**Step 2：创建 stub 页面**

在 `app/src/pages/tools/` 目录（需 `mkdir`）下创建以下 6 个文件，每个内容如下（以 Priority 为例，其余同理）：

```tsx
// app/src/pages/tools/Priority.tsx
export function ToolPriorityPage() {
  return <div>Priority - coming soon</div>
}
```

其余：`Weekly.tsx` → `ToolWeeklyPage`，`Knowledge.tsx` → `ToolKnowledgePage`，`Persona.tsx` → `ToolPersonaPage`，`Data.tsx` → `ToolDataPage`，`Interview.tsx` → `ToolInterviewPage`。

**Step 3：修改 Sidebar.tsx 添加 TOOLS 区段**

在文件顶部（`const PHASE_LABELS` 后）添加工具列表常量：

```tsx
const TOOLS = [
  { path: "/tools/priority",  label: "需求优先级", icon: "⚡" },
  { path: "/tools/weekly",    label: "工作周报",   icon: "📋" },
  { path: "/tools/knowledge", label: "知识库",     icon: "🧠" },
  { path: "/tools/persona",   label: "产品分身",   icon: "🪞" },
  { path: "/tools/data",      label: "数据洞察",   icon: "📊" },
  { path: "/tools/interview", label: "调研访谈",   icon: "🎯" },
]
```

在 `</nav>` 闭合标签（项目列表）之后、底部"NEW"按钮的 `<div>` 之前，插入：

```tsx
{/* ── TOOLS 分区 ─────────────── */}
<div className="px-5 pt-4 pb-2">
  <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-[11px] font-medium uppercase tracking-[3px] text-[var(--text-muted)]">
    TOOLS
  </span>
</div>
<div className="mx-5 mb-1 h-px bg-[var(--border)]" />
<nav className="px-3 pb-2">
  <ul className="flex flex-col gap-0.5">
    {TOOLS.map((tool) => (
      <li key={tool.path}>
        <button
          type="button"
          onClick={() => navigate(tool.path)}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
            "transition-colors duration-[var(--duration-terminal)] ease-[var(--ease-terminal)]",
            location.pathname === tool.path
              ? "bg-[var(--background)] text-[var(--dark)]"
              : "text-[var(--text-muted)] hover:bg-[var(--background)]/60 hover:text-[var(--dark)]"
          )}
        >
          <span className="text-[11px]">{tool.icon}</span>
          <span className="text-xs">{tool.label}</span>
        </button>
      </li>
    ))}
  </ul>
</nav>
```

**Step 4：修改 router.tsx**

添加 ToolsLayout 及各 Tool 路由：

```tsx
import { ToolsLayout } from "./layouts/ToolsLayout"
import { ToolPriorityPage }  from "./pages/tools/Priority"
import { ToolWeeklyPage }    from "./pages/tools/Weekly"
import { ToolKnowledgePage } from "./pages/tools/Knowledge"
import { ToolPersonaPage }   from "./pages/tools/Persona"
import { ToolDataPage }      from "./pages/tools/Data"
import { ToolInterviewPage } from "./pages/tools/Interview"
```

在现有路由数组末尾追加：

```tsx
{
  path: "/tools",
  element: <ToolsLayout />,
  children: [
    { path: "priority",  element: <ToolPriorityPage /> },
    { path: "weekly",    element: <ToolWeeklyPage /> },
    { path: "knowledge", element: <ToolKnowledgePage /> },
    { path: "persona",   element: <ToolPersonaPage /> },
    { path: "data",      element: <ToolDataPage /> },
    { path: "interview", element: <ToolInterviewPage /> },
  ],
},
```

**Step 5：验证**

```bash
cd app && npx tsc --noEmit
```

**Step 6：手动测试**

启动 app，确认：
- Sidebar 底部多出 TOOLS 区段，6 个工具链接可见
- 点击任意工具链接，跳转到对应页面（显示 stub 文字）
- 工具页有 Sidebar（左）但没有 ProjectStageBar（顶）

**Step 7：提交**

```bash
git add app/src/layouts/ToolsLayout.tsx app/src/pages/tools/ app/src/components/layout/Sidebar.tsx app/src/router.tsx
git commit -m "feat: tools layout, sidebar TOOLS section, route stubs"
```

---

### Task 5：需求优先级页面

**Files:**
- Modify: `app/src/pages/tools/Priority.tsx`

**Step 1：实现完整页面**

```tsx
import { useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

export function ToolPriorityPage() {
  const [input, setInput] = useState("")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-priority")

  const handleRun = useCallback(() => {
    if (!input.trim()) return
    reset()
    run(input.trim())
  }, [input, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <Badge variant="outline">PRIORITY</Badge>
        <span className="text-sm text-[var(--text-muted)]">需求优先级评估 — 四维评分模型</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* 输入区（仅在未开始时显示） */}
      {!isStreaming && !text && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            粘贴需求列表（每行一条，可包含提报方、影响用户数等背景信息）
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"1. 登录页加载慢（运营提报，影响全量用户）\n2. 数据导出 Excel\n3. 搜索结果排序优化\n..."}
            rows={8}
            className={cn(
              "w-full px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "outline-none resize-none",
              "focus:border-[var(--yellow)] transition-[border-color]"
            )}
          />
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={handleRun} disabled={!input.trim()}>
              开始评估
            </Button>
          </div>
        </div>
      )}

      {/* 进度 */}
      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && (
            <p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>
          )}
          <p className="mt-2 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">重置</Button>
        </div>
      )}

      {/* 结果 */}
      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
              RESULT
            </span>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset}>重新评估</Button>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text)}>复制结果</Button>
              </div>
            )}
          </div>
          <PrdViewer markdown={text} isStreaming={isStreaming} />
          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-muted)] font-mono">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens?.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2：验证**

```bash
cd app && npx tsc --noEmit
```

**Step 3：提交**

```bash
git add app/src/pages/tools/Priority.tsx
git commit -m "feat: priority evaluation tool page"
```

---

### Task 6：工作周报页面

**Files:**
- Modify: `app/src/pages/tools/Weekly.tsx`

与优先级页面结构基本相同，区别是有两个生成按钮（向上汇报版 / 团队同步版）。

**Step 1：实现完整页面**

```tsx
import { useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

export function ToolWeeklyPage() {
  const [input, setInput] = useState("")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-weekly")

  const handleRun = useCallback((mode: "brief" | "detail") => {
    if (!input.trim()) return
    reset()
    const modeHint = mode === "brief"
      ? "\n\n请生成向上汇报版周报（简洁版，--brief 模式）"
      : "\n\n请生成团队同步版周报（详细版，--detail 模式）"
    run(input.trim() + modeHint)
  }, [input, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <Badge variant="outline">WEEKLY</Badge>
        <span className="text-sm text-[var(--text-muted)]">工作周报生成</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {!isStreaming && !text && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            随意描述本周工作内容，不需要特定格式
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"这周主要跟进了 NPS 量表需求，和运营对齐了触发策略，修复了一个登录 bug，前端联调了 2 个接口。下周要推进用户故事评审。"}
            rows={6}
            className={cn(
              "w-full px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "outline-none resize-none",
              "focus:border-[var(--yellow)] transition-[border-color]"
            )}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleRun("brief")} disabled={!input.trim()}>
              向上汇报版
            </Button>
            <Button variant="primary" onClick={() => handleRun("detail")} disabled={!input.trim()}>
              团队同步版
            </Button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && (
            <p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>
          )}
          <p className="mt-2 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">重置</Button>
        </div>
      )}

      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">RESULT</span>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset}>重新生成</Button>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text)}>复制</Button>
              </div>
            )}
          </div>
          <PrdViewer markdown={text} isStreaming={isStreaming} />
          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-muted)] font-mono">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2：验证**

```bash
cd app && npx tsc --noEmit
```

**Step 3：提交**

```bash
git add app/src/pages/tools/Weekly.tsx
git commit -m "feat: weekly report tool page (brief/detail modes)"
```

---

## 第三批：项目增强工具

### Task 7：知识库 CRUD

**Files:**
- Create: `app/src-tauri/src/commands/knowledge.rs`
- Modify: `app/src-tauri/src/commands/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/lib/tauri-api.ts`
- Modify: `app/src/pages/tools/Knowledge.tsx`

**背景：** 知识库存储在 `{projectsDir}/knowledge-base/{category}/{slug}.md`，操作：列出所有条目、添加条目、删除条目。无需流式，直接文件 I/O。

**Step 1：创建 knowledge.rs**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;

const CATEGORIES: &[&str] = &["patterns", "decisions", "pitfalls", "metrics", "playbooks", "insights"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeEntry {
    pub id: String,
    pub category: String,
    pub title: String,
    pub content: String,
}

#[tauri::command]
pub fn list_knowledge(state: State<'_, AppState>) -> Vec<KnowledgeEntry> {
    let kb_root = Path::new(&state.projects_dir).join("knowledge-base");
    let mut entries = Vec::new();

    for category in CATEGORIES {
        let cat_dir = kb_root.join(category);
        if !cat_dir.exists() { continue; }
        let Ok(dir) = fs::read_dir(&cat_dir) else { continue; };
        for file in dir.filter_map(|e| e.ok()) {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") { continue; }
            let Ok(content) = fs::read_to_string(&path) else { continue; };
            let id = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            entries.push(KnowledgeEntry { id, category: category.to_string(), title, content });
        }
    }
    entries
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddKnowledgeArgs {
    pub category: String,
    pub title: String,
    pub content: String,
}

#[tauri::command]
pub fn add_knowledge(state: State<'_, AppState>, args: AddKnowledgeArgs) -> Result<KnowledgeEntry, String> {
    if !CATEGORIES.contains(&args.category.as_str()) {
        return Err(format!("Invalid category: {}", args.category));
    }
    let kb_dir = Path::new(&state.projects_dir).join("knowledge-base").join(&args.category);
    fs::create_dir_all(&kb_dir).map_err(|e| e.to_string())?;

    // 用标题生成 slug
    let slug: String = args.title.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    let slug = if slug.is_empty() {
        format!("entry-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs())
    } else { slug };

    let full_content = format!("# {}\n\n{}", args.title, args.content);
    let path = kb_dir.join(format!("{}.md", slug));
    fs::write(&path, &full_content).map_err(|e| e.to_string())?;

    Ok(KnowledgeEntry { id: slug, category: args.category, title: args.title, content: full_content })
}

#[tauri::command]
pub fn delete_knowledge(state: State<'_, AppState>, category: String, id: String) -> Result<(), String> {
    let path = Path::new(&state.projects_dir)
        .join("knowledge-base").join(&category).join(format!("{}.md", id));
    if path.exists() { fs::remove_file(&path).map_err(|e| e.to_string())?; }
    Ok(())
}
```

**Step 2：注册到 mod.rs（已在 Task 2 Step 2 中预留）**

确认 `pub mod knowledge;` 已存在。

**Step 3：注册命令到 lib.rs**

```rust
commands::knowledge::list_knowledge,
commands::knowledge::add_knowledge,
commands::knowledge::delete_knowledge,
```

**Step 4：添加到 tauri-api.ts**

先添加类型：
```ts
export interface KnowledgeEntry {
  id: string
  category: string
  title: string
  content: string
}
```

在 `api` 对象中添加：
```ts
listKnowledge: () => invoke<KnowledgeEntry[]>("list_knowledge"),
addKnowledge: (args: { category: string; title: string; content: string }) =>
  invoke<KnowledgeEntry>("add_knowledge", { args }),
deleteKnowledge: (category: string, id: string) =>
  invoke<void>("delete_knowledge", { category, id }),
```

**Step 5：实现 Knowledge.tsx**

完整页面结构：
- 顶部：六个分类标签（patterns/decisions/pitfalls/metrics/playbooks/insights），中文映射：模式/决策/踩坑/指标/打法/洞察
- 主区：当前分类下的条目列表（标题 + 内容前两行 + 删除按钮）
- 底部：添加表单（分类选择 + 标题输入 + 内容 textarea + 保存按钮）
- 无条目时显示空状态提示

```tsx
import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api, type KnowledgeEntry } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  { key: "patterns",   label: "最佳模式" },
  { key: "decisions",  label: "决策记录" },
  { key: "pitfalls",   label: "踩坑经验" },
  { key: "metrics",    label: "指标设计" },
  { key: "playbooks",  label: "打法手册" },
  { key: "insights",   label: "产品洞察" },
]

export function ToolKnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [activeCategory, setActiveCategory] = useState("pitfalls")
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadEntries = useCallback(async () => {
    try {
      const data = await api.listKnowledge()
      setEntries(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  const filtered = entries.filter((e) => e.category === activeCategory)

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setSaving(true)
    try {
      await api.addKnowledge({ category: activeCategory, title: newTitle.trim(), content: newContent.trim() })
      setNewTitle("")
      setNewContent("")
      setShowAdd(false)
      await loadEntries()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [activeCategory, newTitle, newContent, loadEntries])

  const handleDelete = useCallback(async (category: string, id: string) => {
    await api.deleteKnowledge(category, id)
    await loadEntries()
  }, [loadEntries])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">LOADING...</span>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline">KNOWLEDGE</Badge>
          <span className="text-sm text-[var(--text-muted)]">产品知识库</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "取消" : "+ 添加"}
        </Button>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* 分类标签 */}
      <div className="mt-4 flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => {
          const count = entries.filter((e) => e.category === cat.key).length
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "px-3 py-1 text-xs transition-colors font-[var(--font-geist-mono),_'Courier_New',_monospace]",
                activeCategory === cat.key
                  ? "bg-[var(--yellow)] text-[var(--dark)]"
                  : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--dark)]"
              )}
            >
              {cat.label} {count > 0 && `(${count})`}
            </button>
          )
        })}
      </div>

      {/* 添加表单 */}
      {showAdd && (
        <div className="mt-4 border border-[var(--yellow)]/30 p-4">
          <div className="mb-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="标题"
              className={cn(
                "w-full h-9 px-3 text-sm",
                "bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-muted)]",
                "outline-none focus:border-[var(--yellow)] transition-[border-color]"
              )}
            />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="内容（支持 Markdown）"
            rows={4}
            className={cn(
              "w-full px-3 py-2 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "outline-none resize-none focus:border-[var(--yellow)] transition-[border-color]"
            )}
          />
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !newTitle.trim() || !newContent.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      )}

      {/* 条目列表 */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            该分类暂无条目，点击右上角「+ 添加」记录第一条经验
          </p>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="group border border-[var(--border)] p-4 hover:border-[var(--yellow)]/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[var(--dark)]">{entry.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
                    {entry.content.replace(/^#[^\n]+\n+/, "").slice(0, 120)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(entry.category, entry.id)}
                  className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)] transition-opacity"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

**Step 6：cargo check + tsc**

```bash
cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check
cd app && npx tsc --noEmit
```

**Step 7：提交**

```bash
git add app/src-tauri/src/commands/knowledge.rs app/src-tauri/src/commands/mod.rs app/src-tauri/src/lib.rs app/src/lib/tauri-api.ts app/src/pages/tools/Knowledge.tsx
git commit -m "feat: knowledge base page (list/add/delete by category)"
```

---

### Task 8：产品分身页面

**Files:**
- Modify: `app/src-tauri/src/commands/files.rs`（添加 read_file）
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/lib/tauri-api.ts`
- Modify: `app/src/pages/tools/Persona.tsx`

**背景：** Persona 分两部分：（1）分析 PRD 文件 → 流式生成风格档案并保存；（2）列出已有风格档案，可设为当前生效风格。

风格档案存储在 `{projectsDir}/templates/prd-styles/` 下，每个风格是一个目录，内含 `style-config.json`。

**Step 1：给 files.rs 添加 read_file 命令**

在 `app/src-tauri/src/commands/files.rs` 末尾追加：

```rust
/// 读取任意本地文件（用于 Persona 分析等场景）
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))
}
```

在 lib.rs 命令列表添加：
```rust
commands::files::read_file,
```

在 tauri-api.ts 添加：
```ts
readFile: (path: string) => invoke<string>("read_file", { path }),
```

**Step 2：实现 Persona.tsx**

页面分两个 Tab：

**Tab 1 — 分析文档**（流式）
- 文件路径输入框 + "选择文件" 按钮（使用 `@tauri-apps/plugin-dialog` 的 `open()`）
- 读取文件后调用 `useToolStream("ai-pm-persona")` 的 `run(content)` 分析风格
- 输出即为风格档案内容，提供"保存为风格档案"按钮

**Tab 2 — 已有风格**
- 列出 `{projectsDir}/templates/prd-styles/` 下各子目录
- 每行：风格名 + "查看" + "设为当前"
- "设为当前"：将风格名写入 `{configDir}/config.json` 的 `activePersona` 字段

实现：

```tsx
import { useState, useEffect, useCallback } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

export function ToolPersonaPage() {
  const [tab, setTab] = useState<"analyze" | "list">("analyze")
  const [filePath, setFilePath] = useState("")
  const [fileContent, setFileContent] = useState("")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-persona")

  const handleSelectFile = useCallback(async () => {
    const selected = await openDialog({ filters: [{ name: "Markdown", extensions: ["md"] }] })
    if (selected && typeof selected === "string") {
      setFilePath(selected)
      try {
        const content = await api.readFile(selected)
        setFileContent(content)
      } catch (err) {
        console.error(err)
      }
    }
  }, [])

  const handleAnalyze = useCallback(() => {
    if (!fileContent) return
    reset()
    run(`请分析以下 PRD 文档的写作风格，生成风格档案：\n\n${fileContent}`)
  }, [fileContent, run, reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <Badge variant="outline">PERSONA</Badge>
        <span className="text-sm text-[var(--text-muted)]">产品分身 — 学习你的写作风格</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Tab 切换 */}
      <div className="mt-4 flex gap-0">
        {(["analyze", "list"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-xs font-[var(--font-geist-mono),_'Courier_New',_monospace] uppercase tracking-[1px] transition-colors",
              tab === t
                ? "border-b-2 border-[var(--yellow)] text-[var(--dark)]"
                : "text-[var(--text-muted)] hover:text-[var(--dark)]"
            )}
          >
            {t === "analyze" ? "分析文档" : "已保存风格"}
          </button>
        ))}
      </div>

      {tab === "analyze" && (
        <div className="mt-6">
          {!isStreaming && !text && (
            <>
              <p className="mb-3 text-sm text-[var(--text-muted)]">
                上传你写的 PRD 文件，AI 将分析你的写作风格、措辞习惯和结构偏好
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={filePath}
                  readOnly
                  placeholder="选择 .md 文件..."
                  className={cn(
                    "flex-1 h-9 px-3 text-sm",
                    "bg-transparent border border-[var(--border)]",
                    "placeholder:text-[var(--text-muted)]",
                    "outline-none"
                  )}
                />
                <Button variant="ghost" size="sm" onClick={handleSelectFile}>选择文件</Button>
              </div>
              {fileContent && (
                <div className="mt-3 flex justify-end">
                  <Button variant="primary" onClick={handleAnalyze}>开始分析</Button>
                </div>
              )}
            </>
          )}

          {isStreaming && (
            <div className="mt-6">
              <ProgressBar value={progressValue} animated />
              {isThinking && <p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>}
              <p className="mt-2 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => { reset(); setFileContent(""); setFilePath("") }} className="mt-2">重置</Button>
            </div>
          )}

          {text && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">风格分析结果</span>
                {!isStreaming && (
                  <Button variant="ghost" size="sm" onClick={() => { reset(); setFileContent(""); setFilePath("") }}>重新分析</Button>
                )}
              </div>
              <PrdViewer markdown={text} isStreaming={isStreaming} />
            </div>
          )}
        </div>
      )}

      {tab === "list" && (
        <div className="mt-6">
          <p className="text-sm text-[var(--text-muted)]">
            已保存的风格档案将在这里显示。分析 PRD 文档后可保存为风格档案。
          </p>
          {/* TODO: 列出 {projectsDir}/templates/prd-styles/ 下各目录 */}
          <p className="mt-4 text-xs text-[var(--text-muted)]">（功能完善中）</p>
        </div>
      )}
    </div>
  )
}
```

**Step 3：cargo check + tsc**

```bash
cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check
cd app && npx tsc --noEmit
```

**Step 4：提交**

```bash
git add app/src-tauri/src/commands/files.rs app/src-tauri/src/lib.rs app/src/lib/tauri-api.ts app/src/pages/tools/Persona.tsx
git commit -m "feat: persona tool page (PRD style analysis)"
```

---

## 第四批：复杂功能

### Task 9：数据洞察页面

**Files:**
- Modify: `app/src/pages/tools/Data.tsx`

**背景：** 用户上传 CSV 或文本数据文件，AI 进行洞察分析。对于 Excel（.xlsx/.xls），需要后端转换；本任务先支持 CSV 和 TXT，Excel 支持作为后续迭代。

**Step 1：实现 Data.tsx**

```tsx
import { useState, useCallback } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

export function ToolDataPage() {
  const [filePath, setFilePath] = useState("")
  const [analysisGoal, setAnalysisGoal] = useState("")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-data")

  const handleSelectFile = useCallback(async () => {
    const selected = await openDialog({
      filters: [{ name: "数据文件", extensions: ["csv", "txt", "md"] }],
    })
    if (selected && typeof selected === "string") {
      setFilePath(selected)
    }
  }, [])

  const handleRun = useCallback(() => {
    if (!filePath) return
    reset()
    const goal = analysisGoal.trim() || "请对数据进行全面洞察分析，发现关键趋势和问题"
    run(goal, filePath)
  }, [filePath, analysisGoal, run, reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 30)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <Badge variant="outline">DATA</Badge>
        <span className="text-sm text-[var(--text-muted)]">数据洞察分析</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {!isStreaming && !text && (
        <div className="mt-6 space-y-4">
          <div>
            <p className="mb-2 text-sm text-[var(--text-muted)]">选择数据文件（支持 CSV / TXT）</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                readOnly
                placeholder="未选择文件..."
                className={cn(
                  "flex-1 h-9 px-3 text-sm bg-transparent border border-[var(--border)]",
                  "placeholder:text-[var(--text-muted)] outline-none"
                )}
              />
              <Button variant="ghost" size="sm" onClick={handleSelectFile}>选择文件</Button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--text-muted)]">分析目标（可选）</p>
            <input
              type="text"
              value={analysisGoal}
              onChange={(e) => setAnalysisGoal(e.target.value)}
              placeholder="例：找出用户流失的关键节点"
              className={cn(
                "w-full h-9 px-3 text-sm bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-muted)] outline-none",
                "focus:border-[var(--yellow)] transition-[border-color]"
              )}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleRun} disabled={!filePath}>开始分析</Button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && <p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>}
          <p className="mt-2 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => { reset(); setFilePath(""); setAnalysisGoal("") }} className="mt-2">重置</Button>
        </div>
      )}

      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">ANALYSIS RESULT</span>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { reset(); setFilePath(""); setAnalysisGoal("") }}>重新分析</Button>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text)}>复制</Button>
              </div>
            )}
          </div>
          <PrdViewer markdown={text} isStreaming={isStreaming} />
          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-muted)] font-mono">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2：验证**

```bash
cd app && npx tsc --noEmit
```

**Step 3：提交**

```bash
git add app/src/pages/tools/Data.tsx
git commit -m "feat: data analysis tool page (CSV/TXT file upload)"
```

---

### Task 10：调研访谈页面

**Files:**
- Modify: `app/src/pages/tools/Interview.tsx`

**背景：** 调研访谈是多轮对话：AI 提结构化问题 → 用户回答 → AI 追问 → 最后生成访谈报告。可复用 `useToolStream` + `InlineChat` 组件（类似 Review 页面）。

**Step 1：实现 Interview.tsx**

```tsx
import { useState, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { InlineChat } from "@/components/inline-chat"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

interface Message { role: string; content: string }

function detectQuestion(text: string): { hasQuestion: boolean; question: string } {
  const paragraphs = text.split(/\n\n+/)
  const lastParagraphs = paragraphs.slice(-3)
  for (let i = lastParagraphs.length - 1; i >= 0; i--) {
    const p = lastParagraphs[i].trim()
    if (p.endsWith("？") || p.endsWith("?")) {
      return { hasQuestion: true, question: p }
    }
  }
  return { hasQuestion: false, question: "" }
}

export function ToolInterviewPage() {
  const [phase, setPhase] = useState<"setup" | "interview" | "done">("setup")
  const [context, setContext] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<Array<{ q: string; a: string }>>([])
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-interview")
  const startedRef = useRef(false)

  const handleStart = useCallback(() => {
    if (!context.trim()) return
    reset()
    startedRef.current = true
    const initial: Message = { role: "user", content: context.trim() }
    setMessages([initial])
    setPhase("interview")
    run(context.trim())
  }, [context, run, reset])

  const questionInfo = !isStreaming && text
    ? detectQuestion(text)
    : { hasQuestion: false, question: "" }

  const handleAnswer = useCallback((answer: string) => {
    setChatHistory((prev) => [...prev, { q: questionInfo.question, a: answer }])
    const newMessages: Message[] = [
      ...messages,
      { role: "assistant", content: text },
      { role: "user", content: answer },
    ]
    setMessages(newMessages)
    reset()
    const fullInput = newMessages.map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`).join("\n\n")
    run(fullInput)
  }, [messages, text, questionInfo.question, run, reset])

  const handleGenerateReport = useCallback(() => {
    const fullInput = [
      ...messages.map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`),
      "AI：" + text,
      "用户：请基于以上完整访谈内容，生成一份结构化访谈报告，包括访谈背景、关键发现、用户痛点、产品建议。",
    ].join("\n\n")
    reset()
    setPhase("done")
    run(fullInput)
  }, [messages, text, run, reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-6 flex items-center gap-3">
        <Badge variant="outline">INTERVIEW</Badge>
        <span className="text-sm text-[var(--text-muted)]">调研访谈</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* 初始设置 */}
      {phase === "setup" && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-muted)]">描述本次调研目标或访谈背景</p>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={"例：调研目标用户对现有 NPS 弹窗的体验感受，了解触发时机是否合适、问题是否清晰。受访者：电商平台运营人员。"}
            rows={5}
            className={cn(
              "w-full px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "outline-none resize-none",
              "focus:border-[var(--yellow)] transition-[border-color]"
            )}
          />
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={handleStart} disabled={!context.trim()}>开始访谈</Button>
          </div>
        </div>
      )}

      {/* 访谈进行中 */}
      {phase !== "setup" && (
        <div className="mt-6">
          {isStreaming && (
            <div className="mb-4">
              <ProgressBar value={progressValue} animated />
              {isThinking && <p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>}
              <p className="mt-2 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
            </div>
          )}

          {/* AI 回答 */}
          <PrdViewer markdown={text} isStreaming={isStreaming} />

          {/* 历史问答 */}
          {chatHistory.length > 0 && (
            <div className="mt-4 space-y-2">
              {chatHistory.map((round, i) => (
                <InlineChat
                  key={i}
                  question={round.q}
                  isCollapsed
                  collapsedSummary={`已回答：${round.a}`}
                />
              ))}
            </div>
          )}

          {/* 当前问题 */}
          {!isStreaming && text && questionInfo.hasQuestion && phase === "interview" && (
            <div className="mt-6">
              <InlineChat question={questionInfo.question} onAnswer={handleAnswer} />
            </div>
          )}

          {/* 访谈完成，生成报告 */}
          {!isStreaming && text && !questionInfo.hasQuestion && phase === "interview" && (
            <div className="mt-6 flex justify-end">
              <Button variant="primary" onClick={handleGenerateReport}>生成访谈报告</Button>
            </div>
          )}

          {/* 报告完成后显示元信息 */}
          {!isStreaming && phase === "done" && streamMeta && (
            <p className="mt-4 text-xs text-[var(--text-muted)] font-mono">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2：验证**

```bash
cd app && npx tsc --noEmit
```

**Step 3：提交**

```bash
git add app/src/pages/tools/Interview.tsx
git commit -m "feat: interview mode page (multi-turn Q&A + report generation)"
```

---

### Task 11：多代理模式（--team）

**Files:**
- Modify: `app/src-tauri/src/db.rs`（添加 team_mode 列）
- Modify: `app/src-tauri/src/commands/projects.rs`（create_project 接受 team_mode 参数）
- Modify: `app/src-tauri/src/commands/stream.rs`（team_mode 时在 prompt 注入 --team 标记）
- Modify: `app/src/components/new-project-dialog.tsx`（添加 team_mode 开关）
- Modify: `app/src/lib/tauri-api.ts`（createProject 接受 teamMode 参数）

**背景：** 多代理模式用于复杂需求，在 system prompt 中标注 `--team` 激活 ai-pm 技能中的多角色协作路径。

**Step 1：db.rs — projects 表添加 team_mode 列**

找到 `CREATE TABLE IF NOT EXISTS projects` 语句，添加字段：
```sql
team_mode INTEGER NOT NULL DEFAULT 0,
```

同时添加迁移代码（在 `init_db` 函数中，用 `ALTER TABLE` 追加列，已存在时忽略错误）：
```rust
// Migration: add team_mode if not exists
let _ = conn.execute("ALTER TABLE projects ADD COLUMN team_mode INTEGER NOT NULL DEFAULT 0", []);
```

**Step 2：projects.rs — create_project 接受 teamMode**

修改 `CreateProjectArgs` 结构体：
```rust
pub struct CreateProjectArgs {
    pub name: String,
    pub team_mode: Option<bool>,
}
```

在 INSERT 语句中包含 `team_mode`：
```sql
INSERT INTO projects (id, name, output_dir, current_phase, team_mode) VALUES (?1, ?2, ?3, 'requirement', ?4)
```
参数：`&team_mode_int`（0 或 1）。

**Step 3：stream.rs — team_mode 时注入 --team 提示**

在 `start_stream` 中读取项目的 `team_mode` 字段（已在 DB 查询中 JOIN 或单独查询），若为 1，则在 non-interactive 指令前插入：

```rust
if team_mode {
    ctx.push(String::new());
    ctx.push("### 多代理协作模式（--team）".to_string());
    ctx.push(String::new());
    ctx.push("本次以 `--team` 模式运行：按技能说明中的多代理协作路径执行，产出更全面深入。".to_string());
}
```

**Step 4：new-project-dialog.tsx — 添加 team_mode 开关**

在表单中添加一个复选框/开关：

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={teamMode}
    onChange={(e) => setTeamMode(e.target.checked)}
    className="accent-[var(--yellow)]"
  />
  <span className="text-sm text-[var(--text-muted)]">多代理模式（复杂需求）</span>
</label>
```

并在 `handleCreate` 中传入 `teamMode`。

**Step 5：tauri-api.ts — createProject 接受 teamMode**

```ts
createProject: (name: string, teamMode?: boolean) =>
  invoke<ProjectDetail>("create_project", { args: { name, teamMode: teamMode ?? false } }),
```

**Step 6：cargo check + tsc**

```bash
cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check
cd app && npx tsc --noEmit
```

**Step 7：提交**

```bash
git add app/src-tauri/src/db.rs app/src-tauri/src/commands/projects.rs app/src-tauri/src/commands/stream.rs app/src/components/new-project-dialog.tsx app/src/lib/tauri-api.ts
git commit -m "feat: team mode flag for new projects (--team multi-agent)"
```

---

## 完成

所有 11 个 Task 完成后，运行最终检查：

```bash
cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check
cd app && npx tsc --noEmit
```

然后启动 app 进行完整功能验收。
