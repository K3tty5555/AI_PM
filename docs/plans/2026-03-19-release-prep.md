# 正式版发布准备 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 4 个发布前缺口（ErrorBoundary、空 catch、DesignSpec 删除、首次引导），通过 Playwright 自动化验证，输出可分发内部版本。

**Architecture:** React 前端 + Tauri v2 Rust 后端，CSS 变量主题系统（`var(--accent-color)` 等），已有 `ConfirmDialog` 组件可复用。

**Tech Stack:** Tauri v2, React 18, TypeScript, Tailwind CSS, lucide-react, Rust (rusqlite, serde_json)

---

### Task 1: 全局 ErrorBoundary

**Files:**
- Create: `app/src/components/error-boundary.tsx`
- Modify: `app/src/main.tsx`

**Step 1: 创建 ErrorBoundary 组件**

新建 `app/src/components/error-boundary.tsx`：

```tsx
import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <p className="text-lg font-medium">出了点问题</p>
          <p className="max-w-md text-center text-sm text-[var(--text-secondary)]">
            {this.state.error?.message ?? "未知错误"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

**Step 2: 在 main.tsx 中包裹 RouterProvider**

修改 `app/src/main.tsx`：

```tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { router } from "./router"
import { ErrorBoundary } from "./components/error-boundary"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>
)
```

**Step 3: 验证**

运行 `cd app && npx tsc --noEmit`，确认无类型错误。

**Step 4: Commit**

```bash
git add app/src/components/error-boundary.tsx app/src/main.tsx
git commit -m "feat: add global ErrorBoundary to prevent white-screen crashes"
```

---

### Task 2: 清理空 catch 块

**Files:**
- Modify: `app/src/components/new-project-dialog.tsx`
- Modify: `app/src/hooks/use-ai-stream.ts`
- Modify: `app/src/pages/project/Prd.tsx`
- Modify: `app/src/pages/project/Research.tsx`
- Modify: `app/src/pages/tools/Data.tsx`
- Modify: `app/src/pages/tools/Knowledge.tsx`

**Step 1: 读取每个文件，定位空 catch**

在每个文件中搜索 `.catch(() => {})` 或 `catch (` 后接空块，逐一替换。

**替换规则（适用于所有文件）：**

| 原来 | 替换为 |
|------|--------|
| `.catch(() => {})` | `.catch((err) => console.error("[模块名]", err))` |
| `catch (_) { }` 或 `catch { }` | `catch (err) { console.error("[模块名]", err) }` |
| 带 UI error state 的：catch 里只有 console.error 还不够，需要同时 `setXxxError(String(err))` | 视具体组件的 state 而定，只加 console.error 即可，不需要重构 UI |

**具体文件处理：**

- `new-project-dialog.tsx`：`getConfig().catch(() => {})` → `getConfig().catch((err) => console.error("[NewProjectDialog]", err))`
- `use-ai-stream.ts`：找到空 catch，加 `console.error("[AiStream]", err)`
- `Prd.tsx`：每处空 catch 加 `console.error("[Prd]", err)`
- `Research.tsx`：`checkPlaywrightMcp().catch(() => {})` → `.catch((err) => console.error("[Research]", err))`
- `Data.tsx`：两处空 catch，分别加 `console.error("[Data]", err)`
- `Knowledge.tsx`：`searchKnowledge().catch(() => {})` → `.catch((err) => console.error("[Knowledge]", err))`

**Step 2: 验证**

```bash
cd app && npx tsc --noEmit
```

确认无类型错误。

**Step 3: Commit**

```bash
git add app/src/components/new-project-dialog.tsx \
  app/src/hooks/use-ai-stream.ts \
  app/src/pages/project/Prd.tsx \
  app/src/pages/project/Research.tsx \
  app/src/pages/tools/Data.tsx \
  app/src/pages/tools/Knowledge.tsx
git commit -m "fix: replace empty catch blocks with console.error logging"
```

---

### Task 3: DesignSpec 删除 — Rust 后端

**Files:**
- Modify: `app/src-tauri/src/commands/templates.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Step 1: 在 templates.rs 中新增 `delete_ui_spec` 命令**

在 `rename_ui_spec` 函数结束后（约第 276 行之后）插入：

```rust
#[tauri::command]
pub fn delete_ui_spec(
    state: State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    if !is_safe_style_name(&name) {
        return Err(format!("无效的规范名称: {}", name));
    }
    let spec_dir = state.templates_base().join("ui-specs").join(&name);
    if !spec_dir.exists() {
        return Err(format!("规范「{}」不存在", name));
    }
    fs::remove_dir_all(&spec_dir).map_err(|e| e.to_string())
}
```

**Step 2: 在 lib.rs 中注册命令**

在 `commands::templates::rename_ui_spec,` 之后加一行：

```rust
commands::templates::delete_ui_spec,
```

**Step 3: cargo check**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd app/src-tauri && cargo check 2>&1
```

期望输出：`Finished` 无错误。

**Step 4: Commit**

```bash
git add app/src-tauri/src/commands/templates.rs app/src-tauri/src/lib.rs
git commit -m "feat: add delete_ui_spec Rust command"
```

---

### Task 4: DesignSpec 删除 — 前端

**Files:**
- Modify: `app/src/lib/tauri-api.ts`
- Modify: `app/src/pages/tools/DesignSpec.tsx`

**Step 1: tauri-api.ts 新增绑定**

在 `renameUiSpec` 行之后插入：

```ts
deleteUiSpec: (name: string) =>
  invoke<void>("delete_ui_spec", { name }),
```

**Step 2: DesignSpec.tsx 新增删除功能**

在文件顶部 import 中确保有 `Trash2`：
```tsx
import { Pencil, Trash2 } from "lucide-react"
```

新增状态变量（在现有 rename 状态之后）：
```tsx
const [deletingSpec, setDeletingSpec] = useState<string | null>(null)
const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
```

新增删除处理函数（在 `confirmRename` 之后）：
```tsx
const handleDelete = useCallback(async (name: string) => {
  setDeletingSpec(name)
  try {
    await api.deleteUiSpec(name)
    setSpecs(prev => prev.filter(s => s.name !== name))
    setExpandedSpecs(prev => { const n = new Set(prev); n.delete(name); return n })
    setSpecContents(prev => { const n = { ...prev }; delete n[name]; return n })
  } catch (err) {
    console.error("[DesignSpec] delete failed", err)
  } finally {
    setDeletingSpec(null)
    setDeleteConfirm(null)
  }
}, [])
```

在卡片头部（`editingSpec !== spec.name` 条件下显示的操作区域）加删除按钮，紧跟 rename 铅笔图标之后：

```tsx
{editingSpec !== spec.name && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(spec.name) }}
    title="删除规范"
    disabled={deletingSpec === spec.name}
    className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
  >
    <Trash2 className="h-3 w-3" />
  </button>
)}
```

在组件 JSX 末尾（`</div>` 闭合前）加确认 dialog：

```tsx
{deleteConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirm(null)}>
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl w-80" onClick={e => e.stopPropagation()}>
      <p className="text-sm font-medium text-[var(--text-primary)]">删除「{deleteConfirm}」？</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">规范目录将被永久删除，无法恢复。</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--hover-bg)]">
          取消
        </button>
        <button
          onClick={() => handleDelete(deleteConfirm)}
          disabled={deletingSpec === deleteConfirm}
          className="rounded-lg bg-[var(--destructive)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          {deletingSpec === deleteConfirm ? "删除中…" : "确认删除"}
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 3: 验证**

