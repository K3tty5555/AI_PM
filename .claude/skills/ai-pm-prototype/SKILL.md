---
name: ai-pm-prototype
description: >-
  产品原型生成技能。基于 PRD 生成可交互的网页原型，支持移动端和 Web 端设计。
  使用 HTML/CSS/JS 生成单页应用原型，放在项目目录下供预览。
  从项目配置读取设计规范，调用 ai-pm-design-system 导出设计令牌应用。
  无设计规范时遵循 Apple Human Interface Guidelines（默认）。
argument-hint: "[PRD文件路径] [设备:mobile/web/responsive]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls)
---

# 产品原型生成

## 执行协议

- **设计规范集成**：从项目配置读取选定的设计规范，调用 `ai-pm-design-system export` 获取设计令牌
- **设备类型确认**：询问用户设备偏好（移动端/Web端/响应式）
- **默认回退**：无设计规范时遵循 Apple Human Interface Guidelines
- **基于 PRD**：从 PRD 中提取功能点和页面流程
- **单页应用**：生成 HTML+CSS+JS，可直接在浏览器打开
- **项目存放**：原型文件放在项目目录 `06-prototype/` 下

## 设计规范集成（与 ai-pm-design-system 协作）

### 设计规范来源

本技能**不直接管理**设计规范，而是调用独立技能 `ai-pm-design-system`：

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   ai-pm         │────▶│  ai-pm-design-system │     │   ai-pm-prototype│
│  (PRD生成阶段)   │     │   (独立管理技能)      │◀────│  (原型生成阶段)  │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
         │                                               │
         │  1. 调用 list 获取规范列表                      │
         │  2. 用户选择后保存到项目配置                      │
         │───────────────────────────────────────────────▶│
         │                                               │
         │                                          3. 读取项目配置
         │                                          4. 调用 export 获取 tokens
         │                                          5. 应用 tokens 生成 CSS
```

### 调用接口

**1. 读取项目配置获取设计规范名称：**
```javascript
// 读取项目目录下的 .ai-pm-config.json
const config = readProjectConfig(projectDir);
const systemName = config.designSystem || null;  // 如 "my-company" 或 null
```

**2. 调用 ai-pm-design-system 导出设计令牌：**
```javascript
// 如果有选定设计规范，调用独立技能导出
if (systemName) {
    const tokens = exec(`ai-pm-design-system export ${systemName}`);
    // 返回完整的 design-tokens.json 内容
}
```

**3. 将设计令牌转换为 CSS 变量：**
```css
/* 示例：从 design-tokens.json 生成 CSS 变量 */
:root {
  /* 颜色 */
  --color-primary: #007AFF;
  --color-secondary: #5856D6;
  --color-background: #F5F5F7;

  /* 字体 */
  --font-family-base: -apple-system, BlinkMacSystemFont, 'SF Pro Text';
  --font-size-base: 16px;

  /* 间距 */
  --spacing-md: 16px;

  /* 圆角 */
  --border-radius-md: 12px;

  /* 阴影 */
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
}
```

### 设计规范应用流程

**Phase 0: 准备阶段（读取设计规范）**

```
🎨 准备：加载设计规范

步骤 1: 读取项目配置
   📄 读取 {项目目录}/.ai-pm-config.json
   ✅ 发现配置：designSystem = "my-company"

步骤 2: 调用 ai-pm-design-system 导出
   $ ai-pm-design-system export my-company

   返回结果：
   {
     "colors": { "primary": { "value": "#007AFF", "usage": "主按钮" } },
     "typography": { "fontFamily": { "base": "-apple-system..." } },
     "spacing": { "md": { "value": "16px" } },
     ...
   }
   ✅ 已加载设计令牌

步骤 3: 生成 CSS 变量
   ✅ 已生成 css/design-tokens.css

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 设计规范 "my-company" 已应用
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**无设计规范时的回退：**

```
🎨 准备：加载设计规范

步骤 1: 读取项目配置
   📄 读取 {项目目录}/.ai-pm-config.json
   ℹ️ 未发现设计规范配置

步骤 2: 使用默认 Apple 设计规范
   ✅ 已加载默认设计令牌（Apple HIG）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️ 使用默认设计规范（Apple）
💡 提示：在 PRD 生成阶段可选择自定义设计规范
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 设计规范

### 默认：Apple 设计规范

**视觉风格：**
- 圆角设计（8-12px）
- 毛玻璃效果（backdrop-filter）
- 柔和阴影
- San Francisco 字体体系
- 蓝色强调色 (#007AFF)

**交互原则：**
- 清晰的视觉层次
- 流畅的过渡动画
- 触觉反馈暗示
- 简洁的导航

### 移动端适配

**断点设计：**
- 基础宽度：375px（iPhone SE）
- 适配宽度：414px（iPhone Pro Max）
- 响应式缩放

**移动端组件：**
- 底部 Tab Bar
- 顶部 Navigation Bar
- 滑动操作
- 下拉刷新
- 底部 Sheet

### Web 端设计

**布局：**
- 左侧 Sidebar 导航
- 顶部 Header
- 主内容区域
- 最大宽度 1440px，居中显示

**Web 组件：**
- 顶部导航菜单
- 左侧功能菜单
- 面包屑导航
- 表格/列表展示

## 生成流程

### Phase 0: 加载设计规范 + 询问设备类型

**步骤 1: 自动加载设计规范（静默）**

```
🎨 准备：加载设计规范

