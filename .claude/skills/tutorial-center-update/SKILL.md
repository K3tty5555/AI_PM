---
name: tutorial-center-update
description: >-
  AI_PM 教程中心自动化更新 Skill。
  扫描所有 skills，生成符合 Apple 设计规范的单一 HTML 文件。
  采用纯原生技术栈（无框架依赖），完全离线可用。
  支持 Tab 导航、Scroll Reveal 动画、键盘/触摸交互。
  输出可直接打开、无需网络的 AI_PM_教程中心.html。
argument-hint: "[update|preview|sync|validate]"
allowed-tools: Read Write Edit Bash(ls) Bash(find) Bash(cat) Bash(grep) Bash(sed) Agent
---

# 教程中心自动化更新

## 概述

本 Skill 生成**完全独立、纯原生**的教程中心 HTML 文件：

1. **扫描阶段** - 发现所有 skills，提取元数据
2. **生成阶段** - 构建纯原生单一 HTML 文件（零依赖）
3. **自检阶段** - 执行全量代码验证，确保可正常运行
4. **交付阶段** - 输出完全离线可用的 HTML 文件

## 核心约束

### 技术架构（纯原生）

```markdown
✅ 零 JavaScript 框架依赖（无 Vue/React/Angular）
✅ 零外部 CDN 依赖
✅ 所有 CSS 内联在 <style>
✅ 所有 JS 内联在 <script>（原生 JS）
✅ 无本地文件依赖
✅ 完全离线可用（无需网络）
✅ 双击 HTML 即可打开，无需服务器
✅ 文件可拷贝到任何地方独立运行
```

### 技术实现

| 组件 | 方案 | 大小 |
|------|------|------|
| 交互框架 | 原生 JavaScript | ~3KB |
| 动画系统 | CSS3 + IntersectionObserver | ~2KB |
| 样式系统 | CSS Variables + Flex/Grid | ~15KB |
| **总计** | - | **~20KB + 内容** |

## 页面架构

### Tab 导航系统

```
┌─────────────────────────────────────────────────────────┐
│  Logo  │  Tab1  │  Tab2  │  Tab3  │  Tab4  │  Tab5      │
├─────────────────────────────────────────────────────────┤
│  ████████████ 顶部进度条 ████████████                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Tab 内容区域（Scroll Reveal 动画）                      │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │
│  │ 卡片    │  │ 卡片    │  │ 卡片    │                 │
│  └─────────┘  └─────────┘  └─────────┘                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Tab 结构（5个Tab）

| Tab | 标题 | 主题色 | 内容 |
|-----|------|--------|------|
| 1 | 首页 | 蓝色 #0071e3 | Hero + 核心能力 + 快速开始 |
| 2 | 技能 | 橙色 #ff9f0a | 所有技能分类展示 |
| 3 | 指南 | 绿色 #30d158 | 完整使用教程 |
| 4 | 工作流 | 紫色 #bf5af2 | 4种工作流模式详解 |
| 5 | 关于 | 红色 #ff375f | 更新日志 + 项目信息 |

## 交互特性

### 1. Scroll Reveal 动画

```javascript
// 元素滚动进入视口时的渐入动画
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);
```

### 2. 键盘导航

```javascript
// 左右方向键切换 Tab
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') switchTab(currentTab + 1);
  if (e.key === 'ArrowLeft') switchTab(currentTab - 1);
});
```

### 3. 触摸滑动

```javascript
// 移动端左右滑动切换 Tab
let touchStartX = 0;
document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  const diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 80) {
    diff > 0 ? switchTab(currentTab + 1) : switchTab(currentTab - 1);
  }
}, { passive: true });
```

### 4. 滚动进度条

```javascript
// 顶部进度指示器
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
  progressBar.style.transform = 'scaleX(' + Math.min(scrolled, 1) + ')';
}, { passive: true });
```

### 5. 主题色切换

```javascript
// 每个 Tab 独立颜色
const accentColors = [
  '#0071e3', // 蓝 - 首页
  '#ff9f0a', // 橙 - 技能
  '#30d158', // 绿 - 指南
  '#bf5af2', // 紫 - 工作流
  '#ff375f'  // 红 - 关于
];

document.documentElement.style.setProperty('--accent', accentColors[index]);
```

## 使用方式

```bash
# 完整流程：生成 + 自检
/tutorial-center-update

# 仅预览（不写入文件）
/tutorial-center-update preview

# 同步检查（对比差异）
/tutorial-center-update sync

# 验证现有 HTML
/tutorial-center-update validate

