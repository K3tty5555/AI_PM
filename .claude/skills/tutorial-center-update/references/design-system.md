---
title: 设计系统组件规范
description: 字体、排版、关键组件的 CSS 实现细节
---

# 设计系统组件规范

> 从主 SKILL.md 提取的详细 CSS 实现规范，供生成/调试 HTML 时参考。

## 排版规范

最低可读字号：**10px**（装饰性全大写标签）；正文内容最低 **11px**；实际文字内容最低 **12px**。

| 样式 | 大小 | 字重 | 字体 | 用途 |
|------|------|------|------|------|
| Hero Display | `clamp(76px, 12.5vw, 164px)` | 900 | sans | Hero 主标题 |
| Section CN | `3rem`（响应式最小 2rem） | 900 | sans | 各 section 中文大标题（.sec-cn） |
| Section EN | `10px` + `letter-spacing: 4px` | bold | mono | 全大写装饰标签（.sec-en） |
| Card 标题 | 13-16px | 700 | sans/mono | 技能卡片命令（13px）、步骤标题（14px） |
| Body | 14-15px | 400 | sans | 正文说明 |
| 工作流节点名 | 13px | 600 | sans | .tl-name |
| 命令/Tag/Cmd | 10-12px | bold | mono | .tl-cmd 11px，.skill-tab 12px |
| 辅助标签 | 10px | bold | mono | 全大写装饰性标签，最低下限 |

**禁止**：任何可读内容使用 9px 或以下。

**字体栈**：
```css
--font-sans: -apple-system, 'PingFang SC', sans-serif;  /* 标题、正文、section */
--font-mono: 'Courier New', 'Consolas', monospace;       /* 命令、代码、标签 */
```

## 关键组件 CSS 规范

### 导航栏

```css
#hud-nav {
  height: 54px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
  /* nav tabs 用 font-mono + uppercase + letter-spacing: 1.5px */
}
.hud-tab.active::after {
  background: var(--yellow);  /* 2px 下划线，非整个 tab 高亮背景 */
  bottom: 0; height: 2px;
}
```

### 技能卡片（hover 黄色底 + 上移）

```css
.skill-card:hover {
  background: var(--yellow-dim);  /* rgba(255,215,0,0.08) */
  transform: translateY(-3px);
  border-color: rgba(255,215,0,0.3);
}
```

### 黄色标签块（实色，非描边）

```css
.step-tag, .tag-block, .skill-tag {
  background: var(--yellow);      /* 实色黄底 */
  color: #000;
  font-family: var(--font-mono);
  font-size: 9px; letter-spacing: 2px; font-weight: bold;
  padding: 3px 10px;
  /* 无 border-radius，直角感 */
}
```

### 双语 Section 标题（仿终末地 SectionTitle 组件）

```html
<div class="sec-header" id="sh-xx">
  <!-- 1. // + EN 标签：从左 -28px 滑入 -->
  <div class="sec-label-block">
    <span class="sec-sl">//</span>
    <span class="sec-en">SECTION ENGLISH NAME</span>
  </div>
  <!-- 2. 中文大标题：从下 14px 淡入 -->
  <h2 class="sec-cn">章节名称</h2>
</div>
```

```css
/* 标签行：从左滑入 */
.sec-label-block {
  display: inline-flex; align-items: center; gap: 8px;
  height: 2rem; margin-bottom: 10px;
  transform: translateX(-28px); opacity: 0;
  transition: transform 0.5s ease-out, opacity 0.35s ease;
}
.sec-header.sh-in .sec-label-block { transform: translateX(0); opacity: 1; }

.sec-sl { font-weight: 900; font-size: 18px; color: var(--yellow); letter-spacing: -2px; }
.sec-en { font-family: var(--font-mono); font-size: 10px; letter-spacing: 4px; text-transform: uppercase; }

/* 中文标题：从下淡入，0.18s 延迟 */
.sec-cn {
  display: block; font-size: 3rem; font-weight: 900;
  line-height: 1; letter-spacing: -0.03em;
  opacity: 0; transform: translateY(14px);
  transition: opacity 0.55s ease 0.18s, transform 0.55s ease 0.18s;
}
.sec-header.sh-in .sec-cn { opacity: 1; transform: translateY(0); }

/* 响应式 */
@media (max-width: 480px) { .sec-cn { font-size: 2.4rem; } }
@media (max-width: 380px) { .sec-cn { font-size: 2rem; letter-spacing: -0.02em; } }
```

各 section 对应英文标签：
- `#quickstart` → `GETTING STARTED`
- `#skills` → `SKILL MANIFEST`
- `#workflow` → `OPERATION FLOW`

### HUD 精工框（四角 L 装饰）

```css
.hud-box { border: 1px solid var(--border); padding: 44px; position: relative; }
.hud-corner { position:absolute; width:12px; height:12px; border-color: var(--yellow); border-style: solid; }
.hud-corner.tl { top:8px; left:8px; border-width:1.5px 0 0 1.5px; }
/* 无填充背景，边框 + 角标即可 */
```

## 布局原则

- 内容区最大宽度：1200px
- 导航高度：54px，白色背景，`border-bottom: 1px solid var(--border)`
- 技能卡片网格：`repeat(auto-fill, minmax(280px, 1fr))`，gap 20px
- 步骤卡片网格：`repeat(auto-fit, minmax(280px, 1fr))`，gap 36px（**必须用 `auto-fit`**）
- 响应式断点：900px（中）、480px（小）
