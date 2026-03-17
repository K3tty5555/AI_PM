# Web UX Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 UX 审查报告中所有已识别问题，包含 P0/P1/P2 问题，并将所有浏览器原生 confirm() 替换为自定义弹窗。

**Architecture:** 纯前端改动，不涉及 API 层。新增 ConfirmDialog 通用组件；改动 TopBar、Settings Layout、NewProjectDialog、需求页、globals.css。

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, 终末地设计系统 (--yellow, --border, --radius:0, monospace)

---

## 文件速查

- `web/app/globals.css` — 全局样式，含 CSS 变量
- `web/components/ui/confirm-dialog.tsx` — 待创建：自定义确认弹窗
- `web/app/(dashboard)/page.tsx` — 仪表盘，含 confirm() 调用
- `web/components/layout/top-bar.tsx` — 顶栏，含 "online" 状态
- `web/app/settings/layout.tsx` — 设置页布局，含自定义 BACK header
- `web/components/new-project-dialog.tsx` — 新建项目弹窗，含需求描述字段
- `web/app/project/[id]/requirement/page.tsx` — 需求收集页，含冗余字段和底部按钮

---

### Task 1: 隐藏 Next.js DevTools 悬浮按钮

**问题：** 左下角 "N" 黄色圆形按钮是 Next.js 开发工具，不应出现在用户界面里。

**Files:**
- Modify: `web/app/globals.css`

**Step 1: 在 globals.css 末尾追加隐藏规则**

```css
/* 隐藏 Next.js DevTools 悬浮按钮（开发环境注入，不属于产品 UI） */
nextjs-portal {
  display: none !important;
}
```

**Step 2: 验证**

启动 dev server，访问 http://localhost:3000，确认左下角不再有黄色 "N" 圆形按钮。

**Step 3: Commit**

```bash
git add web/app/globals.css
git commit -m "fix: 隐藏 Next.js DevTools 悬浮按钮"
```

---

### Task 2: 自定义 ConfirmDialog 组件

**问题：** 删除项目时调用浏览器原生 `confirm()`，样式不统一，无法定制。

**Files:**
- Create: `web/components/ui/confirm-dialog.tsx`
- Modify: `web/app/(dashboard)/page.tsx`

**Step 1: 创建 ConfirmDialog 组件**

创建 `web/components/ui/confirm-dialog.tsx`：

```tsx
"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open: boolean
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "default"
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  open,
  title = "// CONFIRM",
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onCancel() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      style={{ animation: "fadeInUp 0.15s ease-out" }}
    >
      <div
        className="w-full max-w-[400px] border border-[var(--border)] bg-[var(--background)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{ animation: "fadeInUp 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* HUD 标题 */}
        <div className="mb-4">
          <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs font-medium uppercase tracking-[3px] text-[var(--text-muted)]">
            {title}
          </span>
        </div>

        {/* 分隔线 */}
        <div className="mb-4 h-px bg-[var(--border)]" />

        {/* 描述文字 */}
        <p className="mb-6 text-sm leading-relaxed text-[var(--dark)]">
          {description}
        </p>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export { ConfirmDialog }
export type { ConfirmDialogProps }
```

**Step 2: 检查 Button 组件是否有 destructive variant**

```bash
grep -n "destructive" web/components/ui/button.tsx
```

如果没有 destructive variant，在 button.tsx 中增加（红色背景按钮）。如果已有则跳过。

**Step 3: 替换仪表盘中的 confirm()**

修改 `web/app/(dashboard)/page.tsx`：

① 顶部新增 import：
```tsx
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
```

② 新增 confirmOpen state（与 deletingId 并列）：
```tsx
const [confirmId, setConfirmId] = useState<string | null>(null)
```

③ 修改 handleDelete 函数，移除 confirm() 调用，改为设置 confirmId：
```tsx
const handleDelete = (e: React.MouseEvent, id: string) => {
  e.stopPropagation()
  setConfirmId(id)
}
```

④ 新增 handleConfirmDelete 函数：
```tsx
const handleConfirmDelete = async () => {
  if (!confirmId) return
  const id = confirmId
  setConfirmId(null)
  setDeletingId(id)
  try {
    await fetch(`/api/projects/${id}`, { method: "DELETE" })
    setProjects((prev) => prev.filter((p) => p.id !== id))
  } catch (err) {
    console.error("Failed to delete project:", err)
  } finally {
    setDeletingId(null)
  }
}
```