# 执行自检脚本
./.claude/skills/tutorial-center-update/validate-html.sh
```

## 工作流程

### Phase 1: 扫描 Skills

```bash
find .claude/skills -name "SKILL.md" -type f
```

提取每个 skill：
- `name` - 技能名称
- `description` - 第一行描述
- `command` - 主命令
- `icon` - Emoji 图标
- `category` - 分类（产品/设计/数据/协作/工具）

### Phase 2: 生成 HTML

**内联内容**：
1. CSS Variables → 设计系统（颜色/字体/间距/动画）
2. CSS Animations → Scroll Reveal + Tab Transition
3. JavaScript → Tab切换 + 键盘/触摸 + 进度条 + IntersectionObserver
4. SKILLS_DATA → 技能列表
5. GUIDE_CONTENT → Markdown 教程（原生解析）

**HTML 结构**：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI_PM - AI 产品经理</title>

    <!-- 内联 CSS -->
    <style>
        :root { /* CSS Variables */ }
        /* Scroll Reveal 动画 */
        /* Tab 样式 */
        /* 响应式布局 */
    </style>
</head>
<body>
    <!-- 进度条 -->
    <div class="progress-bar" id="progressBar"></div>

    <!-- Tab 导航 -->
    <nav class="nav">
        <div class="nav-logo">AI_PM</div>
        <div class="nav-tabs">
            <button class="nav-tab active" data-tab="0">首页</button>
            <button class="nav-tab" data-tab="1">技能</button>
            <button class="nav-tab" data-tab="2">指南</button>
            <button class="nav-tab" data-tab="3">工作流</button>
            <button class="nav-tab" data-tab="4">关于</button>
        </div>
    </nav>

    <!-- Tab 内容 -->
    <div class="tab-panels">
        <div class="tab-panel active" data-panel="0">
            <!-- Tab 1: 首页 -->
        </div>
        <div class="tab-panel" data-panel="1">
            <!-- Tab 2: 技能 -->
        </div>
        <!-- ... -->
    </div>

    <!-- 原生 JavaScript -->
    <script>
        (function() {
            'use strict';
            // Tab 切换逻辑
            // 键盘/触摸支持
            // Scroll Reveal
            // 进度条
        })();
    </script>
</body>
</html>
```

### Phase 3: 全量自检

**静态检查**：
- [ ] 文件存在
- [ ] 无 CDN 依赖
- [ ] 无本地文件引用
- [ ] 原生 JS（无 Vue/React/Angular）
- [ ] CSS Variables 完整
- [ ] 技能数据完整
- [ ] HTML 标签平衡

**运行时检查**（可选，用 playwright-cli）：
- [ ] Tab 切换正常
- [ ] 键盘导航正常
- [ ] 触摸滑动正常
- [ ] Scroll Reveal 动画正常
- [ ] 进度条正常

### Phase 4: 交付

**输出文件**：
- `AI_PM_教程中心.html` - 单一文件，完全离线可用

**验证报告**：
```markdown
=== 生成验证报告 ===
✓ 文件大小: ~80KB
✓ 零外部依赖
✓ 技能数量: N
✓ Tab 导航: 5个
✓ 交互特性: 键盘/触摸/进度条/动画
✓ 所有检查通过

结论: HTML 文件完全独立，可离线运行
```

## 详细文档

- [generator.md](./generator.md) - HTML 生成器规范
- [validator.md](./validator.md) - 验证流程和自检机制
- [agent-review.md](./agent-review.md) - Agent Team 调优流程（可选）

## 故障排查

| 问题 | 原因 | 解决 |
|-----|------|------|
| Tab 不切换 | JS 语法错误 | 检查 switchTab 函数 |
| 动画不生效 | CSS 类名错误 | 检查 reveal/visible 类 |
| 进度条不动 | 滚动事件未触发 | 检查 scroll 监听器 |
| 键盘无效 | 焦点在输入框 | 点击页面空白处再试 |

## 内容规范

### 更新日志（Changelog）原则

**重要**：教程中心 HTML 文件自身的更新**不纳入**更新日志中。

更新日志应只包含：
- ✅ AI_PM 技能的变更（新增/删除/修改）
- ✅ 功能特性的增删改
- ✅ 工作流程的变化
- ✅ 配置选项的变更

更新日志**不应**包含：
- ❌ 教程中心 UI 的更新
- ❌ HTML 文件结构的调整
- ❌ 样式或交互的优化
- ❌ 视觉效果的改进

### 文案风格与用词规范

#### 语气与语调
- **友好专业**：像一位经验丰富的导师，而非冷漠的文档
- **简洁有力**：避免冗长，直击要点
- **鼓励性**：让用户感到"我也能做到"
- **一致性**：相同概念使用相同表述

#### 推荐用词
| 推荐 | 避免 | 原因 |
|------|------|------|
| "开始体验" | "开始使用" | 更有吸引力 |
| "引导你" | "帮助您" | 更亲切、平等 |
| "产出" | "生成" | 强调结果而非过程 |
| "技能" | "功能" | AI_PM 特有术语 |
| "全流程" | "一站式" | 更专业 |

#### 避免用词
- ❌ "简单"、"容易" - 暗示用户可能做不到
- ❌ "只需要" - 可能低估复杂度
- ❌ "等等"、"..." - 不完整的列举
- ❌ 技术缩写（除非已解释）

### 技能卡片规范

