# AI PM 客户端设计规范

> 本文件是客户端（Tauri App）的唯一设计规范来源。所有新页面、新组件开发必须遵循此规范。
> 教程中心（`AI_PM_教程中心.html`）使用独立规范，不受本文件约束。

---

## 一、设计原则

参考包豪斯主义 + Apple HIG：**理性、克制、功能即美学。**

- 单一 Accent：全局只有钴蓝一个强调色
- 高对比文字：主文字接近纯黑，清晰优先
- 微交互精细：每个可交互元素都有有意义的反馈
- GeistSans 优先：UI 文字用 GeistSans，长文阅读区（Markdown/流式输出）用 Lora，等宽字体仅限代码/终端输出场景
- 禁止装饰性设计：`uppercase tracking-[2px]`、`font-terminal` 不用于 UI 元素

---

## 二、色彩体系

所有颜色通过 CSS 变量使用，禁止硬编码色值。

### Accent 色阶（钴蓝）

| 变量 | 值 | 用途 |
|------|----|------|
| `--accent-color` | `#1D4ED8` | 主操作、当前态、高亮 |
| `--accent-hover` | `#1E40AF` | 按钮 hover、加深态 |
| `--accent-light` | `rgba(29,78,216,0.08)` | Badge 背景、选中底色 |
| `--accent-ring` | `rgba(29,78,216,0.25)` | focus-visible ring |

### 背景层级

| 变量 | 值 | 用途 |
|------|----|------|
| `--background` | `#F8FAFF` | 主背景（钴蓝调白） |
| `--bg-sidebar` | `rgba(234,241,252,0.90)` | 侧边栏毛玻璃底色 |
| `--secondary` | `#EEF2FB` | 次要背景、输入框填充 |
| `--card` | `#FFFFFF` | 卡片（纯白，在蓝调底上自然浮起） |

### 文字层级

| 变量 | 值 | 用途 |
|------|----|------|
| `--text-primary` / `--dark` | `#0F172A` | 主标题、正文 |
| `--text-secondary` / `--text-muted` | `#64748B` | 次要说明 |
| `--text-tertiary` | `#94A3B8` | 禁用、辅助标签 |

### 功能色

| 变量 | 值 | 用途 |
|------|----|------|
| `--success` / `--green` | `#16A34A` | 完成态、成功 |
| `--success-light` | `rgba(22,163,74,0.08)` | 成功浅色背景 |
| `--warning` | `#F59E0B` | 警告态 |
| `--destructive` | `#DC2626` | 错误、删除 |
| `--border` | `rgba(0,0,0,0.08)` | 分割线、描边 |
| `--hover-bg` | `rgba(0,0,0,0.04)` | hover 背景 |
| `--active-bg` | `rgba(0,0,0,0.07)` | active/selected 背景 |

### Tooltip 色

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--tooltip-bg` | `#1E293B` | `#E2E8F0` | Tooltip 背景 |
| `--tooltip-fg` | `#FFFFFF` | `#1E293B` | Tooltip 文字 |
| `--tooltip-kbd` | `rgba(255,255,255,0.5)` | `rgba(0,0,0,0.35)` | 快捷键文字 |

### 阴影层级

4 级阴影 token，通过 CSS 变量使用，禁止硬编码 `box-shadow`。

| 变量 | Light 值 | Dark 值 | 用途 |
|------|----------|---------|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 3px rgba(0,0,0,0.2)` | 卡片默认、轻量浮层 |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 16px rgba(0,0,0,0.25)` | 卡片 hover、下拉面板 |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | `0 8px 32px rgba(0,0,0,0.35)` | Toast、Tooltip、Context Menu |
| `--shadow-xl` | `0 16px 48px rgba(0,0,0,0.16)` | `0 20px 60px rgba(0,0,0,0.45)` | Dialog、Command Palette |

---

## 三、字体体系

### 字体栈

```
UI 文字：   GeistSans → -apple-system → BlinkMacSystemFont → "Segoe UI" → "PingFang SC"
长文阅读区：Lora → Georgia → serif
代码/终端： GeistMono → 'JetBrains Mono' → Menlo → monospace
```

Tailwind 使用：`font-sans`（UI 默认）、`font-serif`（Markdown/流式输出区）、`font-mono`（仅代码场景）

### 字号层级

