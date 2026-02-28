---
name: ai-pm-ui-spec
description: >-
  UI 规范管理技能。独立管理 UI 设计规范的上传、解析、存储和应用。
  支持从设计稿图片、PDF文档中提取颜色、字体、间距等设计令牌。
  生成结构化的 design-tokens.json 供原型生成时调用，确保原型符合企业设计规范。
argument-hint: "[upload|list|delete|show] [规范名] [文件路径]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(rm)
---

# UI 规范管理

## 定位

这是一个**独立的管理型技能**，专门负责设计规范的全生命周期管理。

- **不依赖项目**：可以在任何目录执行，不绑定特定项目
- **全局共享**：规范存储在 `templates/ui-specs/`，所有项目共用
- **解析器角色**：将设计资源（图片/PDF）转换为结构化数据

## 职责边界

| 本技能负责 | 其他技能负责 |
|-----------|-------------|
| 设计规范的上传、解析、存储 | PRD生成时的规范选择（ai-pm） |
| 设计令牌的提取和结构化 | 原型生成时的规范应用（ai-pm-prototype） |
| 规范目录的管理（CRUD） | 规范的使用和渲染 |

## 存储结构

```
templates/ui-specs/
├── {规范名}/
│   ├── README.md              # 规范说明（人工可读）
│   ├── design-tokens.json     # 设计令牌（机器可读）
│   └── assets/                # 原始设计资源
│       ├── homepage.png
│       ├── components/
│       └── brand-guide.pdf
```

## 命令体系

### 1. 上传并解析设计规范

```bash
/ai-pm ui-spec upload {规范名}
```

**流程：**
```
1. 检查名称是否已存在
2. 创建目录 templates/ui-specs/{规范名}/
3. 提示用户上传设计资源（图片/PDF/Sketch/Figma导出）
4. 用户上传完成后，AI 自动解析：
   - 提取颜色系统（主色/辅助色/中性色/功能色）
   - 识别字体规范（字体族/字号/字重/行高）
   - 分析组件样式（按钮/表单/卡片/导航）
   - 整理间距/圆角/阴影/动画
5. 生成 design-tokens.json 和 README.md
6. 完成提示
```

**生成的 design-tokens.json 结构：**
```json
{
  "meta": {
    "name": "my-company",
    "createdAt": "2026-03-01",
    "sourceFiles": ["homepage.png", "components.pdf"]
  },
  "colors": {
    "primary": { "value": "#007AFF", "usage": "主按钮、链接" },
    "secondary": { "value": "#5856D6", "usage": "次级操作" },
    "success": { "value": "#34C759", "usage": "成功状态" },
    "warning": { "value": "#FF9500", "usage": "警告状态" },
    "danger": { "value": "#FF3B30", "usage": "错误状态" },
    "background": { "value": "#F5F5F7", "usage": "页面背景" },
    "surface": { "value": "#FFFFFF", "usage": "卡片背景" },
    "text": {
      "primary": { "value": "#1D1D1F", "usage": "主要文字" },
      "secondary": { "value": "#86868B", "usage": "次要文字" }
    }
  },
  "typography": {
    "fontFamily": {
      "base": "-apple-system, BlinkMacSystemFont, 'SF Pro Text'",
      "heading": "'SF Pro Display', sans-serif"
    },
    "fontSize": {
      "xs": { "value": "12px", "usage": "辅助文字" },
      "sm": { "value": "14px", "usage": "正文小字" },
      "base": { "value": "16px", "usage": "正文" },
      "lg": { "value": "18px", "usage": "小标题" },
      "xl": { "value": "24px", "usage": "标题" },
      "2xl": { "value": "32px", "usage": "大标题" }
    },
    "fontWeight": {
      "normal": "400",
      "medium": "500",
      "semibold": "600",
      "bold": "700"
    }
  },
  "spacing": {
    "xs": { "value": "4px", "usage": "紧凑间距" },
    "sm": { "value": "8px", "usage": "小间距" },
    "md": { "value": "16px", "usage": "标准间距" },
    "lg": { "value": "24px", "usage": "大间距" },
    "xl": { "value": "32px", "usage": "区块间距" }
  },
  "borderRadius": {
    "sm": { "value": "8px", "usage": "小组件" },
    "md": { "value": "12px", "usage": "卡片" },
    "lg": { "value": "16px", "usage": "大卡片" },
    "xl": { "value": "24px", "usage": "弹窗" }
  },
  "shadows": {
    "sm": { "value": "0 1px 2px rgba(0,0,0,0.04)", "usage": "按钮" },
    "md": { "value": "0 4px 16px rgba(0,0,0,0.08)", "usage": "卡片" },
    "lg": { "value": "0 8px 32px rgba(0,0,0,0.12)", "usage": "弹窗" }
  },
  "components": {
    "button": {
      "primary": {
        "background": "#007AFF",
        "color": "#FFFFFF",
        "borderRadius": "10px",
        "padding": "12px 24px"
      },
      "secondary": { ... }
    },
    "card": {
      "background": "#FFFFFF",
      "borderRadius": "12px",
      "shadow": "0 4px 16px rgba(0,0,0,0.08)",
      "padding": "16px"
    },
    "input": {
      "background": "#F2F2F7",
      "borderRadius": "10px",
      "border": "2px solid transparent",
      "padding": "12px 16px"
    }
  },
  "layout": {
    "maxWidth": { "value": "1440px", "usage": "页面最大宽度" },
    "sidebarWidth": { "value": "240px", "usage": "侧边栏宽度" },
    "headerHeight": { "value": "52px", "usage": "顶部导航高度" }
  }
}
```