⑤ 在 return 的 JSX 末尾（NewProjectDialog 后面）追加 ConfirmDialog：
```tsx
<ConfirmDialog
  open={confirmId !== null}
  title="// DELETE_PROJECT"
  description="确认删除该项目？项目数据库记录和本地所有输出文件将被永久删除，此操作不可撤销。"
  confirmLabel="删除"
  cancelLabel="取消"
  variant="danger"
  onConfirm={handleConfirmDelete}
  onCancel={() => setConfirmId(null)}
/>
```

**Step 4: 验证**

访问仪表盘，悬停项目卡片，点击垃圾桶图标，应出现自定义弹窗而非浏览器 confirm。Escape 键可关闭，点击遮罩层可关闭，点击"删除"正常执行删除。

**Step 5: Commit**

```bash
git add web/components/ui/confirm-dialog.tsx web/app/(dashboard)/page.tsx
git commit -m "feat: 新增自定义 ConfirmDialog，替换浏览器原生 confirm()"
```

---

### Task 3: Logo 点击回首页 + API 状态指示器

**问题：** "// AI PM" logo 无法点击回首页；"online" 标签无实际意义。

**Files:**
- Modify: `web/components/layout/top-bar.tsx`

**Step 1: 改造 TopBar**

完整替换 `web/components/layout/top-bar.tsx` 内容：

```tsx
"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function TopBar({ className }: { className?: string }) {
  const router = useRouter()
  const [apiReady, setApiReady] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => setApiReady(!!data.hasConfig))
      .catch(() => setApiReady(false))
  }, [])

  return (
    <header
      data-slot="top-bar"
      className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6",
        className
      )}
    >
      {/* Left: Brand — clickable, goes home */}
      <Link
        href="/"
        className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-base font-bold tracking-[2px] text-[var(--dark)] transition-opacity hover:opacity-70"
      >
        // AI PM
      </Link>

      {/* Right: API Status + Settings */}
      <div className="flex items-center gap-4">
        {/* API status indicator */}
        {apiReady !== null && (
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
            title={apiReady ? "API 已配置" : "点击配置 API"}
          >
            <span
              className={cn(
                "inline-block h-2 w-2",
                apiReady ? "bg-[var(--green)]" : "bg-[var(--yellow)]"
              )}
              style={apiReady ? { animation: "dotPulse 2s ease-in-out infinite" } : undefined}
            />
            <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
              {apiReady ? "API_OK" : "API_UNSET"}
            </span>
          </button>
        )}

        {/* Settings button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/settings")}
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  )
}

export { TopBar }
```

**Step 2: 验证**

- 点击 "// AI PM" logo 应导航到 "/"
- API 已配置时右侧显示绿色 "API_OK"（脉冲动画）
- API 未配置时显示黄色 "API_UNSET"，点击可跳转设置页

**Step 3: Commit**

```bash
git add web/components/layout/top-bar.tsx
git commit -m "fix: logo 点击回首页，API 状态指示器改为实际 API 可用性"
```

---

### Task 4: Settings 页面使用统一 TopBar

**问题：** Settings 页面自定义了 header，与整体导航割裂；进入设置后上下文丢失。

**Files:**
- Modify: `web/app/settings/layout.tsx`

**Step 1: 替换 Settings Layout**

完整替换 `web/app/settings/layout.tsx`：

```tsx
import { TopBar } from "@/components/layout/top-bar"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto w-full max-w-[640px]">
          {children}
        </div>
      </main>
    </div>
  )
}
```

注意：`settings/layout.tsx` 去掉 `"use client"` 指令，因为 TopBar 已经是 client component，layout 本身不需要。

**Step 2: 验证**

访问 /settings，顶部应与主应用一致（"// AI PM" logo + API 状态 + Settings 图标）。点击 logo 回首页。

**Step 3: Commit**

```bash
git add web/app/settings/layout.tsx
git commit -m "fix: Settings 页面改用统一 TopBar，与主导航保持一致"
```

---

### Task 5: 需求收集页精简

**问题：**
1. 需求页显示只读"项目名称"字段（侧边栏已有，冗余）
2. 新建项目弹窗有"需求描述"，需求收集页也有，用户困惑填两次
3. "开始分析"按钮在视口外，用户可能不知道要滚动

**Files:**
- Modify: `web/app/project/[id]/requirement/page.tsx`
- Modify: `web/components/new-project-dialog.tsx`

**Step 1: 移除需求页只读项目名称字段**

在 `web/app/project/[id]/requirement/page.tsx` 中，删除以下代码块（约 181-188 行）：

```tsx
{/* Project name — readonly */}
<div className="mt-8 mb-6">
  <label className="mb-2 block text-sm font-medium text-[var(--dark)]">
    项目名称
  </label>
  <div className="flex h-10 items-center border border-[var(--border)] bg-[var(--secondary)] px-3">
    <span className="text-sm text-[var(--dark)]">{project.name}</span>
  </div>
</div>
```

