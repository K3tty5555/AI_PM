# HTML 生成器规范

## 目标

生成**纯原生、零依赖**的教程中心单一 HTML 文件：
- ✅ 零 JavaScript 框架依赖
- ✅ 零外部 CDN 依赖
- ✅ 完全离线可用
- ✅ Tab 导航系统
- ✅ Scroll Reveal 动画
- ✅ 键盘/触摸交互
- ✅ 双击即可打开

## 技术栈

| 组件 | 方案 | 说明 |
|------|------|------|
| 交互框架 | 原生 JavaScript | IIFE 封装，无全局污染 |
| 动画系统 | CSS3 + IntersectionObserver | 滚动揭示动画 |
| 样式系统 | CSS Variables | 主题色动态切换 |
| 导航 | Tab + 进度条 | 5个Tab + 顶部进度指示器 |

## Apple 设计规范布局系统

### 8pt Grid 间距系统

```css
:root {
  /* 基础间距 - 8pt Grid */
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

  /* 布局约束 */
  --content-width: 980px;      /* 内容区最大宽度 */
  --text-max-width: 680px;      /* 文本区最大宽度 */
  --section-gap: 100px;         /* Section 间距 80-100px */
  --card-padding: 32px;         /* 卡片内边距 24-32px */
  --element-gap: 20px;          /* 元素间距 16-24px */
}
```

### 视觉层次排版

```css
:root {
  /* 大标题 - Hero */
  --text-hero: clamp(48px, 8vw, 64px);
  --weight-hero: 700;
  --tracking-hero: -0.03em;
  --leading-hero: 1.05;

  /* 中标题 - Section */
  --text-section: clamp(32px, 5vw, 40px);
  --weight-section: 600;
  --tracking-section: -0.02em;
  --leading-section: 1.1;

  /* 小标题 - Card */
  --text-card: 21px;
  --weight-card: 600;
  --tracking-card: -0.01em;
  --leading-card: 1.25;

  /* 正文 */
  --text-body: 17px;
  --leading-body: 1.5;
  --text-body-sm: 15px;
}
```

### 布局原则

```markdown
1. 内容区最大宽度: 980px (桌面端)
2. 文本区最大宽度: 680px (阅读舒适区)
3. Section 间距: 80-100px
4. 卡片内边距: 24-32px
5. 元素间距: 16-24px
6. 使用 Grid 和 Flexbox 布局
7. 保持足够的留白空间
```

### 响应式断点

```css
/* 桌面端 */
@media (min-width: 1024px) {
  --content-width: 980px;
}

/* 平板 */
@media (max-width: 1024px) {
  --content-width: 90vw;
}

/* 手机横屏 */
@media (max-width: 768px) {
  --content-width: 100%;
  .section { padding: var(--space-16) 0; }
  .hero h1 { font-size: 36px; }
  .grid { grid-template-columns: 1fr; }
}

/* 手机竖屏 */
@media (max-width: 480px) {
  .container { padding: 0 var(--space-4); }
  .hero { padding: var(--space-12) var(--space-4); }
}
```

## 生成步骤

### Step 1: CSS 变量系统

```css
:root {
  /* Typography - Apple System Fonts */
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SF Mono", SFMono-Regular, ui-monospace, Menlo, monospace;

  /* Apple Color Palette */
  --bg-primary: #fbfbfd;
  --bg-secondary: #f5f5f7;
  --white: #ffffff;
  --text-primary: #1d1d1f;
  --text-secondary: #86868b;
  --text-tertiary: #6e6e73;
  --divider: rgba(0, 0, 0, 0.08);

  /* Tab 主题色 */
  --accent-1: #0071e3; /* 蓝 - 首页 */
  --accent-2: #ff9500; /* 橙 - 技能 */
  --accent-3: #34c759; /* 绿 - 指南 */
  --accent-4: #af52de; /* 紫 - 工作流 */
  --accent-5: #ff2d55; /* 红 - 关于 */
  --accent: var(--accent-1);

  /* 8pt Grid Spacing */
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

  /* Layout */
  --content-width: 980px;
  --text-max-width: 680px;
  --section-gap: 100px;

  /* Animation */
  --ease-out: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 暗色模式 (Apple 标准) */
[data-theme="dark"] {
  /* 背景 */
  --bg-primary: #000000;
  --bg-secondary: #1c1c1e;
  --bg-tertiary: #2c2c2e;
  --white: #1c1c1e;

  /* 文字 */
  --text-primary: #f5f5f7;
  --text-secondary: #98989d;  /* 注意：不是简单的 #86868b */
  --text-tertiary: #6e6e73;

  /* 边框 */
  --divider: rgba(255, 255, 255, 0.15);
  --divider-subtle: rgba(255, 255, 255, 0.08);

  /* 导航栏背景 */
  --nav-bg: rgba(30, 30, 30, 0.72);

  /* 暗色模式阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.6);
  --shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.7);
}
```

