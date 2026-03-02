# AI_PM 教程中心 - 设计系统规范

## 1. 概述

本文档是 AI_PM 教程中心的唯一设计规范来源，所有后续更新必须遵循此规范。

## 2. 设计原则

### 2.1 Apple 设计语言
- **清晰**：文字清晰可读，图标精确传达含义
- **尊重**：利用全屏展示内容，不牺牲内容本身
- **深度**：使用层次和动态效果传达层级关系

### 2.2 核心体验
- 简洁的导航
- 清晰的层次结构
- 流畅的过渡动画
- 一致的品牌识别

## 3. 色彩系统

### 3.1 Apple 品牌色
```
--apple-blue: #0071e3
--apple-blue-hover: #0077ed
--apple-indigo: #5856d6
--apple-purple: #af52de
--apple-pink: #ff2d55
--apple-red: #ff3b30
--apple-orange: #ff9500
--apple-yellow: #ffcc00
--apple-green: #34c759
--apple-teal: #5ac8fa
--apple-cyan: #32ade6
```

### 3.2 中性色阶（Apple 标准）
```
--gray-01: #f5f5f7  (Light Background)
--gray-02: #e8e8ed  (Light Secondary)
--gray-03: #d2d2d7  (Light Border)
--gray-04: #86868b  (Light Text Secondary)
--gray-05: #6e6e73  (Light Text Tertiary)
--gray-06: #1d1d1f  (Light Text Primary)
```

### 3.3 语义化颜色 - 亮色模式
```
--bg-primary: #ffffff
--bg-secondary: #f5f5f7
--bg-tertiary: #fafafa
--text-primary: #1d1d1f
--text-secondary: #86868b
--text-tertiary: #6e6e73
--border-color: rgba(0,0,0,0.1)
```

### 3.4 语义化颜色 - 暗色模式（Apple 标准）
```
--bg-primary: #000000
--bg-secondary: #1c1c1e
--bg-tertiary: #2c2c2e
--text-primary: #f5f5f7
--text-secondary: #98989d  (注意：不是 #86868b)
--text-tertiary: #6e6e73
--border-color: rgba(255,255,255,0.15)
--separator-color: #38383a
```

### 3.5 暗色模式导航栏
```
--nav-bg: rgba(30,30,30,0.72)  (不是纯黑)
--nav-bg-solid: #1c1c1e
```

## 4. 字体系统

### 4.1 字体栈
```css
--font-stack: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--font-mono: 'SF Mono', SFMono-Regular, 'Courier New', monospace;
```

### 4.2 字体规范
| 样式 | 大小 | 字重 | 行高 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| Hero | 64px | 700 | 1.0625 | -0.009em | 首页大标题 |
| Eyebrow | 21px | 600 | 1.19048 | 0.011em | 小标题 |
| Headline | 48px | 700 | 1.08349 | -0.003em | 页面标题 |
| Intro | 28px | 600 | 1.14286 | 0.007em | 介绍文字 |
| Body | 21px | 400 | 1.381 | 0.011em | 正文 |
| Caption | 14px | 400 | 1.28577 | -0.016em | 辅助说明 |

## 5. 间距系统（8pt 网格）

```
--space-xs: 8px
--space-sm: 16px
--space-md: 24px
--space-lg: 32px
--space-xl: 48px
--space-2xl: 64px
--space-3xl: 96px
```

## 6. 圆角系统

```
--radius-sm: 8px   (按钮、小卡片)
--radius-md: 12px  (卡片、输入框)
--radius-lg: 18px  (大卡片)
--radius-xl: 28px  (Hero 区域)
--radius-full: 9999px  ( pills )
```

## 7. 阴影系统

### 7.1 亮色模式
```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04)
--shadow-md: 0 4px 16px rgba(0,0,0,0.08)
--shadow-lg: 0 12px 40px rgba(0,0,0,0.12)
--shadow-xl: 0 24px 64px rgba(0,0,0,0.16)
```

### 7.2 暗色模式
```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.4)
--shadow-md: 0 4px 16px rgba(0,0,0,0.5)
--shadow-lg: 0 12px 40px rgba(0,0,0,0.6)
--shadow-xl: 0 24px 64px rgba(0,0,0,0.7)
```

## 8. 组件规范

### 8.1 导航栏
- 高度：52px
- 背景：半透明毛玻璃效果
- 亮色：`rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px)`
- 暗色：`rgba(30,30,30,0.72)` + `backdrop-filter: blur(20px)`
- 底部边框：1px solid var(--border-color)

### 8.2 按钮

**主按钮**
- 背景：`var(--apple-blue)`
- 文字：白色
- 圆角：`var(--radius-full)`
- 内边距：18px 32px
- 字体：17px, font-weight: 500
- Hover：`var(--apple-blue-hover)` + scale(1.04)

**次按钮**
- 背景：透明
- 边框：2px solid `var(--apple-blue)`
- 文字：`var(--apple-blue)`
- Hover：填充背景色，白色文字

### 8.3 卡片
- 背景：`var(--bg-secondary)`
- 圆角：`var(--radius-xl)` (28px)
- 内边距：`var(--space-xl)` (48px)
- Hover：scale(1.02) + `var(--shadow-lg)`

### 8.4 模态框
- 遮罩：`rgba(0,0,0,0.5)` + `backdrop-filter: blur(10px)`
- 内容背景：`var(--bg-primary)`
- 圆角：`var(--radius-xl)`
- 最大宽度：560px

## 9. 主题切换规范

### 9.1 实现方式
- 使用 CSS 变量控制所有颜色
- 手动切换时通过 JS 修改 `:root` 变量
- 不再依赖 `prefers-color-scheme` 媒体查询
- 导航栏背景色也必须使用 CSS 变量

### 9.2 切换时必须更新的变量
```javascript
// 亮色模式
--bg-primary: #ffffff
--bg-secondary: #f5f5f7
--nav-bg: rgba(255,255,255,0.72)

// 暗色模式
--bg-primary: #000000
--bg-secondary: #1c1c1e
--nav-bg: rgba(30,30,30,0.72)
```

## 10. 动画规范

### 10.1 缓动函数
```
--ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94)
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### 10.2 持续时间
```
--duration-fast: 0.2s
--duration-normal: 0.4s
--duration-slow: 0.6s
```

### 10.3 标准过渡
```css
transition: all var(--duration-fast) var(--ease-out);
```

## 11. 响应式断点

- 桌面：> 1024px
- 平板：768px - 1024px
- 手机横屏：480px - 767px
- 手机竖屏：< 480px

## 12. 文案规范

### 12.1 标题层级
- 首页 Hero：AI_PM 或产品名称
- Eyebrow：简短描述（如"AI 辅助产品管理"）
- 页面标题：具体功能名称

### 12.2 写作风格
- 简洁明了
- 使用主动语态
- 避免技术术语（针对小白用户）
- 保持一致的语气和语调

## 13. 图标规范

- 使用 Emoji 或 SVG 图标
- 尺寸：卡片中 28-32px，导航中 20px
- 风格：线性或填充，保持一致

## 14. 更新记录

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-01 | 1.0 | 初始版本 |

---

**注意**：任何对教程中心的修改必须先参考此规范文件，确保设计一致性。
