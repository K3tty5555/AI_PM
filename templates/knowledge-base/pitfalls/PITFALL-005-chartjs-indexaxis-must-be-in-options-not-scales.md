---
id: PITFALL-005
category: pitfalls
tags: [Chart.js, 仪表盘, 横向条形图, indexAxis, 漏斗图]
source-project: 手阅融合洞察-20260305
created: 2026-03-05
confidence: high
---

# Chart.js 横向条形图的 indexAxis 必须在 options 顶层，放进 scales 无效

## 问题场景

封装了一个通用 `barChart(id, labels, datasets, scalesOpts)` 函数，默认把 scales 配置合并进去。画横向漏斗图时，把 `indexAxis: 'y'` 放进了 scales 对象里传入，或者 scales 的默认配置（y轴显示 % 的回调）把正确配置覆盖了。

结果：图表仍然纵向排列，y 轴标签上还出现了"%"后缀（因为 label 轴被当成 value 轴处理了）。

## 怎么躲

`indexAxis` 是 Chart.js options 的顶层属性，**不是 scales 的子属性**。

正确写法：

```javascript
new Chart(ctx, {
  type: 'bar',
  data: { labels: ['下载','扫描','讲评','查看报告'], datasets: [...] },
  options: {
    indexAxis: 'y',          // ← 必须在 options 顶层
    scales: {
      y: {                   // 此时 y 是「标签轴」，不要加 % 回调
        grid: { display: false },
        ticks: { font: { size: 12 } },
      },
      x: {                   // 此时 x 是「数值轴」
        grid: { color: '#e8e8ea' },
        min: 0, max: 100,
        ticks: { callback: v => v + '%', font: { size: 11 } },
      },
    },
  },
});
```

**通用 barChart 封装的处理方式**：横向图不能走通用路径，要单独 `new Chart` 或用特殊分支处理。

```javascript
// 不要这样（indexAxis 在 scales 里无效）：
barChart(id, labels, datasets, { scales: { indexAxis: 'y', ... } });

// 要这样（直接 new Chart 或在函数里特殊处理）：
if (charts[id]) charts[id].destroy();
charts[id] = new Chart(document.getElementById(id), {
  type: 'bar',
  options: { indexAxis: 'y', scales: { y: {...}, x: {...} } },
  ...
});
```

## 验证数据

作业使用漏斗图（下载→扫描→讲评→查看报告）修复后正常横向显示，x 轴正确显示 0-100%。

## 适用场景

Chart.js 4.x 所有横向条形图场景，包括：漏斗图、排名图、对比条形图。