| 场景 | 大小 | 字重 | 颜色 |
|------|------|------|------|
| 页面/卡片标题 | 18px | 600 | `--text-primary` |
| 区块标题、阶段名 | 15px | 500 | `--text-primary` |
| 正文、说明文字 | 14px | 400 | `--text-primary` |
| 辅助说明 | 13px | 400 | `--text-secondary` |
| 标签、Badge | 12px | 500 | — |
| 极小辅助标签 | 11px | 500 | `--text-tertiary` |

### 行高

- 正文内容：`leading-[1.7]`
- UI 标签：默认（`leading-normal`）

### 禁止事项

- ❌ `font-mono` / `font-terminal` 用于 UI 元素
- ❌ `uppercase tracking-[2px]` 等终末地风格用于导航、按钮、标签

---

## 四、圆角规范

全局 `--radius: 0.5rem`（8px）

| 场景 | 类名 | 大小 |
|------|------|------|
| 按钮、输入框 | `rounded-lg` | 8px |
| 卡片、面板、Dialog | `rounded-xl` | 12px |
| 图标容器 | `rounded-md` | 6px |
| Pill Badge | `rounded-full` | 完整圆角 |
| 侧边栏导航项 | `rounded-md` | 6px |
| 代码块 | `rounded-lg` | 8px |

---

## 五、组件规范

### Button

| variant | 样式 |
|---------|------|
| `primary` | `#1D4ED8` 背景，白字，hover: `#1E40AF` |
| `ghost` | 透明背景，`--text-primary` 文字，hover: `--hover-bg` + 蓝色描边 |
| `outline` | 同 ghost |
| `secondary` | `--secondary` 背景 |
| `destructive` | `#DC2626` 背景，白字 |

微交互：`active:scale-[0.97]` 按压，200ms 标准过渡

### Badge

- `rounded-full`，sans-serif，12px，无 uppercase/tracking
- `default` → `--accent-light` 底 + `--accent-color` 文字
- `outline` → 描边 + `--text-secondary`
- `success` → `--success-light` 底 + `--success` 文字

### ProgressBar

- 高度：`h-0.5`（2px）
- 颜色：`--accent-color`，`rounded-full`
- 外轨：`--border`

### 表单输入框

```
高度：36px，rounded-lg
边框：1px rgba(0,0,0,0.12)，bg #FFFFFF
Focus：border → #1D4ED8，ring rgba(29,78,216,0.15) 2px
Placeholder：#94A3B8，文字：14px --text-primary
Error：border #DC2626，ring rgba(220,38,38,0.15)
过渡：border-color 200ms
```

### 侧边栏导航项状态

| 状态 | 样式 |
|------|------|
| `pending` | 空心圆 `--text-tertiary`，文字 `--text-tertiary` |
| `current` | 实心圆 `--accent-color` + 左侧 3px 蓝色竖线 + `--active-bg` 背景 |
| `completed` | 绿色 Check icon + `--success-light` 背景，文字 `--text-secondary` |

### Dialog / 弹窗

```
遮罩：rgba(0,0,0,0.3) + backdrop-blur(4px)
本体：#FFFFFF，rounded-xl，shadow-xl
标题：18px 600 --text-primary
内容：14px --text-secondary
按钮区：右对齐，primary + ghost
动画：scale(0.95→1) + fade，200ms ease-decelerate
```

### InlineChat

```
容器：rounded-xl，border rgba(0,0,0,0.08)，bg #FFFFFF
问题文字：14px 500 --text-primary
选项：rounded-lg，hover bg rgba(29,78,216,0.06)，active border --accent-color
```

### Markdown / 流式输出区

```
字体：Lora（font-serif），15px，行高 1.8
H1：22px 700，H2：19px 600，H3：16px 500（均继承 Lora）
代码块：--secondary 背景，rounded-lg，GeistMono 13px，font-mono
分割线：rgba(0,0,0,0.08)
链接：--accent-color，hover underline
```

### Toast 通知

4 种语义变体的非阻断通知。固定右上角 (top: 56px, right: 24px)，最多同时显示 3 条。

**文件**：`components/ui/toast.tsx` + `hooks/use-toast.ts`

**Props（useToast hook）**：