读取项目配置 → 调用 ai-pm-design-system export → 生成 CSS 变量

✅ 设计规范 "{规范名}" 已加载（或未配置，使用默认）
```

**步骤 2: 询问设备类型**

```
💬 请指定设备类型：

1. **设备类型**
   • 移动端 App（手机端应用）
   • Web 端（电脑浏览器使用）
   • 响应式（同时适配手机和电脑）

2. **补充说明**（可选）
   • 如有特殊要求，如"深色模式"、"大屏适配"等请说明

请回复你的选择，例如：
   • "移动端" → 使用已选设计规范 + 移动端布局
   • "Web端，深色模式" → 使用已选设计规范 + Web布局 + 深色主题
   • 或直接回复"默认"（Web端 + 已选设计规范）

💡 当前设计规范：{规范名}
   如需更换，请在 PRD 生成阶段重新选择，或运行 `/ai-pm design-system`
```

**设计规范已确定说明：**

在原型生成阶段，**不再询问设计风格**，因为：
- 设计规范（颜色、字体、间距）已在 PRD 阶段通过 `ai-pm-design-system` 选定并保存
- 本阶段只询问**设备类型**（影响布局结构）
- 视觉风格由设计规范令牌自动决定

这种分离确保：
- **一致性**：同一项目的 PRD 和原型使用相同设计规范
- **单一数据源**：设计规范只由 `ai-pm-design-system` 管理
- **减少决策**：用户只需在 PRD 阶段选择一次设计规范

### Phase 1: 解析 PRD

**提取信息：**
- 功能清单 → 确定需要哪些页面
- 页面流程 → 确定页面跳转关系
- 详细功能设计 → 确定每个页面的元素
- 全局说明 → 确定交互规范

**页面清单生成：**
```
基于 PRD 提取的页面：
• 首页/列表页
• 详情页
• 编辑页
• 设置页
...
```

### Phase 2: 生成原型文件

**文件结构：**
```
06-prototype/
├── index.html              # 入口页面
├── css/
│   ├── design-tokens.css  # 设计令牌（从 ai-pm-design-system 导出）
│   ├── style.css          # 主样式
│   └── components.css     # 组件样式
├── js/
│   ├── app.js             # 主逻辑
│   └── pages.js           # 页面路由
├── pages/
│   ├── home.html          # 首页
│   ├── detail.html        # 详情页
│   └── ...                # 其他页面
└── assets/
    ├── icons/             # 图标
    └── images/            # 图片占位
```

**设计令牌 CSS 生成（css/design-tokens.css）：**

```css
/* =========================================================
   Design Tokens
   Source: ai-pm-design-system export {design-system-name}
   Generated: {timestamp}
   ========================================================= */

/* Colors */
:root {
  --color-primary: #007AFF;
  --color-primary-hover: #0056CC;
  --color-secondary: #5856D6;
  --color-success: #34C759;
  --color-warning: #FF9500;
  --color-danger: #FF3B30;
  --color-background: #F5F5F7;
  --color-surface: #FFFFFF;
  --color-text-primary: #1D1D1F;
  --color-text-secondary: #86868B;
}

/* Typography */
:root {
  --font-family-base: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  --font-family-heading: 'SF Pro Display', sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}

/* Spacing */
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}

/* Border Radius */
:root {
  --border-radius-sm: 8px;
  --border-radius-md: 12px;
  --border-radius-lg: 16px;
  --border-radius-xl: 24px;
}

/* Shadows */
:root {
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
}

/* Component Tokens */
:root {
  --button-primary-bg: var(--color-primary);
  --button-primary-color: #FFFFFF;
  --button-primary-radius: var(--border-radius-md);
  --card-bg: var(--color-surface);
  --card-radius: var(--border-radius-md);
  --card-shadow: var(--shadow-md);
  --input-bg: #F2F2F7;
  --input-radius: var(--border-radius-md);
}
```

**HTML 模板结构：**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{产品名} - 原型</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <!-- 页面结构 -->
    <div id="app">
        <!-- 根据设备类型生成不同布局 -->
    </div>
    <script src="js/app.js"></script>
</body>
</html>
```

### Phase 3: 输出完成

**完成提示：**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 原型生成完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 文件位置：{项目目录}/06-prototype/

