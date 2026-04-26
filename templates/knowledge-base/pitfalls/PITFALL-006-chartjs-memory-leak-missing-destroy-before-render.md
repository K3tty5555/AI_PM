---
id: PITFALL-006
category: pitfalls
tags: [Chart.js, 仪表盘, 内存泄漏, renderXxx, destroyChart]
source-project: 手阅融合洞察-20260305
created: 2026-03-08
severity: critical
---

# Chart.js 内存泄漏：renderXxx 函数未在创建图表前销毁旧实例

## 症状

- Tab 切换后图表报错「Canvas is already in use. Chart with ID N must be destroyed before the canvas can be reused」
- 图表叠加：新数据渲染在旧图表上方，两套数据同时可见
- 图表数据不更新：筛选器变化后图表看起来没变化（实际是旧实例未销毁）
- 有时无报错，但内存随 Tab 切换次数持续增长

## 根因

每个 `<canvas>` 元素在同一时刻只能绑定一个 Chart.js 实例。每次调用 `renderXxx()` 重新创建图表时，如果未先销毁之前创建的实例，Chart.js 会报错或行为异常。

## 修复方式

### 1. 统一使用 `charts` 对象存储实例

```js
// ✅ 正确
charts['misuseProvince'] = new Chart(document.getElementById('chartMisuseProvince'), {...});

// ❌ 错误
new Chart(document.getElementById('chartMisuseProvince'), {...});
```

### 2. 每个 renderXxx 函数开头统一销毁本函数负责的图表

```js
function renderMisuse() {
  // 第一步：销毁所有本函数负责的 Chart 实例
  ['misuseProvince', 'misuseSubject', 'examTypes', 'trueRate'].forEach(id => destroyChart(id));

  // 后续正常逻辑...
  charts['misuseProvince'] = new Chart(...);
}
```

### 3. 复用已有的 destroyChart 辅助函数

项目 HTML 中已定义：
```js
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
```

## 检查清单

每次新增 `renderXxx()` 函数时确认：
- [ ] 函数顶部有 destroyChart 调用，覆盖本函数所有图表 ID
- [ ] 所有 `new Chart(...)` 都赋值给 `charts['id']`
- [ ] 图表 ID 在整个 HTML 中唯一

## 发现背景

手阅融合洞察仪表盘 v3 开发中，Tab 6 `renderMisuse()` 函数在重构时新增了 4 个图表但未添加 destroyChart 调用。代码审查（2026-03-08）发现后修复，修复前 Tab 6 每次切换都会泄漏 4 个 Chart 实例。