### Step 2: Scroll Reveal 动画

```css
/* 滚动揭示动画 */
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s var(--ease), transform 0.6s var(--ease);
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* 延迟动画 */
.reveal-delay-1 { transition-delay: 0.1s; }
.reveal-delay-2 { transition-delay: 0.2s; }
.reveal-delay-3 { transition-delay: 0.3s; }

/* 交错动画 */
.stagger .reveal {
  transition-delay: calc(var(--i, 0) * 0.1s);
}
```

### Step 3: Tab 导航样式

```css
/* 导航栏 */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: rgba(251, 251, 253, 0.8);
  backdrop-filter: blur(20px);
  z-index: 1000;
  border-bottom: 1px solid var(--divider);
}

/* Tab 按钮 */
.nav-tab {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.3s var(--ease);
}

.nav-tab:hover {
  color: var(--text-primary);
}

.nav-tab.active {
  color: var(--accent);
  background: rgba(0, 0, 0, 0.04);
}

/* 进度条 */
.progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(0);
  z-index: 1001;
  transition: background 0.3s var(--ease);
}

/* Tab 面板 */
.tab-panel {
  display: none;
  opacity: 0;
  transition: opacity 0.4s var(--ease);
}

.tab-panel.active {
  display: block;
  opacity: 1;
}
```

### Step 4: 原生 JavaScript 架构

```javascript
(function() {
  'use strict';

  // ---- State ----
  let currentTab = 0;
  const tabCount = 5;
  const accentColors = [
    'var(--accent-1)', '#0071e3',  // 蓝
    'var(--accent-2)', '#ff9f0a',  // 橙
    'var(--accent-3)', '#30d158',  // 绿
    'var(--accent-4)', '#bf5af2',  // 紫
    'var(--accent-5)', '#ff375f'   // 红
  ];

  // ---- Elements ----
  const navTabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');
  const progressBar = document.getElementById('progressBar');

  // ---- Tab Switching ----
  window.switchTab = function(index) {
    if (index < 0 || index >= tabCount || index === currentTab) return;
    currentTab = index;

    // Update nav
    navTabs.forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    // Update panels
    panels.forEach((panel, i) => {
      if (i === index) {
        panel.classList.add('active');
        panel.style.display = 'block';
        requestAnimationFrame(() => {
          panel.style.opacity = '1';
        });
      } else {
        panel.style.opacity = '0';
        panel.classList.remove('active');
        panel.style.display = 'none';
      }
    });

    // Update theme color
    document.documentElement.style.setProperty('--accent', accentColors[index * 2]);
    progressBar.style.background = accentColors[index * 2 + 1];

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Re-observe reveals
    setTimeout(observeReveals, 100);
  };

  // ---- Event Listeners ----
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(parseInt(tab.dataset.tab)));
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') switchTab(currentTab + 1);
    if (e.key === 'ArrowLeft') switchTab(currentTab - 1);
  });

  // Touch swipe
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

  // Progress bar
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
    progressBar.style.transform = 'scaleX(' + Math.min(scrolled, 1) + ')';
  }, { passive: true });

  // Scroll Reveal
  function observeReveals() {
    const reveals = document.querySelectorAll('.tab-panel.active .reveal:not(.visible)');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach((el) => observer.observe(el));
  }

  // Init
  observeReveals();
})();
```

### Step 5: HTML 结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI_PM - AI 产品经理</title>

  <!-- CSS -->
  <style>
    /* CSS Variables */
    /* Reset */
    /* Typography */
    /* Components */
    /* Animations */
  </style>
