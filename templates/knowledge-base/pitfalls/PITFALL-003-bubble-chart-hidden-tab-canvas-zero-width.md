---
id: PITFALL-003
category: pitfalls
tags: [Chart.js, 仪表盘, Tab切换, 气泡图, canvas]
source-project: 手阅融合洞察-20260305
created: 2026-03-05
confidence: high
---

# 气泡图（或任何 Chart.js 图表）在隐藏 Tab 初始化时 canvas 宽度为 0

## 问题场景

仪表盘有多个 Tab，切换时通过 `display:none/block` 控制显示。如果在页面加载时同时初始化所有图表，隐藏 Tab 里的 canvas 元素宽度为 0，Chart.js 无法正确计算布局，图表渲染异常或完全空白。

## 解决方案：懒初始化

只在 Tab 首次激活时初始化对应图表：

```javascript
let exInit=false, hwInit=false, sjInit=false;

function sw(v) {
  // 切换显示
  document.querySelectorAll('.view').forEach(e => e.classList.remove('active'));
  document.getElementById(v).classList.add('active');

  // 懒初始化
  if (v === 'ex' && !exInit) { initEx(); exInit = true; }
  if (v === 'hw' && !hwInit) { initHw(); hwInit = true; }
  if (v === 'sj' && !sjInit) { initSj(); sjInit = true; }

  // Tab 切换后 resize，确保已存在图表尺寸正确
  setTimeout(() => {
    Object.values(charts).forEach(c => { try { c.resize(); } catch(e){} });
  }, 30);
}
```

## 为什么要 setTimeout

`display:block` 的 DOM 更新是同步的，但浏览器的 layout reflow（canvas 实际获得宽度）需要微任务或下一帧。30ms 的 setTimeout 给浏览器足够时间完成 layout，再触发 resize。

## 适用场景

所有含 Tab 切换的 Chart.js 仪表盘。与使用 `visibility:hidden` 或 `opacity:0` 方案不同——后者 canvas 有宽度，不需要懒初始化。