| 方法 | 参数 | 说明 |
|------|------|------|
| `toast(message, variant?, duration?)` | `message: string`, `variant: 'success'\|'error'\|'info'\|'warning'`, `duration: number (default 3000)` | 显示通知 |
| `dismiss(id)` | `id: string` | 手动关闭 |

**变体**：

| variant | 左色条 | 图标 | 图标色 |
|---------|--------|------|--------|
| `success` | `var(--success)` | CheckCircle2 | `var(--success)` |
| `error` | `var(--destructive)` | XCircle | `var(--destructive)` |
| `info` | `var(--accent-color)` | Info | `var(--accent-color)` |
| `warning` | `var(--warning)` | AlertTriangle | `var(--warning)` |

**样式**：

```
容器：min-w-[320px] max-w-[420px]，rounded-lg
背景：var(--card)，border var(--border)，shadow var(--shadow-lg)
左色条：3px 宽，从 top 到 bottom
文字：14px var(--text-primary)
关闭按钮：var(--text-secondary)，hover var(--text-primary) + var(--hover-bg)
进入动画：slideInRight 300ms
退出动画：fadeOut 300ms
```

**用法**：

```tsx
import { useToast } from "@/hooks/use-toast"

const { toast } = useToast()
toast("保存成功", "success")
toast("操作失败", "error", 5000)
```

### Tooltip

基于 @base-ui/react 的定位提示，支持快捷键 badge。

**文件**：`components/ui/tooltip.tsx`

**Props**：

| prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `content` | `string` | — | 提示文字 |
| `shortcut` | `string?` | — | 快捷键（显示为 `<kbd>`） |
| `side` | `'top'\|'bottom'\|'left'\|'right'` | `'bottom'` | 弹出方向 |
| `delay` | `number` | `300` | hover 延迟（ms） |
| `children` | `ReactElement` | — | 触发元素 |

**样式**：

```
背景：var(--tooltip-bg)，rounded-md，shadow var(--shadow-lg)
文字：12px font-medium var(--tooltip-fg)
快捷键：11px var(--tooltip-kbd)
箭头：SVG，填充 var(--tooltip-bg)
进入/退出：scale(0.96→1) + fade，150ms var(--ease-standard)
z-index：70
```

**用法**：

```tsx
import { Tooltip } from "@/components/ui/tooltip"

<Tooltip content="后退" shortcut="⌘[" side="bottom">
  <button>...</button>
</Tooltip>
```

### Skeleton 骨架屏

加载态占位组件。基础 `Skeleton` + 3 个预设变体。

**文件**：`components/ui/skeleton.tsx`

**组件列表**：

| 组件 | Props | 说明 |
|------|-------|------|
| `Skeleton` | `className?: string` | 基础矩形占位（h-4, rounded-md） |
| `SkeletonText` | `lines?: number (default 3)` | 多行文本骨架，最后一行 60% 宽 |
| `SkeletonCard` | — | 卡片骨架（标题 + 2 行文字 + 按钮） |
| `SkeletonList` | `count?: number (default 5)` | 列表骨架（圆形头像 + 文字行） |

**样式**：

```
底色：var(--secondary)
渐变：linear-gradient(90deg, transparent → var(--background) → transparent)
动画：shimmer 1.5s infinite（背景从左到右扫过）
圆角：rounded-md（6px）
```

### Context Menu 右键菜单

基于 @base-ui/react 的上下文菜单。

**文件**：`components/ui/context-menu.tsx`

**Props**：

| prop | 类型 | 说明 |
|------|------|------|
| `items` | `ContextMenuItem[]` | 菜单项列表 |
| `children` | `ReactNode` | 右键触发区域 |

**ContextMenuItem**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `label` | `string` | 菜单项文字 |
| `icon` | `React.ElementType?` | lucide-react 图标 |
| `shortcut` | `string?` | 右侧快捷键提示 |
| `action` | `() => void` | 点击回调 |
| `variant` | `'default'\|'destructive'?` | destructive 时 hover 变红 |
| `separator` | `boolean?` | 此项之后显示分隔线 |
| `hidden` | `boolean?` | 条件隐藏 |

**样式**：

```
容器：min-w-[180px]，rounded-lg，border var(--border)，bg var(--card)，shadow var(--shadow-lg)
菜单项：rounded-md，13px，px-3 py-1.5
hover 态：bg var(--hover-bg)
destructive hover：文字变 var(--destructive)
图标：size-4，var(--text-tertiary)（destructive 时继承文字色）
快捷键：11px var(--text-tertiary)，右对齐
分隔线：1px var(--border)，mx-2 my-1
进入/退出：scale(0.95→1) + fade，150ms ease-out
z-index：80
```