```bash
cd app && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/src/lib/tauri-api.ts app/src/pages/tools/DesignSpec.tsx
git commit -m "feat: add delete UI spec functionality (DesignSpec.tsx)"
```

---

### Task 5: 首次启动引导 Modal

**Files:**
- Modify: `app/src/pages/Dashboard.tsx`

**Step 1: 新增引导 Modal**

在 Dashboard.tsx 中找到 `hasConfig` 相关逻辑（`useEffect` 里调用 `api.getConfig()`），确认已有 `hasConfig` 状态。

新增一个 `showOnboarding` 状态，读取 localStorage 决定是否显示：

```tsx
const [showOnboarding, setShowOnboarding] = useState(false)
```

在加载 config 的 `useEffect` 里，在 `setHasConfig(cfg.hasConfig)` 之后追加：

```tsx
if (!cfg.hasConfig && !localStorage.getItem("onboarding-dismissed")) {
  setShowOnboarding(true)
}
```

关闭引导的处理函数：

```tsx
const dismissOnboarding = useCallback(() => {
  localStorage.setItem("onboarding-dismissed", "1")
  setShowOnboarding(false)
}, [])
```

跳转设置页：
```tsx
const goToSettings = useCallback(() => {
  dismissOnboarding()
  navigate("/settings")
}, [dismissOnboarding, navigate])
```

