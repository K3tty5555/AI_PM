# Apple 设计规范布局系统

> 从 `generator.md` 外移（HTML 生成器的视觉规范单独成文，便于维护）。生成 HTML 时按本规范落 CSS 变量与布局约束。

## 8pt Grid 间距系统

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

## 视觉层次排版

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

## 布局原则

```markdown
1. 内容区最大宽度: 980px (桌面端)
2. 文本区最大宽度: 680px (阅读舒适区)
3. Section 间距: 80-100px
4. 卡片内边距: 24-32px
5. 元素间距: 16-24px
6. 使用 Grid 和 Flexbox 布局
7. 保持足够的留白空间
```

## 响应式断点

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