**用法**：

```tsx
import { ContextMenu } from "@/components/ui/context-menu"

<ContextMenu items={[
  { label: "打开", icon: FolderOpen, action: () => navigate(path) },
  { label: "重命名", icon: Pencil, action: startRename, separator: true },
  { label: "删除", icon: Trash2, action: handleDelete, variant: "destructive" },
]}>
  <div>右键触发区域</div>
</ContextMenu>
```

### Command Palette 命令面板

全局快捷搜索面板 (⌘K)，支持模糊搜索命令、项目和知识库。

**文件**：`components/command-palette.tsx`

**Props**：

| prop | 类型 | 说明 |
|------|------|------|
| `open` | `boolean` | 是否显示 |
| `onClose` | `() => void` | 关闭回调 |
| `onToggleSidebar` | `() => void` | 切换侧边栏（供内部命令使用） |
| `onCycleTheme` | `() => void` | 切换主题（供内部命令使用） |

**功能**：

- 模糊搜索：subsequence 匹配 + substring 优先，命中字符高亮为 `var(--accent-color)`
- 命令分组：导航 / 操作 / 视图 / 项目 / 工具 / 知识库
- 键盘导航：↑↓ 移动、Enter 执行、Esc 关闭
- 知识库搜索：输入 2+ 字符后 200ms 防抖搜索
- 加载指示器：搜索时右侧显示 spinner

**样式**：

```
遮罩：bg-black/30 + backdrop-blur(4px)，fadeIn 150ms
面板：w-[560px]，mt-[20vh]，rounded-xl，border var(--border)，bg var(--card)，shadow var(--shadow-xl)
进入动画：commandPaletteIn 200ms var(--ease-decelerate)（scale 0.98→1 + fade）
搜索框：16px var(--text-primary)，icon 18px var(--text-tertiary)
分隔线：1px var(--border)
结果列表：max-h-[400px]，overflow-y-auto
分组标题：11px font-medium var(--text-tertiary)
结果项：px-4 py-2，hover bg var(--hover-bg)
快捷键 badge：rounded-md，border var(--border)，bg var(--background)，11px var(--text-tertiary)
页脚：11px var(--text-tertiary)，border-t
z-index：50
```

### Tab Bar 标签页栏

多标签页系统，支持拖拽排序和右键菜单。Dashboard 标签不可关闭。

**文件**：`components/layout/TabBar.tsx` + `hooks/use-tabs.ts`

**TabBar Props**：

| prop | 类型 | 说明 |
|------|------|------|
| `tabs` | `Tab[]` | 标签列表 |
| `activeTabId` | `string \| null` | 当前激活 ID |
| `onActivate` | `(id: string) => void` | 点击激活 |
| `onClose` | `(id: string) => void` | 关闭标签 |
| `onCloseOthers` | `(id: string) => void` | 关闭其他 |
| `onCloseRight` | `(id: string) => void` | 关闭右侧 |
| `onReorder` | `(from, to) => void` | 拖拽排序 |

**Tab 数据结构**：

```ts
interface Tab {
  id: string        // 唯一标识
  label: string     // 显示名称
  path: string      // React Router 路径
  closable: boolean // Dashboard 不可关闭
}
```

**样式**：

```
栏高：36px，sticky top-0，z-10
背景：var(--background)，border-b var(--border)
标签：max-w-[180px]，13px leading-none
激活态：bg var(--card)，text var(--text-primary)，底部 2px 蓝条 var(--accent-color)
非激活态：text var(--text-secondary)，hover bg var(--hover-bg)
拖拽 hover：ring-1 ring-inset var(--accent-color)
关闭按钮：hover 时显示（opacity 0→1），size-4 rounded-sm
溢出箭头：左右 ChevronLeft/Right，size-3.5 var(--text-tertiary)
中键点击：关闭标签
最大标签数：8（超出时替换最早非活跃标签）
```

**右键菜单**：关闭 / 关闭其他 / 关闭右侧

### Back/Forward Navigation 前进后退

浏览器风格的导航历史按钮。