📄 生成文件：
   ├── index.html              # 入口页面
   ├── css/
   │   ├── design-tokens.css  # 设计令牌（来自 ai-pm-design-system）
   │   ├── style.css          # 主样式
   │   └── components.css     # 组件样式
   ├── js/app.js              # 交互逻辑
   └── pages/                 # 页面文件夹

🌐 预览方式：
   1. 用浏览器打开 index.html
   2. 或运行：python -m http.server 8080
      然后访问 http://localhost:8080

📱 设计规格：
   • 设备类型：{mobile/web/responsive}
   • 设计规范：{规范名}（via ai-pm-design-system）
   • 颜色令牌：{N}个
   • 字体令牌：{N}个
   • 组件令牌：{N}个
   • 页面数量：{N}个

💡 使用说明：
   • 点击可交互元素体验流程
   • 部分按钮/链接支持点击跳转
   • 数据为模拟数据，仅展示界面

🎨 设计规范来源：
   • 管理：/ai-pm design-system
   • 位置：templates/design-systems/{规范名}/
   • 导出：ai-pm-design-system export {规范名}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 原型页面生成规范

### 通用组件库（使用 Design Tokens）

所有组件样式通过 CSS 变量引用设计令牌，确保与 `ai-pm-design-system` 导出的规范一致：

**按钮（引用 design-tokens.css）：**
```css
/* Primary Button - 使用 Design Tokens */
.btn-primary {
    background: var(--button-primary-bg);
    color: var(--button-primary-color);
    border-radius: var(--button-primary-radius);
    padding: 12px 24px;
    font-family: var(--font-family-base);
    font-weight: var(--font-weight-medium);
    transition: all 0.2s;
}
.btn-primary:hover {
    background: var(--color-primary-hover);
    transform: scale(1.02);
}
.btn-primary:active {
    transform: scale(0.98);
}
```

**卡片：**
```css
/* Card - 使用 Design Tokens */
.card {
    background: var(--card-bg);
    border-radius: var(--card-radius);
    padding: var(--spacing-md);
    box-shadow: var(--card-shadow);
    transition: transform 0.2s;
}
```

**输入框：**
```css
/* Input - 使用 Design Tokens */
.input {
    background: var(--input-bg);
    border-radius: var(--input-radius);
    padding: 12px 16px;
    border: 2px solid transparent;
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
    transition: border-color 0.2s;
}
.input:focus {
    border-color: var(--color-primary);
    outline: none;
}
```

**设计令牌回退机制：**
```css
/* 如果 CSS 变量未定义，提供默认值（Apple 风格） */
.btn-primary {
    background: var(--button-primary-bg, #007AFF);
    color: var(--button-primary-color, #FFFFFF);
    border-radius: var(--button-primary-radius, 10px);
}
```

### 页面类型模板

**1. 列表页（List View）**
```
┌─────────────────────┐
│  ← 标题            │  ← Navigation Bar
├─────────────────────┤
│ 🔍 搜索            │  ← Search Bar
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ 📄 项目1   >   │ │  ← Card/List Item
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ 📄 项目2   >   │ │
│ └─────────────────┘ │
│ ...                │
├─────────────────────┤
│  🏠    📋    👤   │  ← Tab Bar (Mobile)
└─────────────────────┘
```

**2. 详情页（Detail View）**
```
┌─────────────────────┐
│  ← 详情          ✓ │  ← Navigation Bar
├─────────────────────┤
│ ┌─────────────────┐ │
│ │    内容区域     │ │  ← Content Area
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ 信息项1：xxx       │
│ 信息项2：xxx       │
│                     │
│ ┌─────────────────┐ │
│ │    主要操作    │ │  ← Primary Action
│ └─────────────────┘ │
└─────────────────────┘
```

**3. 表单页（Form View）**
```
┌─────────────────────┐
│  ← 编辑          保存│
├─────────────────────┤
│                     │
│ 标题              * │
│ ┌─────────────────┐ │
│ │ 请输入标题      │ │
│ └─────────────────┘ │
│                     │
│ 描述                │
│ ┌─────────────────┐ │
│ │ 请输入描述...   │ │
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ 选项                │
│ ○ 选项1  ○ 选项2   │
│                     │
└─────────────────────┘
```

## 交互实现

**页面切换：**
```javascript
// 简单的页面路由
function navigateTo(page) {
    // 添加转场动画
    document.body.classList.add('transitioning');

    setTimeout(() => {
        window.location.href = `pages/${page}.html`;
    }, 300);
}
```

**手势支持（移动端）：**
```javascript
// 滑动返回
let startX = 0;
document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
});

document.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    if (startX - endX > 100) {
        // 左滑
    } else if (endX - startX > 100 && startX < 50) {
        // 右滑返回
        history.back();
    }
});
```

## 输出格式

输出目录：`{项目目录}/06-prototype/`

入口文件：`index.html`（自动打开或跳转至主页面）

---

*原型生成时间：{日期}*
