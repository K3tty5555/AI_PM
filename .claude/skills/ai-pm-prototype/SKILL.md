---
name: ai-pm-prototype
description: 原型生成技能。基于 PRD 生成可交互的单页网页原型，支持移动端和 Web 端。自动应用产品设计规范，默认遵循 Apple HIG。
argument-hint: "[PRD路径 | --mobile | --web]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls)
---

# 原型生成

## 输入

- 主要：`{项目目录}/05-prd/05-PRD-v1.0.md`（PRD）
- 可选：`templates/ui-specs/{规范名}/`（自定义设计规范）
- 可选：`{项目目录}/.ai-pm-config.json`（项目配置，含 designSystem 字段）

## 输出

`{项目目录}/06-prototype/index.html`（单文件，可直接用浏览器打开）

## 执行步骤

### 步骤1：加载设计规范

1. 读取 `{项目目录}/.ai-pm-config.json`，检查 `designSystem` 字段
2. 若有指定规范，读取 `templates/ui-specs/{规范名}/` 目录下的配置
3. 若无，使用默认 Apple HIG 规范（见下方默认令牌）

### 步骤2：询问设备类型

```
设计规范已加载：{规范名 | Apple HIG（默认）}

请指定设备类型：
- 移动端（手机 App，375px 基准宽度）
- Web 端（桌面浏览器，左侧 Sidebar 布局）
- 响应式（同时适配手机和电脑）

直接回复类型，或回复"默认"使用移动端。
```

### 步骤3：解析 PRD，提取页面信息

- 功能清单 → 确定需要哪些页面
- 页面流程图 → 确定页面跳转关系
- 详细功能设计 → 确定每个页面的元素和交互

### 步骤4：生成单文件 HTML 原型

所有 CSS 和 JS 内联到单个 `index.html`，无外部依赖，直接双击即可预览。

## 技术规范

### 默认设计规范（Apple HIG）

```css
:root {
  /* 颜色 */
  --color-primary: #007AFF;
  --color-background: #F5F5F7;
  --color-surface: #FFFFFF;
  --color-text-primary: #1D1D1F;
  --color-text-secondary: #86868B;
  --color-success: #34C759;
  --color-danger: #FF3B30;

  /* 字体 */
  --font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;

  /* 间距 */
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;

  /* 圆角 */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;

  /* 阴影 */
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
}
```

### 移动端布局模式

- 顶部 Navigation Bar（标题 + 返回按钮）
- 主内容区域（可滚动）
- 底部 Tab Bar（主导航）
- 基准宽度 375px，响应式缩放

### Web 端布局模式

- 左侧 Sidebar（功能导航，240px）
- 顶部 Header（面包屑 + 用户信息）
- 主内容区域（最大宽度 1200px，居中）

### 交互实现

- 页面切换：`show(pageId)` / `hide(pageId)`，CSS transition 过渡
- 移动端滑动返回：touch 事件监听，startX < 50 且滑动距离 > 100 触发
- 表单验证：即时反馈，红色边框 + 错误提示文字
- 加载状态：骨架屏或 spinner

### 原型内容规范

- 所有数据使用模拟数据（与真实业务无关）
- 点击可交互元素必须有视觉反馈（hover/active 状态）
- 空状态、加载状态、错误状态均需要呈现
- 还原 PRD 中的核心用户流程（至少覆盖主流程）

## 文件结构

生成单文件原型（首选），所有代码内联：
```
{项目目录}/06-prototype/
└── index.html   # 全部 HTML + CSS + JS，无外部依赖
```

若原型复杂（页面 > 5 个），可拆分为多文件：
```
{项目目录}/06-prototype/
├── index.html       # 入口页面
├── pages/           # 各页面 HTML
├── style.css        # 样式
└── app.js           # 交互逻辑
```

## 完成提示

```
原型生成完成！

文件位置：{项目目录}/06-prototype/index.html
预览方式：直接用浏览器打开 index.html

设备类型：{mobile/web/responsive}
设计规范：{规范名}
页面数量：{N} 个
核心流程：{流程描述}

提示：点击可交互元素体验流程，数据为模拟数据。
```