**文件**：`hooks/use-navigation-history.ts`（逻辑），`layouts/AppLayout.tsx`（渲染）

**API（useNavigationHistory hook）**：

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `canGoBack` | `boolean` | 是否可后退 |
| `canGoForward` | `boolean` | 是否可前进 |
| `goBack` | `() => void` | 后退 |
| `goForward` | `() => void` | 前进 |

**样式**：

```
按钮：size-6，rounded-md，ChevronLeft / ChevronRight（size-4，strokeWidth 1.75）
默认：text var(--text-tertiary)
hover：text var(--text-primary)，bg var(--hover-bg)
禁用：opacity-30，cursor-not-allowed
过渡：transition-colors 150ms
```

**快捷键**：⌘[ 后退，⌘] 前进

---

## 六、微交互规范

### 过渡参数

```css
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1)     /* 200ms，标准 UI 过渡 */
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1)        /* 进入动画 */
--ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1) /* 弹性回弹 */
--dur-fast:  100ms   /* 按压反馈 */
--dur-base:  200ms   /* 标准过渡 */
--dur-slow:  300ms   /* 内容进入、进度条 */
--dur-page:  250ms   /* 页面切换 */
```

### 必须实现的交互

| 元素 | 行为 | 实现 |
|------|------|------|
| 所有 Button | 按压 `scale(0.97)` | `active:scale-[0.97] active:duration-[100ms]` |
| 侧边栏导航项 | hover 背景过渡 | `hover:bg-[--hover-bg] transition-colors duration-200` |
| 侧边栏当前项竖线 | slideInLeft 动画 | `animation: slideInLeft 200ms var(--ease-decelerate)` |
| 新建项目 `+` | hover 旋转 90° | `group-hover:rotate-90 transition-transform duration-150` |
| 阶段/页面切换 | fade + 上移 8px | `animate-[fadeInUp_250ms_var(--ease-decelerate)]` |
| 空状态出现 | fade + 上移 | `animate-[fadeInUp_300ms_var(--ease-decelerate)]` |
| Dialog 出现 | scale + fade | `animate-[dialogIn_200ms_var(--ease-decelerate)]` |
| AI 流式光标 | `\|` 闪烁 | 500ms blink interval |

---

## 七、布局规范

### 整体框架

```
TitleBar (h-11, 44px, 半透明毛玻璃)
└── 侧边栏 (220px, fixed, z-20, 毛玻璃)  ← fixed 定位使毛玻璃生效
└── 主内容区 (ml-[220px], flex-1, overflow-y-auto, p-8)
    └── 内容容器 (max-w-[720px] mx-auto)
```

### 毛玻璃实现（CSS，跨平台）

```css
background: rgba(234, 241, 252, 0.90);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border-right: 1px solid rgba(0,0,0,0.08);
```

侧边栏必须 `position: fixed` 才能让主内容从其后方穿过，blur 效果才可见。

### 滚动条

隐藏默认滚动条（Apple 风格），保留滚动功能：

```css
scrollbar-width: none;        /* Firefox */
-ms-overflow-style: none;     /* IE/Edge */
&::-webkit-scrollbar { display: none; }  /* Chrome/Safari */
```

---

## 八、Keyframe 动画

所有动画在 `index.css` 中定义为 `@keyframes`，组件通过 `animation` 属性或 Tailwind `animate-[...]` 引用。

| 名称 | 效果 | 用途 |
|------|------|------|
| `fadeIn` | 0→1 透明度 | 遮罩、轻量元素出现 |
| `fadeOut` | 1→0 透明度 | Toast 退出 |
| `fadeInUp` | 透明度 0→1 + Y 偏移 8px→0 | 页面/卡片/空状态进入 |
| `slideInLeft` | scaleX(0→1) | 侧边栏当前项左竖线 |
| `slideInRight` | translateX(100%→0) + fade | Toast 进入 |
| `shimmer` | 背景位置 -200%→200% | Skeleton 加载闪光 |
| `commandPaletteIn` | scale(0.98→1) + fade | Command Palette 进入 |
| `dotPulse` | scale(1→1.15→1) + 光晕 | 状态指示圆点脉冲 |
| `checkDraw` | stroke-dashoffset 20→0 | 完成勾选动画 |
| `thinkingPulse` | 透明度 1→0.3→1 | AI 思考中脉冲 |
| `progressFill` | width 0→var(--progress-value) | 进度条填充 |
| `staggerFadeIn` | fade + Y 偏移 4px | 列表逐项出现 |
| `blink` | 透明度 1→0→1 | AI 流式光标闪烁 |
| `streamPulse` | 透明度 0.35→1→0.35 | AI 流式左竖线呼吸 |

