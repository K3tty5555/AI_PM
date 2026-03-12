---
name: tutorial-center-update
description: >-
  AI_PM 教程中心自动化更新 Skill。扫描所有 skills，增量更新单一 HTML 文件，完全离线可用。
  当用户说「更新教程中心」「刷新教程」「教程中心过期了」「新增了技能需要更新文档」
  「同步技能列表到教程」时，立即使用此技能。注意：必须增量编辑，禁止整体重写。
argument-hint: "[update|preview|sync|validate]"
allowed-tools: Read Write Edit Bash(ls) Bash(find) Bash(cat) Bash(grep) Bash(sed) Agent
---

# 教程中心自动化更新

## 概述

本 Skill 生成**完全独立、纯原生**的教程中心 HTML 文件：

1. **扫描阶段** - 发现所有 skills，提取元数据
2. **生成阶段** - 构建 Editorial Endfield 风格单一 HTML 文件（零依赖）
3. **自检阶段** - 执行全量代码验证，确保可正常运行
4. **交付阶段** - 输出完全离线可用的 HTML 文件

## 设计系统（必须遵守）

### 风格定位

**终末地官网 Editorial × 精工细节**：纯白底色，极大无衬线 Display 字体，`//` 双斜杠作为核心装饰，黄色 `#FFD700` 仅用于实色块（非描边），深色页脚对比。开阔、明亮、精工感。

**禁止**：扫描线、菱形装饰、深蓝黑导航、游戏 HUD 风、`#1A1A2E` 暗色底、clip-path 多边形卡片。

### 调色板

> 颜色值来自终末地官网 CSS 实测（2026-03-11），与目测/拾色器有差异，以下为准。

```css
:root {
  --white:       #FFFFFF;              /* 主背景（Hero/Nav/卡片区） */
  --light:       #F5F5F5;              /* 次背景（交替 section） */
  --dark:        #191919;              /* 页脚/深色块（实测值，非 #1E1E1E） */
  --dark2:       #252525;              /* 页脚次层 */
  --yellow:      #fffa00;              /* 主强调色——实色块，非描边（实测值，非 #FFD700） */
  --yellow-dim:  rgba(255,250,0,0.08); /* 悬浮底高亮 */
  --border-y:    rgba(255,250,0,0.5);  /* 黄色边框（如 code-block 左侧线） */
  --text:        #141414;              /* 正文（实测值，非 #424242） */
  --text-title:  #141414;              /* 标题（同正文，高对比） */
  --text-muted:  #6b6b6b;              /* 辅助说明（实测值，非 #757575） */
  --border:      rgba(0,0,0,0.10);     /* 轻边框 */
  --green:       #4CAF50;              /* 状态点（在线指示器） */
  --font-mono:   'Courier New', 'Consolas', monospace;  /* 命令/版本/代码 */
  --font-sans:   -apple-system, 'PingFang SC', sans-serif;  /* 所有正文与标题 */
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
}
```

### 视觉特征（六要素，缺一不可）

| 特征 | 实现方式 |
|------|---------|
| **// 双斜杠标识** | Logo、节标题前缀、页脚均使用 `//`，颜色 `var(--yellow)`，`font-weight: 900` |
| **白色导航栏** | `background: var(--white)`，`border-bottom: 1px solid var(--border)`，active tab 下方 2px 黄线 |
| **Display 大字** | Hero 标题 `clamp(76px, 12.5vw, 164px)`，`font-weight: 900`，`letter-spacing: -4px`，行高 0.86 |
| **黄色实色块** | `background: var(--yellow)` 标签块/右侧装饰条/CTA hover，不用黄色描边 |
| **等宽字体克制使用** | `var(--font-mono)` 仅用于命令标签、版本号、代码块；标题/正文/nav 一律用 `var(--font-sans)` |
| **精工 HUD 框** | `border: 1px solid var(--border)` 功能框，四角 L 形装饰线（SVG 或 pseudo element），无背景色 |

### 导航结构

现在的页面是**单页锚点滚动**，不用 Tab 切换系统。Nav 包含：
- 左：`// AI_PM` 品牌 + 版本号
- 中：锚点链接（快速开始 / 技能列表 / 工作流）
- 右：实时时钟 + 在线状态点

```css
#hud-nav {
  position: fixed; top: 0; left: 0; right: 0;
  height: 54px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
  /* 无暗色背景，无扫描光，无 HUD 效果 */
}
.brand-slash { color: var(--yellow); font-weight: 900; font-size: 20px; }
.hud-tab.active::after {
  background: var(--yellow);  /* 2px 底线，非整个 tab 高亮 */
}
```

### 微交互清单（所有必须实现）

