---
name: ai-pm-prototype
description: >-
  产品原型生成技能。基于 PRD 生成可交互的网页原型，支持移动端和 Web 端设计。
  使用 HTML/CSS/JS 生成单页应用原型，放在项目目录下供预览。
  遵循 Apple 设计规范（默认），或按用户指定风格设计。
argument-hint: "[PRD文件路径] [风格:apple/mobile/web/custom]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls)
---

# 产品原型生成

## 执行协议

- **询问风格**：生成前询问用户风格偏好（移动端/Web端/自定义）
- **默认规范**：无指定时遵循 Apple Human Interface Guidelines
- **基于 PRD**：从 PRD 中提取功能点和页面流程
- **单页应用**：生成 HTML+CSS+JS，可直接在浏览器打开
- **项目存放**：原型文件放在项目目录 `06-prototype/` 下

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

### Phase 0: 询问风格偏好

**询问模板：**
```
🎨 即将开始：原型设计

基于 PRD，我将生成可交互的网页原型。

💬 请告诉我设计偏好：

1. **设备类型**
   • 移动端 App（手机端应用）
   • Web 端（电脑浏览器使用）
   • 响应式（同时适配手机和电脑）

2. **设计风格**（可选，默认 Apple 风格）
   • Apple 风格（简洁、圆角、毛玻璃）
   • Material Design（Google 风格）
   • 自定义描述（如：深色模式、商务风格等）

请回复你的选择，例如：
   • "移动端，Apple 风格"
   • "Web端，深色模式"
   • "响应式，Material Design"
   • 或直接回复"默认"（Web端 + Apple风格）
```

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
   ├── index.html          # 入口页面
   ├── css/style.css       # 样式文件
   ├── js/app.js           # 交互逻辑
   └── pages/              # 页面文件夹

🌐 预览方式：
   1. 用浏览器打开 index.html
   2. 或运行：python -m http.server 8080
      然后访问 http://localhost:8080

📱 设计规格：
   • 设备类型：{mobile/web/responsive}
   • 设计风格：{apple/material/custom}
   • 页面数量：{N}个

💡 使用说明：
   • 点击可交互元素体验流程
   • 部分按钮/链接支持点击跳转
   • 数据为模拟数据，仅展示界面
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 原型页面生成规范

### 通用组件库

**按钮：**
```css
/* Primary Button - Apple Style */
.btn-primary {
    background: #007AFF;
    color: white;
    border-radius: 10px;
    padding: 12px 24px;
    font-weight: 500;
    transition: all 0.2s;
}
.btn-primary:hover {
    background: #0056CC;
    transform: scale(1.02);
}
.btn-primary:active {
    transform: scale(0.98);
}
```

**卡片：**
```css
/* Card - Apple Style */
.card {
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    transition: transform 0.2s;
}
```

**输入框：**
```css
/* Input - Apple Style */
.input {
    background: #F2F2F7;
    border-radius: 10px;
    padding: 12px 16px;
    border: 2px solid transparent;
    transition: border-color 0.2s;
}
.input:focus {
    border-color: #007AFF;
    outline: none;
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
