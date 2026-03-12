---
title: 交互特性实现参考
description: Scroll Reveal、ScrollSpy、实时时钟的 JS 实现细节
---

# 交互特性实现参考

> 从主 SKILL.md 提取的 JS 实现细节，供生成/调试 HTML 时参考。

## 1. Scroll Reveal 双层动画

页面使用**两套独立 Observer**，阈值不同，产生层次感：

```javascript
/* 层一：Section 标题（threshold 0.25，较高，标题完整进入后触发） */
const shObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('sh-in'); shObs.unobserve(e.target); }
  });
}, { threshold: 0.25 });
document.querySelectorAll('.sec-header').forEach(el => shObs.observe(el));

/* 层二：Section 内容（threshold 0.1，较低，刚进入视口即触发） */
const srObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('sr-in'); srObs.unobserve(e.target); }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.sec-reveal').forEach(el => srObs.observe(el));
```

标题动画由 `.sh-in` 触发（label-block 滑入 + sec-cn 淡入），内容动画由 `.sr-in` 触发：

```css
.sec-reveal { opacity: 0; transform: translateY(24px);
  transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s, transform 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s; }
.sec-reveal.sr-in { opacity: 1; transform: translateY(0); }
```

## 2. 导航滚动定位（ScrollSpy）

MAP 按页面从上到下排列，`forEach` 最后一个满足条件的 section 胜出（最深）：

```javascript
let _navLock = false;

function scrollToSec(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
  /* 立即高亮 + 锁定 900ms，防止 scroll 事件覆盖（尤其最后一个 section） */
  document.querySelectorAll('.hud-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.sec === id));
  _navLock = true;
  setTimeout(() => { _navLock = false; }, 900);
}

(function() {
  const MAP = [
    { id: 'quickstart', tabSec: 'quickstart' },
    { id: 'skills',     tabSec: 'skills' },
    { id: 'workflow',   tabSec: 'workflow' }   /* 必须保持从上到下顺序 */
  ];
  function onScroll() {
    if (_navLock) return;
    const y = window.scrollY + 80; let active = 'quickstart';
    MAP.forEach(({ id, tabSec }) => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= y) active = tabSec;
    });
    document.querySelectorAll('.hud-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.sec === active));
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
})();
```

> **注意**：最后一个 section（workflow）因页面可能滚不到底，直接滚动时 offsetTop 条件可能永远不满足。`_navLock` 机制确保点击后高亮不被覆盖。

## 3. 实时时钟

```javascript
(function clock() {
  const el = document.getElementById('hud-clock');
  if (!el) return;
  function tick() {
    const now = new Date();
    el.textContent = now.toTimeString().slice(0,8);
  }
  tick(); setInterval(tick, 1000);
})();
```