</head>
<body>
  <!-- Progress Bar -->
  <div class="progress-bar" id="progressBar"></div>

  <!-- Navigation -->
  <nav class="nav" id="nav">
    <div class="nav-inner">
      <div class="nav-logo">AI_PM</div>
      <div class="nav-tabs" role="tablist">
        <button class="nav-tab active" data-tab="0" role="tab" aria-selected="true">首页</button>
        <button class="nav-tab" data-tab="1" role="tab" aria-selected="false">技能</button>
        <button class="nav-tab" data-tab="2" role="tab" aria-selected="false">指南</button>
        <button class="nav-tab" data-tab="3" role="tab" aria-selected="false">工作流</button>
        <button class="nav-tab" data-tab="4" role="tab" aria-selected="false">关于</button>
      </div>
    </div>
  </nav>

  <!-- Tab Panels -->
  <div class="tab-panels" id="tabPanels">

    <!-- Tab 1: 首页 -->
    <div class="tab-panel active" data-panel="0" data-accent="var(--accent-1)">
      <header class="hero">
        <div class="label reveal">AI_PM</div>
        <h1 class="reveal reveal-delay-1">AI 辅助产品管理工具集</h1>
        <p class="subtitle reveal reveal-delay-2">将简短需求转化为完整的产品方案</p>
        <!-- ... -->
      </header>
    </div>

    <!-- Tab 2: 技能 -->
    <div class="tab-panel" data-panel="1" data-accent="var(--accent-2)">
      <section class="section">
        <div class="section-header">
          <div class="label reveal">技能列表</div>
          <h2 class="reveal">所有技能</h2>
        </div>
        <div class="skill-grid stagger">
          <!-- Skill Cards -->
        </div>
      </section>
    </div>

    <!-- Tab 3: 指南 -->
    <div class="tab-panel" data-panel="2" data-accent="var(--accent-3)">
      <!-- Guide Content -->
    </div>

    <!-- Tab 4: 工作流 -->
    <div class="tab-panel" data-panel="3" data-accent="var(--accent-4)">
      <!-- Workflow Content -->
    </div>

    <!-- Tab 5: 关于 -->
    <div class="tab-panel" data-panel="4" data-accent="var(--accent-5)">
      <!-- Changelog & About -->
    </div>

  </div>

  <!-- JavaScript -->
  <script>
    (function() {
      'use strict';
      // Tab switching
      // Keyboard/Touch
      // Scroll Reveal
      // Progress bar
    })();
  </script>
</body>
</html>
```

## 自检机制

```javascript
const validation = {
  // 1. 结构检查
  checkStructure(html) {
    const checks = [
      { name: 'DOCTYPE', test: html.includes('<!DOCTYPE html>') },
      { name: 'Tab导航', test: html.includes('nav-tab') },
      { name: 'Tab面板', test: html.includes('tab-panel') },
      { name: '进度条', test: html.includes('progress-bar') },
      { name: 'Reveal动画', test: html.includes('reveal') }
    ];
    return checks;
  },

  // 2. 依赖检查
  checkDependencies(html) {
    const checks = [
      { name: '无Vue', test: !html.includes('vue.global.js') },
      { name: '无React', test: !html.includes('react') },
      { name: '无CDN', test: !html.includes('unpkg.com') },
      { name: '原生JS', test: html.includes('(function()') }
    ];
    return checks;
  },

  // 3. 交互特性检查
  checkFeatures(html) {
    const checks = [
      { name: 'Tab切换', test: html.includes('switchTab') },
      { name: '键盘支持', test: html.includes('ArrowRight') },
      { name: '触摸支持', test: html.includes('touchstart') },
      { name: 'ScrollReveal', test: html.includes('IntersectionObserver') },
      { name: '进度条', test: html.includes('scaleX') }
    ];
    return checks;
  }
};
```

## 输出检查清单

- [ ] 零框架依赖
- [ ] 零 CDN 依赖
- [ ] 5 个 Tab 完整
- [ ] CSS Variables 完整
- [ ] Scroll Reveal 动画
- [ ] 键盘导航支持
- [ ] 触摸滑动支持
- [ ] 进度条功能
- [ ] 主题色切换
- [ ] 无障碍属性（aria）

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Tab 不切换 | switchTab 未暴露 | 绑定到 window |
| 动画不生效 | reveal 类未添加 visible | 检查 IntersectionObserver |
| 进度条不动 | scroll 事件未触发 | 确保内容可滚动 |
| 主题色不切换 | CSS 变量名错误 | 检查 --accent |