在 Dashboard JSX 末尾加 Modal（与 deleteConfirm 模式一致）：

```tsx
{showOnboarding && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl w-96">
      <p className="text-base font-semibold text-[var(--text-primary)]">欢迎使用 AI PM</p>
      <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
        使用 AI 功能前，需要先配置 Claude API Key。
        前往设置页填写后，即可开始使用完整功能。
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={dismissOnboarding}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
        >
          稍后再说
        </button>
        <button
          onClick={goToSettings}
          className="rounded-lg bg-[var(--accent-color)] px-4 py-1.5 text-sm text-white hover:opacity-90"
        >
          去设置
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 2: 逻辑说明**

- `localStorage.getItem("onboarding-dismissed")` 为空 + `hasConfig === false` → 显示引导
- 用户点「稍后再说」或「去设置」→ 写入 localStorage，不再弹出
- 用户配置了 API Key → 下次进入 `hasConfig === true`，不弹出

**Step 3: 验证**

```bash
cd app && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/src/pages/Dashboard.tsx
git commit -m "feat: show first-run onboarding modal when API key not configured"
```

---

### Task 6: Playwright 自动化测试

**由 Claude 在开发模式下执行，非代码任务，无需提交。**

启动开发服务器：

```bash
cd app && npm run tauri dev
```

等待窗口出现后，使用 Playwright MCP 依次验证：

| # | 测试项 | 验证方法 |
|---|--------|---------|
| 1 | Dashboard 加载 | 截图确认项目列表或空状态显示 |
| 2 | 首次引导 Modal | 确认 `showOnboarding` 逻辑（需清空 localStorage 模拟首次） |
| 3 | 新建项目 | 点击新建 → 填写名称 → 确认项目出现在列表 |
| 4 | 项目重命名 | hover 卡片 → 铅笔图标 → 输入新名 → Enter 确认 |
| 5 | 进入项目 → 各阶段页 | 点击项目 → 导航到 Research / PRD 页，无白屏 |
| 6 | 产品分身 rename | Settings → Persona 标签 → 重命名已有风格 |
| 7 | 设计规范 rename + delete | DesignSpec 页 → rename 一个规范 → delete 一个规范 |
| 8 | ErrorBoundary 触发 | 通过 `browser_evaluate` 手动抛出渲染错误，确认恢复界面显示 |
| 9 | 设置页 | 导航到 /settings，确认页面加载 |
| 10 | 暗色模式 | 切换主题，截图确认 activity bar / sidebar 颜色正确 |

每个测试项截图记录，汇总为测试报告供人工核查。

---

### Task 7: 全量构建验证

**Step 1: TypeScript 类型检查**

```bash
cd app && npx tsc --noEmit 2>&1
```

期望：无输出（0 错误）。

**Step 2: Rust 构建**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd app/src-tauri && cargo build 2>&1
```

期望：`Finished` 无错误。

**Step 3: Tauri 打包（macOS）**

```bash
cd app && npm run tauri build 2>&1
```

期望：在 `src-tauri/target/release/bundle/dmg/` 生成 `.dmg` 文件。

**Step 4: 确认产物**

检查 `app/src-tauri/target/release/bundle/` 目录，确认 `.dmg`（macOS）文件存在且可打开。

**Step 5: Commit（如有构建配置变更）**

如果 Task 1-5 的所有改动均已提交，此步骤只是验证，无需额外提交。

---

## 执行顺序

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 7（类型 + Rust 检查）→ Task 6（Playwright 验证）→ Task 7（tauri build）

Tasks 1-5 可以 subagent-driven 方式顺序执行（有依赖：Task 4 依赖 Task 3）。
