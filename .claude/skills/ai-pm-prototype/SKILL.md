---
name: ai-pm-prototype
description: 原型生成技能。基于 PRD 生成可交互的单页网页原型，支持移动端和 Web 端。自动应用产品设计规范，默认遵循 Apple HIG。
argument-hint: "[PRD路径 | --mobile | --web]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(node)
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

### 步骤5：截图与 manifest 生成

原型 HTML 生成完毕后，立即执行截图并写出 manifest，供后续 PDF 导出使用。

#### 5.1 截图

```bash
CHROME=~/Library/Caches/ms-playwright/chromium-1212/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"

mkdir -p {项目目录}/06-prototype/screenshots/

# 对每个原型页面截图（file:// 对 Chrome 二进制直接可用）
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --screenshot="{项目目录}/06-prototype/screenshots/01-{slug}.png" \
  --window-size=1440,900 \
  "file://{项目目录}/06-prototype/index.html" 2>/dev/null

# 若有子页面，逐一截图
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --screenshot="{项目目录}/06-prototype/screenshots/02-{slug}.png" \
  --window-size=1440,900 \
  "file://{项目目录}/06-prototype/pages/{page}.html" 2>/dev/null
```

**截图命名规则**：`{两位序号}-{小节slug}.png`，slug 取 PRD 章节标题的拼音首字母或英文关键词（如 `01-task-list.png`、`02-grading.png`）。

#### 5.2 写出 manifest.json

```bash
node -e "
const manifest = {
  generated_at: new Date().toISOString(),
  sections: [
    {
      prd_section: '6.1',
      label: '{章节标题，与 PRD 第六章小节标题一致}',
      file: 'index.html',
      screenshot: 'screenshots/01-{slug}.png'
    },
    {
      prd_section: '6.2',
      label: '{章节标题}',
      file: 'pages/{page}.html',
      screenshot: 'screenshots/02-{slug}.png'
    }
    // ... 按实际页面数量填写
  ]
};
require('fs').writeFileSync(
  '{项目目录}/06-prototype/screenshots/manifest.json',
  JSON.stringify(manifest, null, 2)
);
"
```

**关键约定**：`label` 字段必须与 PRD 第六章对应小节的标题**完全一致**（如 `"任务列表与任务分配"`），PDF 导出时依此做精确匹配。

## 文件结构

生成单文件原型（首选），所有代码内联：
```
{项目目录}/06-prototype/
├── index.html          # 全部 HTML + CSS + JS，无外部依赖
└── screenshots/        # 步骤5 自动生成
    ├── manifest.json
    └── 01-{slug}.png
```

若原型复杂（页面 > 5 个），可拆分为多文件：
```
{项目目录}/06-prototype/
├── index.html          # 入口页面
├── pages/              # 各页面 HTML
├── style.css
├── app.js
└── screenshots/        # 步骤5 自动生成
    ├── manifest.json
    ├── 01-{slug}.png
    └── 02-{slug}.png
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

截图已生成：06-prototype/screenshots/（共 {N} 张，供 PDF 导出使用）

提示：点击可交互元素体验流程，数据为模拟数据。
```