---

## 九、键盘快捷键

所有快捷键在 `hooks/use-hotkeys.ts` 中注册，在输入框/文本域中自动禁用（Escape 除外）。

### 全局快捷键

| 快捷键 | 功能 | 分组 |
|--------|------|------|
| `⌘K` | 打开/关闭命令面板 | 操作 |
| `⌘B` | 切换侧边栏 | 视图 |
| `⌘,` | 打开设置 | 导航 |
| `⌘D` | 循环切换主题（Light → Dark → System） | 视图 |
| `⌘[` | 后退 | 导航 |
| `⌘]` | 前进 | 导航 |
| `⌘W` | 关闭当前标签页 | 标签 |
| `Escape` | 关闭命令面板 | 操作 |

### 项目内快捷键（仅 `/project/:id/*` 路由下生效）

| 快捷键 | 功能 |
|--------|------|
| `⌘1` ~ `⌘9` | 跳转到阶段 1~9 |

### useHotkeys Hook

```ts
interface HotkeyDef {
  key: string          // 小写键名：'k', 'b', ',', '[', ']' 等
  meta?: boolean       // macOS ⌘ 键
  shift?: boolean
  handler: () => void
  description: string  // 命令面板中的显示名
  group?: string       // 分组名
}

useHotkeys(hotkeys: HotkeyDef[])
```

---

## 十、响应式断点

| 断点 | 条件 | 行为 |
|------|------|------|
| Compact | `max-width: 900px` | 侧边栏自动折叠，layout-focus 全宽（px-4） |
| Default | `901px ~ 1440px` | layout-focus max-w-[800px] |
| Wide | `min-width: 1441px` | layout-focus max-w-[960px]，layout-cards max-w-[1200px] |

**侧边栏响应行为**：窗口宽度 <= 900px 时自动折叠侧边栏。用户可通过 ⌘B 手动切换。

---

## 十一、暗色模式架构

### 三态切换（Light / Dark / System）

**Hook**：`hooks/use-theme.ts`

```ts
type ThemePreference = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

useTheme() → {
  preference: ThemePreference,   // 用户选择
  resolved: ResolvedTheme,       // 实际生效值
  setTheme: (pref) => void,      // 直接设置
  cycleTheme: () => void,        // 循环：light → dark → system → light
}
```

**实现机制**：

1. **CSS 变量驱动**：所有颜色定义为 CSS 变量（`:root` 为 light，`html.theme-dark` 为 dark）
2. **Class 切换**：`<html>` 元素添加 `theme-light` 或 `theme-dark` class
3. **System 跟随**：preference 为 `system` 时，监听 `prefers-color-scheme` 媒体查询变化
4. **持久化**：偏好存储在 `localStorage` key `app-theme`
5. **主题过渡**：`html` 上 `transition: background-color 200ms ease, color 200ms ease`

**禁止事项**：

- 不使用 Tailwind `dark:` variant（组件中已验证无使用）
- 不硬编码颜色值，必须通过 `var(--*)` 引用
- 暗色主题使用蓝调色而非纯灰（oklch 色彩空间 + 250 色相角）

### 暗色调色板关键差异

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | `#1D4ED8` | `#4F8EF7`（提亮，保证对比度） |
| `--background` | `#F8FAFF` | `oklch(12% 0.02 250)`（蓝调深色） |
| `--card` | `#FFFFFF` | `oklch(16% 0.025 250)` |
| `--destructive` | `#DC2626` | `#F87171`（提亮） |
| `--success` | `#16A34A` | `#4ADE80`（提亮） |
| `--border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.07)` |
| `--hover-bg` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.05)` |

---

## 十二、两套规范说明

| 场景 | 规范 |
|------|------|
| 客户端（Tauri App） | 本文件 |
| 教程中心 HTML | 独立规范，不受本文件约束 |
| AI 生成的 HTML 原型 | 用户三档选择（公司规范 / AI 情境定制 / 组件库） |
