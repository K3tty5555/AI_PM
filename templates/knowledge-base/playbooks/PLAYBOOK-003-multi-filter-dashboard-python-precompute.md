---
id: PLAYBOOK-003
category: playbooks
tags: [仪表盘, 数据洞察, 多维筛选, Python, Chart.js, 性能, 架构]
source-project: 手阅融合洞察-20260305
created: 2026-03-05
confidence: high
---

# 多维筛选仪表盘：Python 按筛选器预聚合，HTML 只做取用渲染

## 问题场景

仪表盘需要支持 13 个筛选维度（4 个学科组 + 9 个单科），每个筛选维度下月度趋势、作业漏斗、KPI、分布直方图等图表都要联动更新。

如果在 JS 里实时过滤 485,273 条数据，每次切换筛选器都会卡顿；如果把原始 JSON 全量内嵌，文件体积爆炸；如果只内嵌"全部"数据，筛选器无法真正联动。

## 解决方案

**在 Python 分析脚本中，按所有筛选键预先聚合所有需要的数据。**

### 筛选键映射

```python
FILTER_SUBJECTS = {
    '全部': ['英语','数学','物理','语文','化学','生物','历史','政治','地理'],
    '文科': ['语文','历史','政治','地理'],
    '理科': ['数学','物理','化学','生物'],
    '英语': ['英语'],
    '语文': ['语文'], '历史': ['历史'], ... # 9 个单科
}
```

### 预聚合数据结构

```python
# 1. 每学科的原子数据（只遍历一次原始数据）
subj_monthly  = defaultdict(lambda: defaultdict(lambda: {hb_hand:0, hb_web:0, js_hand:0, js_web:0}))
subj_kpi      = defaultdict(lambda: {hb_hand:0, hb_web:0, js_hand:0, js_web:0})
subj_funnel   = defaultdict(lambda: {hb: {...}, js: {...}})
school_subj   = defaultdict(lambda: defaultdict(lambda: {hand:0, web:0}))

# 2. 按筛选键聚合（O(13×12) 的聚合，不再扫原始数据）
monthly_by_filter = {}  # filter_key → [{month, hb_rate, js_rate}, ...]
kpi_by_filter     = {}  # filter_key → {hb_hr, js_hr, hb_exam, js_exam}
funnel_by_filter  = {}  # filter_key → {hb: {total, dl_pct, ...}, js: {...}}
dist_by_filter    = {}  # filter_key → {hb_bins, js_bins, hb_mean, ...}
```

### HTML 端：取用不计算

```javascript
// JS 只做索引取用，不做任何聚合
function updateT1(filter) {
    const kpi     = D.kpi_by_filter[filter];      // 直接取
    const monthly = D.monthly_by_filter[filter];  // 直接取
    const dist    = D.dist_by_filter[filter];     // 直接取
    // 更新图表...
}
```

### 文件大小对比

| 方案 | JSON 大小 | 切换响应 |
|------|----------|---------|
| 内嵌原始数据，JS 实时计算 | >5MB，极慢 | 500ms+ |
| 只内嵌"全部"，筛选失效 | 50KB | — |
| **Python 预聚合（本方案）** | **76KB** | **<16ms** |

## 筛选器 UI 设计

两行布局，学科组和单科分开，避免 1 行挤满 13 个 chip：

```html
<div class="filter-row">
    <span class="filter-label">学科组</span>
    [全部] [文科] [理科] [英语]
</div>
<div class="filter-row">
    <span class="filter-label">单科</span>
    [语文] [历史] [政治] [地理] ∣ [数学] [物理] [化学] [生物]
</div>
```

单科与其所属组之间用小竖线 `∣` 分隔，视觉上分组。

## 单科 → OPP_CARDS 的映射

产品方向卡片按"组"标注关联性，切换单科时用 `SUBJ_TO_GROUP` 转换后判断：

```javascript
const SUBJ_TO_GROUP = { '数学':'理科', '物理':'理科', ..., '语文':'文科', ... };
function filterGroup(filter) {
    if (['全部','文科','理科','英语'].includes(filter)) return filter;
    return SUBJ_TO_GROUP[filter] || '全部';
}
// 选"数学"→ 高亮"理科"相关的卡片
```

## 验证数据

湖北+江苏双省 485,273 行考试数据 + 174,600 行作业数据，13 个筛选维度，HTML 文件 165KB，切换响应流畅无卡顿。

## 适用场景

任何需要多维筛选的静态数据洞察仪表盘，数据规模在 10 万行以上时必须预聚合。