将删除后的第一个内容区块（需求描述编辑器）上移，加上 `mt-8`。

**Step 2: 预填需求描述（如果来自 new project dialog）**

在 load() 函数中，草稿文件不存在时，若 `projectData.description` 非空则用它初始化编辑器：

```tsx
// Try to load existing draft
const draftRes = await fetch(
  `/api/projects/${projectId}/files/${DRAFT_FILE}`
)
if (draftRes.ok) {
  const draftText = await draftRes.text()
  if (!cancelled && draftText) {
    setInitialContent(draftText)
    setContent(draftText)
  }
} else if (projectData.description) {
  // 用 new project dialog 里填的描述预填
  setInitialContent(projectData.description)
  setContent(projectData.description)
}
```

**Step 3: 移除 NewProjectDialog 中的需求描述字段**

在 `web/components/new-project-dialog.tsx` 中：

① 删除 `description` state 和相关 `setDescription("")` 重置：
```tsx
// 删除：const [description, setDescription] = useState("")
```

② 删除整个 `{/* Description */}` div 块（约 134-152 行）

③ fetch body 中保留 `description: ""` 或直接传空字符串（API 接受可选 description）：
```tsx
body: JSON.stringify({ name: trimmedName }),
```

**Step 4: "开始分析"按钮改为 sticky**

在 `web/app/project/[id]/requirement/page.tsx` 中：

① 将最外层 wrapper div 改为相对定位：
```tsx
<div className="relative mx-auto w-full max-w-[720px] pb-20">
```

② 将底部 submit 区域改为 sticky：
```tsx
{/* Submit — sticky bottom */}
<div className="sticky bottom-0 -mx-8 border-t border-[var(--border)] bg-[var(--background)] px-8 py-4">
  <div className="flex items-center justify-between">
    <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
      {!canSubmit ? "请填写需求描述后继续" : ""}
    </span>
    <div className="flex items-center gap-3">
      {saveHint && (
        <span
          className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]"
          style={{ animation: "fadeInUp 0.2s ease-out" }}
        >
          {saveHint}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={saveDraft}
        disabled={saving || !canSubmit}
        title={!canSubmit ? "请先填写需求描述" : undefined}
      >
        {saving ? "保存中..." : "暂存草稿"}
      </Button>
      <Button
        variant="primary"
        onClick={handleStart}
        disabled={!canSubmit || advancing}
      >
        {advancing ? "正在启动分析..." : "开始分析 →"}
      </Button>
    </div>
  </div>
</div>
```

同时删除原来页面中间的 header 按钮区（原来在 mb-8 那一行），以及原来底部的单独 submit div。

**Step 5: 验证**

- 新建项目弹窗只有项目名称字段
- 创建项目后跳转需求页，编辑器为空（无预填）
- 如果新建时填了描述（需要临时加回去测试），则编辑器会预填
- 需求页不再显示只读项目名称字段
- "开始分析"和"暂存草稿"按钮始终固定在页面底部

**Step 6: Commit**

```bash
git add web/app/project/[id]/requirement/page.tsx web/components/new-project-dialog.tsx
git commit -m "fix: 需求页移除冗余字段，描述预填，主操作按钮改为 sticky"
```

---

### Task 6: Button 组件补充 destructive variant（如未有）

**Files:**
- Modify: `web/components/ui/button.tsx`（仅在没有 destructive variant 时执行）

**Step 1: 检查**

```bash
grep -n "destructive" web/components/ui/button.tsx
```

**Step 2: 如无 destructive variant，添加**

在 buttonVariants 的 variants.variant 里添加：
```ts
destructive: "bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90",
```

**Step 3: Commit（如有改动）**

```bash
git add web/components/ui/button.tsx
git commit -m "fix: Button 新增 destructive variant"
```

---

## 验收清单

运行完所有 Task 后，逐项人工验证：

- [ ] 左下角无 "N" 悬浮按钮
- [ ] 点击 "// AI PM" 跳转首页
- [ ] TopBar 右侧显示 API 状态（绿/黄，有意义）
- [ ] Settings 页面顶部与主应用一致
- [ ] 删除项目弹出自定义弹窗（终末地风格）
- [ ] 自定义弹窗支持 Escape 关闭 + 点击遮罩关闭
- [ ] 新建项目弹窗只有项目名称字段
- [ ] 需求收集页不显示只读项目名称
- [ ] "开始分析"按钮固定在底部，内容多时仍可见
- [ ] "暂存草稿"禁用时有 tooltip 提示原因
