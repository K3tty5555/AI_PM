---
id: PITFALL-002
category: pitfalls
tags: [Chart.js, JavaScript, 仪表盘, bug]
source-project: 手阅融合洞察-20260305
created: 2026-03-05
confidence: high
---

# Chart.js options 对象里写两个 plugins key，后者覆盖前者

## 问题场景

气泡图的 options 对象里，先写了 `plugins: { legend, tooltip }`，后来补充数据标签配置时又写了第二个 `plugins: { datalabels: null }`。结果 legend 和 tooltip 全部失效——气泡图没有 tooltip，图例也消失了。

## 根因

JavaScript 对象字面量里同名 key 会被后者覆盖：

```javascript
// 错误写法 ❌
options: {
  plugins: { legend: {display:false}, tooltip: {...} },  // 第一个
  scales: {...},
  plugins: { datalabels: null }   // 第二个 —— 覆盖了第一个！
}
```

```javascript
// 正确写法 ✅
options: {
  plugins: {
    legend: {display:false},
    tooltip: {...},
    // datalabels 如果不需要直接删掉，不要写 null
  },
  scales: {...},
}
```

## 怎么发现的

Legend 和 tooltip 突然不工作，检查 HTML 发现 options 里有两个 `plugins:` 行。

## 适用场景

任何 Chart.js 图表。复制粘贴代码时尤其容易出现——从其他图表复制了 plugins 配置块，忘了合并。
