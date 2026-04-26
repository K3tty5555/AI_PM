---
id: PLAYBOOK-001
category: playbooks
tags: [仪表盘, 数据洞察, 考试, 作业, Chart.js, Apple-HIG]
source-project: 手阅融合洞察-20260305
created: 2026-03-05
confidence: high
---

# 考试+作业双端数据洞察仪表盘设计模式

## 问题场景

拿到学校维度的考试和作业双端 Excel 数据，需要生成一张给领导或运营团队看的数据洞察仪表盘，内容包含考试侧、作业侧、两端对比三个维度，且不同受众关注点不同（文科 vs 理科，只看考试 vs 只看作业）。

## 解决方案

### 标准 Tab 结构（4 个）

```
融合全景 / 考试视角 / 作业视角 / 学科对比
```

- **融合全景**：4 KPI + 融合就绪度矩阵（9 学科 × 多维度）+ 机会点卡片（按紧迫程度分组）
- **考试视角**：学科手阅率横向柱图 + 年度趋势对比 + 月度趋势折线 + 规模效应 + 引入前后对比 + 场景饼图
- **作业视角**：使用深度漏斗（下载→扫描→讲评→查看报告）+ 讲评 vs 报告率对比 + 热力表
- **学科对比**：双轴图（考试手阅率 + 作业讲评率）+ 智批改能力矩阵 + 气泡图（作业量×讲评率×手阅率）

### 学科筛选栏

放在 Tab 栏下方，全景 Tab 时隐藏，其余 Tab 显示：

```
全部 | 理科 文科 | 数学 物理 化学 生物 | 语文 英语 历史 地理 政治
```

筛选状态更新图表数据（不重建图表，只 `.update()`）。

### 懒初始化（关键）

图表只在对应 Tab 首次激活时初始化，避免隐藏 canvas 宽度为 0 的问题：

```javascript
let exInit=false, hwInit=false, sjInit=false;
function sw(v) {
  // ...切换 display
  if (v === 'ex' && !exInit) { initEx(); exInit = true; }
  if (v === 'hw' && !hwInit) { initHw(); hwInit = true; }
  if (v === 'sj' && !sjInit) { initSj(); sjInit = true; }
  setTimeout(() => Object.values(charts).forEach(c => { try { c.resize(); } catch(e){} }), 30);
}
```

### 设计规范

- Apple HIG 浅色模式（领导汇报场景）
- 字体：`-apple-system, 'SF Pro Text', 'PingFang SC', sans-serif`
- 颜色：`--blue: #0066cc`、`--red: #ff3b30`、`--green: #28a745`、`--amber: #ff9500`
- 网格线：`rgba(209,209,214,.8)`
- `Chart.defaults.color = '#6e6e73'`

## 验证数据

汉川一中项目完整落地，4 Tab + 学科筛选 + 懒初始化均正常运行。

## 适用场景

智学网学校维度数据洞察，考试和作业双产品均有使用数据的学校。单产品学校可裁剪对比 Tab。
