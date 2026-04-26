---
id: PLAYBOOK-002
category: playbooks
tags: [Chart.js, 气泡图, 数据标签, 内联插件]
source-project: 手阅融合洞察-20260305
created: 2026-03-05
confidence: high
---

# Chart.js 4.x 气泡图添加数据标签的正确做法

## 问题场景

Chart.js 4.x 气泡图没有内置数据标签，不加标签时悬浮才能看到是哪个数据点，不直观。外部 `chartjs-plugin-datalabels` 需要额外引入，且气泡图支持有限。

## 解决方案：内联插件 afterDatasetsDraw

不引入额外库，用 Chart.js 4.x 的内联插件机制，在图表绘制完成后用 Canvas API 手动绘制文字：

```javascript
const bubbleLabelPlugin = {
  id: 'bubbleLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    const pts = chart.data.datasets[0].data;  // 原始数据，含 r 值
    ctx.save();
    ctx.font = '11px -apple-system,"PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(29,29,31,0.8)';  // 浅色模式用深色文字
    meta.data.forEach((el, i) => {
      // el.x, el.y 是像素坐标（不是数据坐标）
      // pts[i].r 是气泡半径（像素）
      ctx.fillText(labels[i], el.x, el.y - pts[i].r - 3);
    });
    ctx.restore();
  }
};

// 注册方式：放在 chart config 的顶层 plugins 数组，不是 options.plugins
const chart = new Chart(canvas, {
  type: 'bubble',
  data: {...},
  options: {...},
  plugins: [bubbleLabelPlugin]   // ← 顶层，不是 options 里
});
```

## 关键注意点

1. **`plugins` 在顶层，不在 `options` 里** — `options.plugins` 是配置内置插件（legend/tooltip 等）；`plugins: []` 是注册自定义插件
2. **`el.x / el.y` 是像素坐标**，不是数据值；`pts[i].r` 才是气泡半径（像素）
3. **标签位置**：`el.y - r - 3` 放气泡正上方 3px；小气泡时效果好，大气泡可放内部（改 `textBaseline: 'middle'`，颜色换白色）
4. **深色模式**文字色用 `rgba(232,234,246,0.9)`，浅色模式用 `rgba(29,29,31,0.8)`

## 验证数据

汉川一中学科对比仪表盘气泡图，9 个学科标签正确显示在各气泡上方。

## 适用场景

Chart.js 4.x 任何类型图表的自定义标签绘制，气泡图、散点图尤其适用。
