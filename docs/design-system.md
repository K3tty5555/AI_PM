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
| `--destructive` | `#DC2626` | 错误、删除 |
| `--border` | `rgba(0,0,0,0.08)` | 分割线、描边 |
| `--hover-bg` | `rgba(0,0,0,0.04)` | hover 背景 |
| `--active-bg` | `rgba(0,0,0,0.07)` | active/selected 背景 |

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

## 八、两套规范说明

| 场景 | 规范 |
|------|------|
| 客户端（Tauri App） | 本文件 |
| 教程中心 HTML | 独立规范，不受本文件约束 |
| AI 生成的 HTML 原型 | 用户三档选择（公司规范 / AI 情境定制 / 组件库） |