1. Hero 标题分行打字效果（setTimeout 链式）
2. 统计数字从 0 计数到目标值（countUp on IntersectionObserver）
3. 技能卡片 hover → 轻微上移 -3px + 淡黄色底
4. DEPLOY 按钮点击 → 黄底黑字反色 + "✓ COPIED" 文字
5. CTA 按钮 hover → 黄底反转
6. Scroll Reveal（IntersectionObserver，threshold: 0.12）
7. 涟漪点击效果（ripple-wave）
8. 代码块 COPY 按钮
9. 导航锚点平滑滚动
10. 实时时钟（每秒更新）
11. 触摸滑动不再用于 Tab 切换（锚点模式不适用）

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

### 单页锚点滚动结构

```
┌─────────────────────────────────────────────────────────┐
│  // AI_PM  │  快速开始  技能列表  工作流  │  时钟  ●    │  ← 固定导航 54px
├─────────────────────────────────────────────────────────┤
│                                                         │
│  #hero   白底 · //AI/PRODUCT/MANAGER 大字 · 右侧黄条   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  #quickstart  浅灰底 · 步骤卡片 3列 auto-fill grid      │
├─────────────────────────────────────────────────────────┤
│  #skills      白底 · 技能卡片网格                        │
├─────────────────────────────────────────────────────────┤
│  #workflow    浅灰底 · 横向时间轴                        │
├─────────────────────────────────────────────────────────┤
│  #footer  深色 #1E1E1E · // AI_PM v2.x                 │
└─────────────────────────────────────────────────────────┘
```

### Section 结构

| Section | 背景色 | 主要内容 |
|---------|--------|---------|
| `#hero` | `--white` | 大字标题 + 副标题 + 统计数字 + CTA |
| `#quickstart` | `--light` | 3步快速开始卡片（步骤序号+黄色标签） |
| `#skills` | `--white` | 所有技能卡片网格（分类展示） |
| `#workflow` | `--light` | 横向工作流时间轴（hover 显示说明） |
| `#footer` | `--dark` | // 品牌 + 版本 + 版权 |

## 交互特性

实现细节（Scroll Reveal 双层动画、ScrollSpy、实时时钟）见 → [`references/interactions.md`](./references/interactions.md)

**关键要点**：
- Scroll Reveal 用两套 Observer（threshold 0.25 标题 / 0.1 内容），产生层次感
- ScrollSpy 需要 `_navLock` 机制，防止点击导航后 scroll 事件覆盖高亮
- 实时时钟挂 `hud-clock` 元素，每秒更新

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

## ⚠️ 核心原则：增量更新，不重写

**现有 `AI_PM_教程中心.html` 是经过多轮打磨的复杂文件（1700+ 行），包含 SVG 六边形工作流节点、稀有度色条、暗色代码块、汉堡移动导航、速查表、Back-to-top 等组件。每次更新必须增量编辑，绝对不能整体重写。**

### 强制执行步骤（违反即视为错误）

1. **先读文件**：用 Read 工具读取 `AI_PM_教程中心.html`，记录当前行数
2. **识别差异**：对比 skill 列表变化、persona 变更、版本号更新等，明确需要改哪几处
3. **精准 Edit**：用 Edit 工具做局部插入/替换，每次只改需要改的内容
4. **禁止 Write**：不得用 Write 工具覆盖整个文件，不得从空白重新生成 HTML
5. **验证行数**：编辑后文件行数必须 ≥ 原始行数（新增内容会增加行数，不应大幅减少）

### 什么情况才允许重写？

只有在用户明确说"我知道会丢失现有样式，请从头生成新版本"时，才可以整体重写。普通的"更新教程中心"指令 = 增量更新，不是重写。

---

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

#### 已知技能列表（技能 Tab 展示顺序）

| 命令 | 名称 | 分类 | 说明 |
|------|------|------|------|
| `/ai-pm` | AI_PM 主控 | 产品 | 完整产品流程，从需求到原型 |
| `/ai-pm-priority` | 需求优先级评估 | 产品 | 批量评分、排序、生成回复模板 |
| `/ai-pm-weekly` | 工作周报 | 产品 | 自动整理工作内容，生成结构化周报 |
| `/ai-pm-interview` | 现场调研 | 产品 | 线下客户访谈，实时生成 PRD |
| `/ai-pm-data` | 数据洞察 | 数据 | 数据分析、仪表盘、需求发现 |
| `/ai-pm-persona` | 产品分身 | 产品 | 学习写作风格，让 AI 像你一样写 PRD |
| `/ai-pm-design-spec` | 设计规范 | 设计 | 加载公司 UI 规范，统一原型风格 |
| `/ai-pm-knowledge` | 产品知识库 | 工具 | 沉淀经验，搜索历史决策 |
| `/ai-pm-analyze` | 需求分析 | 产品 | 深入分析需求，挖掘用户画像 |
| `/ai-pm-research` | 竞品研究 | 产品 | 市场对标，识别差异化机会 |
| `/ai-pm-story` | 用户故事 | 产品 | 生成用户故事和验收标准 |
| `/ai-pm-prd` | PRD 生成 | 产品 | 输出完整产品需求文档 |
| `/ai-pm-prototype` | 原型生成 | 设计 | 生成可交互 HTML 原型 |
| `/ai-pm-review` | 需求评审 | 产品 | 六角色评审（产品/设计/前端/后端/测试/运营），支持多轮迭代 |
| `/agent-team` | 多代理引擎 | 协作 | 内部引擎，通常由 `/ai-pm --team` 触发，也可直接调用 |
| `/tutorial-center-update` | 教程中心更新 | 工具 | 扫描技能，生成离线 HTML 教程 |