### 2. 列出所有设计规范

```bash
/ai-pm ui-spec list
```

**输出示例：**
```
📁 设计规范库 (templates/ui-specs/)

系统内置：
  1. apple-standard      Apple 官方设计规范
  2. material-v3         Google Material Design 3

用户自定义：
  3. my-company          我的公司规范    [3个文件, 2026-03-01]
  4. enterprise-b        企业B端规范     [5个文件, 2026-02-28]

总计: 4 个设计规范
```

### 3. 查看设计规范详情

```bash
/ai-pm ui-spec show {规范名}
```

**输出：** 显示 README.md 内容 + design-tokens.json 摘要

### 4. 删除设计规范

```bash
/ai-pm ui-spec delete {规范名}
```

**确认提示：**
```
⚠️ 确定要删除设计规范 "{规范名}" 吗？
这将删除以下文件：
  - templates/ui-specs/{规范名}/README.md
  - templates/ui-specs/{规范名}/design-tokens.json
  - templates/ui-specs/{规范名}/assets/ (3个文件)

回复 "确认删除" 以继续，或其他内容取消。
```

## 与其他技能的协作

### ai-pm 调用（PRD 生成时）

```javascript
// ai-pm skill 内部逻辑
function selectDesignSystem() {
  // 调用本 skill 的 list 能力
  const systems = exec('ai-pm-ui-spec list --json');

  // 展示选择界面
  showSelectionDialog(systems);

  // 用户选择后，保存到项目配置
  saveToProjectConfig({ designSystem: selected });
}
```

### ai-pm-prototype 调用（原型生成时）

```javascript
// ai-pm-prototype skill 内部逻辑
function applyDesignSystem(projectDir) {
  // 读取项目配置中选定的设计规范
  const config = readProjectConfig(projectDir);
  const systemName = config.designSystem || 'apple-standard';

  // 调用本 skill 获取设计令牌
  const tokens = exec(`ai-pm-ui-spec export ${systemName}`);

  // 应用令牌生成 CSS
  generateCSS(tokens);
}
```

## 交互示例

### 完整的上传流程

```
用户: /ai-pm ui-spec upload my-company

AI: 📁 设计规范管理

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 创建新规范: my-company
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

步骤 1/4: 创建目录结构
✅ 已创建: templates/ui-specs/my-company/

步骤 2/4: 上传设计资源
💬 请上传以下文件到上述目录：

  📄 必传（至少一项）：
     • 设计规范文档 (PDF/Word)
     • 设计稿截图 (PNG/JPG)
     • 组件库截图 (Figma/Sketch导出)

  🖼️ 建议上传：
     • 品牌色彩规范
     • 字体规范文档
     • 典型页面设计稿 (首页/列表/详情)

上传完成后，回复 "开始解析"

─────────────────────────────────────────

用户: [上传文件] 开始解析

AI: 步骤 3/4: 解析设计资源
🔄 正在分析 uploaded/homepage.png ...
   [1/5] 提取色彩系统 ... ✅ 发现 8 个主色
   [2/5] 识别字体规范 ... ✅ 发现字体 'Inter', 'SF Pro'
   [3/5] 分析间距系统 ... ✅ 发现 4px 基础间距
   [4/5] 提取组件样式 ... ✅ 发现按钮/卡片/输入框样式
   [5/5] 整理圆角阴影 ... ✅ 发现 4 级圆角

🔄 正在分析 uploaded/components.pdf ...
   ✅ 补充了表格/导航/弹窗组件规范

步骤 4/4: 生成规范文档
📝 生成 README.md ... ✅
📝 生成 design-tokens.json ... ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 设计规范 "my-company" 创建完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 规范摘要：
   • 色彩: 12 个颜色令牌
   • 字体: 2 个字体族, 6 个字号
   • 间距: 5 级间距系统
   • 圆角: 4 级圆角
   • 组件: 8 个组件规范

💡 使用方式：
   1. 生成 PRD 时会提示选择设计规范
   2. 生成原型时会自动应用选定规范
   3. 规范存储在 templates/ui-specs/my-company/

─────────────────────────────────────────
```

## 设计规范 vs 产品经理风格

| 维度 | 设计规范 (ai-pm-ui-spec) | 产品经理风格 (ai-pm-writing-style) |
|------|-------------------------------|---------------------------|
| **管理对象** | UI 视觉规范（颜色/字体/组件） | PRD 写作风格 |
| **输入** | 设计稿图片、PDF 文档 | PRD Markdown 文档 |
| **输出** | design-tokens.json | style-config.json |
| **使用时机** | 原型生成时 | PRD 生成时 |
| **影响结果** | 产品外观 | 文档结构和表述方式 |

---

*这是一个独立技能，不依赖项目上下文，可在任何目录执行。*