每个技能卡片必须包含：
1. **图标**：Emoji，22-28px
2. **名称**：2-4 个汉字，简洁有力
3. **命令**：完整的命令格式
4. **简短描述**：一句话说明核心功能（15 字以内）

可选增强内容：
5. **使用场景**：2-3 个典型场景（高频/痛点/入门）
6. **示例**：1 个完整的实际案例（场景+命令+结果）

#### 技能描述模板

```yaml
名称: AI_PM 主控
命令: "/ai-pm"
图标: 🎯
简短描述: 完整产品流程，从需求到原型
使用场景:
  - 全新项目启动，需要全流程指导（高频）
  - 快速验证一个产品想法（痛点）
  - 初学者体验 AI_PM 的最佳入口（入门）
示例:
  场景: 你想做一个记账小程序
  命令: /ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"
  结果: AI 会引导你完成需求澄清，然后自动分析、研究、生成 PRD 和原型
```

#### 场景描述规范
每个技能必须提供 3 类使用场景：
1. **高频场景** - 最常用的场景
2. **痛点场景** - 解决具体问题的场景
3. **入门场景** - 新手第一次使用的场景

场景描述格式：
- 以动词开头
- 具体而非抽象
- 避免"等"、"等等"

#### 示例案例规范
每个示例必须包含：
1. **标题**：场景名称（4-6 个字）
2. **背景**：一句话描述当前情况
3. **命令**：完整的可执行命令
4. **结果**：明确说明产出物

### Apple 设计规范排版原则

#### 间距系统（8pt Grid）

```css
:root {
  /* 基础间距单位 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
}
```

**使用规范**：
- Section 间距：`var(--space-20)` 至 `var(--space-24)` (80-96px)
- 卡片内边距：`var(--space-6)` 至 `var(--space-8)` (24-32px)
- 元素间距：`var(--space-4)` 至 `var(--space-5)` (16-20px)
- 紧凑间距：`var(--space-2)` 至 `var(--space-3)` (8-12px)

#### 布局原则

**容器约束**：
```css
.container {
  max-width: 980px;        /* 内容区最大宽度 */
  margin: 0 auto;
  padding: 0 var(--space-6);  /* 24px 水平内边距 */
}

.text-container {
  max-width: 680px;        /* 文本区最大宽度（阅读舒适区） */
  margin: 0 auto;
}
```

**关键约束**：
- 内容区最大宽度：980px
- 文本区最大宽度：680px
- 使用 CSS Grid 和 Flexbox 进行布局
- 响应式断点：768px
- 保持足够的留白空间（White Space）

#### 视觉层次排版

**字体规范表**：

| 样式 | 大小 | 字重 | 行高 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| Hero | 64px / clamp(48px, 8vw, 64px) | 700 | 1.05 | -0.03em | 首页大标题 |
| Eyebrow | 21px | 600 | 1.19 | 0.011em | 小标题/标签 |
| Headline | 40px / clamp(32px, 5vw, 40px) | 600 | 1.1 | -0.02em | 页面标题 |
| Intro | 21px | 400 | 1.5 | 0.011em | 介绍文字 |
| Body | 17px | 400 | 1.5 | -0.01em | 正文 |
| Caption | 15px | 400 | 1.4 | -0.01em | 辅助说明 |
| Code | 13px | 500 | 1.4 | -0.01em | 代码/命令 |

**字体栈**：
```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
--font-mono: "SF Mono", SFMono-Regular, ui-monospace, Menlo, monospace;
```

**排版原则**：
- Hero 大标题：48-64px，字重 700，字间距 -0.03em，行高 1.05
- Section 中标题：32-40px，字重 600，字间距 -0.02em，行高 1.1
- Card 小标题：21px，字重 600，字间距 -0.01em，行高 1.25
- 正文：17px，行高 1.5，字间距 -0.01em
- 小号文字：15px，行高 1.4，字间距 -0.01em

#### 组件布局规范

**导航栏**：
- 高度：52px
- 背景：Glassmorphism (backdrop-filter: blur(20px))
- 内边距：0 24px

**Hero 区域**：
- 最小高度：calc(100vh - 52px)
- 垂直居中
- 内边距：80px 24px

**Feature/Skill 卡片网格**：
```css
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-6);  /* 24px */
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);  /* 20px */
}
```

**更新日志布局**：
```css
.changelog-item {
  display: flex;
  gap: var(--space-8);        /* 32px */
  padding: var(--space-8) 0;  /* 32px 垂直 */
}

.changelog-version {
  flex-shrink: 0;
  width: 80px;
}
```

## 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| 3.0 | 2026-03-03 | 纯原生架构，Tab 导航，Scroll Reveal，键盘/触摸支持 |
| 2.1 | 2026-03-03 | Vue 3 + CDN 架构（已废弃）|
| 2.0 | 2026-03-03 | 完全内联架构（已废弃）|
| 1.0 | 2026-03-01 | 初始版本 |

---

**关键原则**: 生成的 HTML 必须是**纯原生、零依赖**的单一文件，完全离线可用。