**注意**：不包含 `ai-pm-config`（已移除）。扫描到未在上表中的 SKILL.md 时，按文件元数据自动补充到列表末尾。

### Phase 2: 更新 HTML（增量）

**执行前必做**：
```
1. Read AI_PM_教程中心.html → 记录行数（期望 1700+）
2. 对比差异：
   - 新增/删除了哪些 skill 卡片？
   - persona / 版本号是否变更？
   - 导航锚点是否需要调整？
3. 仅对有差异的部分执行 Edit
```

**常见增量操作示例**：

| 需要更新的内容 | 操作 | 注意事项 |
|--------------|------|---------|
| 新增 skill 卡片 | Edit：在对应 tab 末尾插入新 `<div class="skill-card">` | 复制相邻卡片格式，data-delay 递增 |
| 修改 persona 说明 | Edit：找到 hero 中的 badge 文本，局部替换 | 保留 animation/style 不变 |
| 更新版本号 | Edit：找 `v2.x.x` 字符串，精准替换 | 同步更新 footer + changelog |
| 删除 skill | Edit：删除对应 `<div class="skill-card">` 块 | 不影响其他卡片的 data-delay |

**如需了解现有 HTML 的完整结构**（如首次接触此文件），参考以下骨架：
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
- [ ] 文件行数 ≥ 更新前行数（增量编辑不会大幅减少行数）
- [ ] 文件存在
- [ ] 无 CDN 依赖
- [ ] 无本地文件引用
- [ ] 原生 JS（无 Vue/React/Angular）
- [ ] CSS Variables 完整
- [ ] 技能数据完整
- [ ] HTML 标签平衡

**运行时检查**（可选，用 Playwright MCP）：
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
- [references/design-system.md](./references/design-system.md) - 字体/排版/关键组件 CSS 规范（需要调试样式时读取）
- [references/interactions.md](./references/interactions.md) - Scroll Reveal / ScrollSpy / 时钟 JS 实现（需要调试交互时读取）
- [agent-review.md](./agent-review.md) - Agent Team 调优流程（可选）

## 故障排查

| 问题 | 原因 | 解决 |
|-----|------|------|
| **更新后页面大幅简化，组件丢失** | 用 Write 整体重写了 HTML | 从备份恢复（`AI_PM_教程中心V2.html`），改用 Edit 增量编辑 |
| 更新后行数从 1700+ 降至 600- | 同上，整体重写 | 同上 |
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

### Editorial Endfield 排版原则

详细排版规范、字体表、关键组件 CSS 见 → [`references/design-system.md`](./references/design-system.md)

**关键约束速查**：
- 步骤卡片网格必须用 `auto-fit`（不能用 `auto-fill`，否则宽屏留白）
- 最低可读字号 **10px**（装饰性全大写标签）；正文最低 **12px**
- 字体栈：正文/标题用 `--font-sans`，命令/代码用 `--font-mono`
- Section 英文标签：quickstart→`GETTING STARTED`，skills→`SKILL MANIFEST`，workflow→`OPERATION FLOW`

## 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| 5.1 | 2026-03-11 | 像素级对齐终末地实测值：yellow #fffa00、dark #191919、text #141414；双语 Section 标题系统（label-block 滑入 + sec-cn 淡入）；双层 ScrollReveal（headers/content 分离）；导航 _navLock 机制修复最后 section 不高亮；全页字号审查（清除所有 9px，最低 10px）；steps-grid auto-fill→auto-fit |
| 5.0 | 2026-03-11 | 设计语言迁移至终末地官网 Editorial × 精工细节：白底、大字、// 斜杠、黄色实色块、锚点滚动替代 Tab 导航 |
| 4.0 | 2026-03-11 | 构成主义×包豪斯×明日方舟风格重设计（已废弃）|
| 3.0 | 2026-03-03 | 纯原生架构，Tab 导航，Scroll Reveal，键盘/触摸支持 |
| 2.1 | 2026-03-03 | Vue 3 + CDN 架构（已废弃）|
| 2.0 | 2026-03-03 | 完全内联架构（已废弃）|
| 1.0 | 2026-03-01 | 初始版本 |

---

**关键原则**: 生成的 HTML 必须是**纯原生、零依赖**的单一文件，完全离线可用。设计风格固定为**终末地官网 Editorial × 精工细节**：白底大字、`//` 斜杠、黄色实色块、深色页脚，不得使用扫描线、菱形、深蓝黑导航等旧游戏 HUD 元素。
