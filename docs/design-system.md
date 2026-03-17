# AI PM 客户端设计规范

> 本文件是客户端（Tauri App）的唯一设计规范来源。所有新页面、新组件开发必须遵循此规范。
> 教程中心（`AI_PM_教程中心.html`）使用独立规范，不受本文件约束。

---

## 一、设计原则

参考 Apple Music、Notion 的气质：**高级感来自减法，不来自装饰。**

- 视觉克制：用字重区分层级，不用颜色堆砌
- 微交互精细：每个可点击元素都有有意义的反馈
- 系统字体优先：只在代码/文件名场景使用等宽字体
- 单一 Accent：全局只有琥珀金一个强调色

---

## 二、色彩体系

所有颜色通过 CSS 变量使用，禁止在组件中硬编码色值。

### 背景层级

| 变量 | 值 | 用途 |
|------|----|------|
| `--background` | `#FAFAFA` | 主背景（暖白） |
| `--card` / `var(--card)` | `#FFFFFF` | 内容区、卡片 |
| `--sidebar` | `rgba(240,240,240,0.85)` | 侧边栏（毛玻璃底色） |
| `--secondary` | `#F2F2F2` | 次要背景、输入框填充 |

### 文字层级

| 变量 | 值 | 用途 |
|------|----|------|
| `--text-primary` / `--dark` | `#1A1A1A` | 主标题、正文 |
| `--text-secondary` / `--text-muted` | `#6E6E73` | 次要说明、占位文字 |
| `--text-tertiary` | `#AEAEB2` | 禁用状态、辅助标签 |

### Accent & 功能色

| 变量 | 值 | 用途 |
|------|----|------|
| `--accent-color` / `--yellow` | `#F0A500` | 主操作、当前态、高亮 |
| `--accent-light` / `--yellow-bg` | `rgba(240,165,0,0.12)` | Accent 浅色背景 |
| `--success` / `--green` | `#2D9E6B` | 完成态、成功状态 |
| `--success-light` | `rgba(45,158,107,0.12)` | 成功浅色背景 |
| `--destructive` | `#E5484D` | 错误、删除操作 |

### 交互状态

| 变量 | 值 | 用途 |
|------|----|------|
| `--hover-bg` | `rgba(0,0,0,0.04)` | 元素 hover 背景 |
| `--active-bg` | `rgba(0,0,0,0.07)` | 元素 active/selected 背景 |
| `--border` | `rgba(0,0,0,0.08)` | 分割线、描边 |

---

## 三、字体体系

### 字体栈

```css
/* UI 文字（绝大多数场景） */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
/* 通过 Tailwind 类使用：font-sans 或直接不写（默认） */

/* 代码、文件名、终端输出 */
font-family: 'GeistMono', 'JetBrains Mono', Menlo, monospace;
/* 通过 Tailwind 类使用：font-mono */
```

### 字号层级

| 场景 | 大小 | 字重 | 颜色 |
|------|------|------|------|
| 页面/卡片标题 | 16px | 600 | `--text-primary` |
| 区块标题、阶段名 | 14px | 500 | `--text-primary` |
| 正文、说明文字 | 14px | 400 | `--text-primary` |
| 辅助说明 | 13px | 400 | `--text-secondary` |
| 标签、Badge | 12px | 500 | — |
| 极小辅助标签 | 11px | 500 | `--text-tertiary` |

### 禁止事项

- ❌ 不在 UI 元素上使用 `font-mono` / `font-terminal`
- ❌ 不在导航、按钮、标签上使用 `uppercase tracking-[2px]` 等终末地风格
- ✅ `font-mono` 仅限：代码块、文件路径、流式输出内容、终端命令

---

## 四、圆角规范

全局 `--radius: 0.5rem`（8px），通过 Tailwind 的 `rounded-*` 系列使用：

| 场景 | 类名 | 大小 |
|------|------|------|
| 按钮、输入框 | `rounded-lg` | 8px |
| 卡片、面板 | `rounded-xl` | 12px |
| 图标容器、小徽章 | `rounded-md` | 6px |
| Pill Badge | `rounded-full` | 完整圆角 |
| 侧边栏导航项 | `rounded-md` | 6px |

---

## 五、组件规范

### Button

