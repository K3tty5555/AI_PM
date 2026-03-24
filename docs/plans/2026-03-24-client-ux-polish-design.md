# 客户端 UX 精打磨设计（经审视修订）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 深度打磨客户端阶段页面的交互体验，修复 8 个已识别的 UX 痛点（原 9 个，H 被审视否决）。

**Architecture:** 纯前端改动为主，不涉及后端新命令。原型预览需要 iframe postMessage 通信。

---

## G. 原型预览增强（P0）

### G1. iframe 高度自适应

**双方案策略**：优先尝试 `contentDocument`（同源），失败后降级到 `postMessage`。

**方案 A（同源生效时）**：
```typescript
useEffect(() => {
  const iframe = iframeRef.current
  if (!iframe) return
  let ro: ResizeObserver | null = null

  const handleLoad = () => {
    try {
      const body = iframe.contentDocument?.body
      if (!body) throw new Error("cross-origin")
      setIframeHeight(Math.max(400, document.documentElement.scrollHeight))
      ro = new ResizeObserver(() => {
        setIframeHeight(Math.max(400, body.scrollHeight))
      })
      ro.observe(body)
    } catch {
      // 方案 B：postMessage fallback
      // blob HTML 中已注入 resize 脚本（见下方）
    }
  }
  iframe.addEventListener("load", handleLoad)
  return () => {
    iframe.removeEventListener("load", handleLoad)
    ro?.disconnect()
  }
}, [blobUrl])
```

**方案 B（postMessage fallback）**：
在创建 Blob URL 时，往 HTML 末尾注入一段脚本：
```javascript
<script>
(function(){
  var ro = new ResizeObserver(function(){
    parent.postMessage({type:'aipm-resize',height:document.documentElement.scrollHeight},'*');
  });
  ro.observe(document.body);
  parent.postMessage({type:'aipm-resize',height:document.documentElement.scrollHeight},'*');
})();
</script>
```

父窗口监听：
```typescript
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === "aipm-resize" && typeof e.data.height === "number") {
      setIframeHeight(Math.max(400, Math.min(e.data.height, window.innerHeight * 3)))
    }
  }
  window.addEventListener("message", handler)
  return () => window.removeEventListener("message", handler)
}, [])
```

高度上限 `window.innerHeight * 3`，防止极端内容撑爆布局。

### G2. 设备宽度选择（下拉面板）

**审视修订**：不平铺 5 档，改为下拉面板。

工具栏默认显示：`[当前宽度 ▾]  |  [⛶ 全屏]`

点击下拉展开面板：
```
┌──────────────────┐
│  iPhone    375px │
│  iPad      768px │
│  Laptop   1024px │
│  Desktop  1440px │
│  ─────────────── │
│  自定义  [____]px│
└──────────────────┘
```

自定义输入：`type="number" min=280 max=2560`，`onBlur` 自动 clamp，`300ms debounce`。

状态模型：
```typescript
const [deviceWidth, setDeviceWidth] = useState<number>(0) // 0 = 全屏/自适应
```

### G3. 全屏预览

```tsx
{isFullscreen && (
  <div className="fixed inset-0 z-40 bg-white dark:bg-[var(--background)] animate-[fadeIn_150ms]">
    <div className="absolute top-4 right-4 z-10">
      <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)}>
        退出全屏 (Esc)
      </Button>
    </div>
    <iframe src={blobUrl} className="w-full h-full border-none" title="原型预览" />
  </div>
)}
```

- z-index: 40（低于 Dialog z-100 和 toast z-50）
- Esc 退出需 `e.stopPropagation()` 防止被其他组件消费
- 进入/退出用 `fadeIn 150ms` 动画

**Files:** `app/src/pages/project/Prototype.tsx`

---

## A. 复盘/埋点可编辑（P1）

给 PrdViewer 传 `editable={!isStreaming && !!displayContent}` + `onEdit` 回调。

**注意**：PrdViewer 的 editable 模式只覆盖 `<p>` 段落。标题/列表/表格不可编辑。这是预期行为，不需要额外处理——用户要改非段落内容可以重新生成。

编辑后不自动保存，在底部操作栏新增「保存修改」按钮（仅内容有变更时激活），toast 反馈。

**Files:** `app/src/pages/project/Retrospective.tsx`, `app/src/pages/project/Analytics.tsx`

---

## B. 弹窗改非强制（P1）

**审视修订**：不放底部操作栏（空间不够），改为完成后的 banner 内按钮。