```
variant="primary"  → 琥珀金背景，白色文字，hover: brightness-105
variant="ghost"    → 透明背景，hover: --hover-bg，border: --accent-color/40
variant="outline"  → 同 ghost
variant="secondary"→ --secondary 背景
variant="destructive" → 红色背景
```

**微交互（必须）：**
- `active:scale-[0.97]` — 按压下沉感
- `hover: brightness-105` — 轻微提亮（primary）
- 过渡：`duration-[200ms] ease-[cubic-bezier(0.4,0,0.2,1)]`

### Badge

- 样式：`rounded-full`，软背景色，sans-serif，12px
- `variant="default"` → amber 浅色系
- `variant="outline"` → 描边，secondary 文字
- `variant="success"` → green 浅色系
- ❌ 禁止使用 `uppercase tracking-[*]`

### ProgressBar

- 高度：`h-0.5`（2px 细线）
- 颜色：`--accent-color`（纯色，不用渐变）
- 外轨：`--border` 浅色
- 圆角：`rounded-full`

### 侧边栏导航项

```
pending  → 空心圆 border-[--text-tertiary]，文字 --text-tertiary
current  → 实心圆 --accent-color + 左侧 3px accent 竖线 + bg-[--active-bg]
completed → 绿色勾（Check icon）+ bg-[--success-light]，文字 --text-secondary
```

---

## 六、微交互规范

微交互是 Apple 产品质感的核心，**所有可交互元素必须有反馈**。

### 过渡参数

```css
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1)   /* 200ms，大多数 UI 变化 */
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1)      /* 进入动画 */
--ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1) /* 按钮回弹、完成态 */
--dur-fast:  100ms   /* 按压反馈 */
--dur-base:  200ms   /* 标准过渡 */
--dur-slow:  300ms   /* 内容进入、进度条 */
--dur-page:  250ms   /* 页面/阶段切换 */
```

### 必须实现的微交互

| 元素 | 交互 | 实现方式 |
|------|------|---------|
| 所有 Button | 按压 `scale(0.97)` | `active:scale-[0.97] active:duration-[100ms]` |
| 侧边栏导航项 | hover 背景过渡 | `hover:bg-[--hover-bg] transition-colors duration-[200ms]` |
| 侧边栏当前项 | 左侧 accent 竖线 animate in | `animation: slideInLeft 200ms` |
| 新建项目按钮 | Plus 图标 hover 旋转 90° | `group-hover:rotate-90 transition-transform` |
| 页面/阶段切换 | fade + 上移 8px | `animate-[fadeInUp_250ms_var(--ease-decelerate)]` |
| 空状态出现 | fade + 上移 | `animate-[fadeInUp_300ms_var(--ease-decelerate)]` |
| 阶段完成 ✓ | 勾号绿色出现 | Check icon + `--success-light` 背景 |

---

## 七、布局规范

### 整体框架

```
TitleBar (h-11, 44px)
├── 侧边栏 (220px, 毛玻璃)
└── 主内容区 (flex-1, overflow-y-auto, p-8)
    └── 内容容器 (max-w-[720px] mx-auto)
```

### 侧边栏结构

```
App Logo（顶部，可点击回首页）
──────────────
项目阶段列表（进入项目时）
或 项目列表（Dashboard 时）
──────────────
工具区（常驻）
──────────────
新建项目 + 设置（底部）
```

### TitleBar

- 高度：`h-11`（44px）
- 背景：`rgba(250,250,250,0.9) backdrop-blur-sm`
- 中心：品牌名，`font-semibold text-sm`
- 左侧：macOS 红绿灯留白 72px
- 右侧：API 状态指示点（可点击跳转设置）

---

## 八、毛玻璃效果

跨平台实现（不依赖 OS 原生 vibrancy）：

```css
background: rgba(240, 240, 240, 0.85);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
```

Tailwind 写法：`bg-[rgba(240,240,240,0.85)] backdrop-blur-xl`

适用于：侧边栏、TitleBar、浮层、Dialog 背景。

---

## 九、两套规范说明

| 场景 | 规范 |
|------|------|
| 客户端（Tauri App） | 本文件（Apple HIG 风格） |
| 教程中心 HTML | 独立规范，Apple HIG 仪表盘风格，不受本文件约束 |
| AI 生成的 HTML 原型 | 用户选择（公司规范 / AI 情境定制 / 主流组件库） |