评审/复盘完成后：
1. 不自动弹知识对话框
2. 在内容区顶部显示成功 banner：
```tsx
{completed && (
  <div className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
    <span className="size-1.5 rounded-full bg-[var(--success)]" />
    <span className="flex-1 text-[13px] text-[var(--text-secondary)]">评审已完成</span>
    <Button variant="ghost" size="sm" onClick={() => setShowKnowledgeModal(true)}>
      沉淀知识到知识库
    </Button>
  </div>
)}
```

3. 首次完成时用 toast info 提示功能存在（`localStorage` 记住不重复）

**Files:** `app/src/pages/project/Review.tsx`, `app/src/pages/project/Retrospective.tsx`

---

## D. PRD 编辑发现性（P1）

**审视修订**：不在每段加 hover 提示（视觉噪声），改为顶部一次性提示条。

现有 hover 底色 + accent 边框已经足够，只需要让用户知道这个功能存在：

```tsx
{editable && !localStorage.getItem("prd-edit-onboarded") && (
  <div className="mb-3 text-[11px] text-[var(--text-tertiary)] flex items-center gap-2">
    <span>双击段落可编辑 · Cmd+Enter 保存 · Esc 取消</span>
    <button onClick={() => localStorage.setItem("prd-edit-onboarded", "1")} className="hover:text-[var(--text-secondary)]">×</button>
  </div>
)}
```

首次成功编辑后也自动隐藏。

**Files:** `app/src/components/prd-viewer.tsx`

---

## E. PRD AI 修改加确认（P1）

**审视修订**：不做并排预览，改为 inline diff 模式。

1. AI assist 完成后结果存到 `pendingAssistText`，不直接替换
2. 内容区顶部显示警示横幅 + 应用/放弃按钮
3. 预览待确认期间禁用 assist 输入框

```tsx
{pendingAssistText && (
  <div className="mb-4 rounded-lg border-l-[3px] border-l-[var(--accent-color)] bg-[var(--accent-light)] px-4 py-3">
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-[var(--text-primary)]">AI 已生成修改建议</span>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={applyAssist}>应用修改</Button>
        <Button variant="ghost" size="sm" onClick={() => setPendingAssistText(null)}>放弃</Button>
      </div>
    </div>
  </div>
)}
```

正文中用 PrdViewer 渲染 `pendingAssistText`（预览版本），用户可以对比再决定。

**优先级规则**：手动编辑 > AI 修改建议。AI 请求基于手动编辑后的版本发送。

**Files:** `app/src/pages/project/Prd.tsx`

---

## F. 评审角色解析容错（P1）

**审视修订**：分级策略，不全改正则。

```typescript
function parseReviewSections(text: string): Record<RoleKey, string> | null {
  // Step 1: 精确匹配（现有逻辑）
  const exact = tryExactMatch(text)
  if (exact && Object.keys(exact).length >= 3) return exact

  // Step 2: 正则模糊匹配（锚定 ## 行首）
  const fuzzy = tryFuzzyMatch(text)
  if (fuzzy && Object.keys(fuzzy).length >= 3) return fuzzy

  // Step 3: 降级 → 返回 null，页面回退到纯 Markdown 渲染
  return null
}
```

降级时 toast 提示："评审报告格式与预期不同，已切换全文视图"

**Files:** `app/src/pages/project/Review.tsx`

---

## ~~H. Stories 验收条件~~ → **已取消**

审视结论：现有卡片内折叠编辑已经可用，改 Dialog 是交互回退。保留现有方式。

---

## I. 竞品 URL 抓取状态（P1）

`string[]` → `UrlEntry[]`：

```typescript
interface UrlEntry {
  url: string
  status: "idle" | "loading" | "success" | "error"
  error?: string
}
```

用 `useReducer` 管理状态（ADD_URL / START_FETCH / FETCH_SUCCESS / FETCH_ERROR / REMOVE / RETRY）。

每个 URL pill 独立状态图标：
- `Loader2` 旋转 = 加载中
- `CheckCircle2` 绿色 = 成功
- `XCircle` 红色 = 失败（hover tooltip 显示原因，点击重试）

抓取进行中不禁用添加（新 URL 标记 `idle`，下次生成时一并抓取）。

**Files:** `app/src/pages/project/Research.tsx`

---

## 实施优先级

```
P0（先做）
  └─ G. 原型预览增强（高度自适应 + 下拉面板宽度 + 全屏）

P1（随后）
  ├─ A. 复盘/埋点可编辑
  ├─ B. 弹窗改非强制（banner 按钮）
  ├─ D. PRD 编辑发现性（顶部提示条）
  ├─ E. PRD 修改加确认（inline diff）
  ├─ F. 评审解析容错（分级匹配）
  └─ I. URL 抓取状态透明化

P2（下一轮）
  └─ C. 部分重做能力
```

## 已取消
- H. Stories 验收条件改 Dialog → 保留现有卡片内编辑
