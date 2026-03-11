---
name: ai-pm-data
description: 数据分析技能。提供数据指标设计、数据洞察分析、仪表盘生成三大能力。从数据中发现产品需求和优化机会。
argument-hint: "[数据文件路径 | 命令: insight/metrics/dashboard]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(python3)
---

# ai-pm-data — 数据分析技能

## 命令路由

根据 $ARGUMENTS 路由：

| 输入 | 执行 |
|------|------|
| `metrics` | 数据指标设计 |
| `insight {文件路径}` | 数据洞察分析 |
| `dashboard` | 项目仪表盘 |
| 直接传入文件路径 | 自动执行 insight |
| 无参数 | 显示帮助 |

---

## 1. metrics — 数据指标设计

基于 PRD 设计指标体系、埋点方案。

**用法**:
```
/ai-pm data metrics           # 读取当前项目 PRD
/ai-pm data metrics abtest    # 追加 A/B 测试设计
```

**流程**:
```
读取 05-prd/05-PRD-v1.0.md
    ↓
提取可量化目标
    ↓
设计指标体系（北极星 → 一级 → 二级 → 过程指标）
    ↓
设计埋点方案（事件名、属性、触发时机）
    ↓
输出 09-analytics-requirement.md
```

**输出**: `{项目目录}/09-analytics-requirement.md`

---

## 2. insight — 数据洞察分析

上传数据文件（Excel/CSV），通过 EDA 发现业务洞察。

**用法**:
```
/ai-pm data insight ./data.xlsx
/ai-pm data insight ./data.csv --focus=conversion
```

**分析步骤**:
1. 数据探索 — 加载文件，检查结构、字段、缺失值
2. 关键指标 — 描述统计、分布特征
3. 异常检测 — 识别异常值、数据质量问题
4. 趋势分析 — 时间序列、周期性规律
5. 产品洞察 — 提炼可操作的产品改进建议

**强制规范 — Excel 读取**:
```python
# 必须用 data_only=True，否则读到的是公式而非值
import openpyxl
wb = openpyxl.load_workbook(file_path, data_only=True)
```

**执行方式**: 用 python3 直接执行分析脚本，脚本写入结果文件后退出。

**输出**:
- `{项目目录}/10-data-insight-report.md` — 洞察报告（含 Top 3 洞察摘要）
- `{项目目录}/11-data-driven-requirements.md` — 数据驱动需求
- `{项目目录}/12-data-insight-dashboard/index.html` — 可视化仪表盘

---

## 3. dashboard — 项目仪表盘

生成当前项目的全景视图 HTML，展示进度和关键指标。

**用法**:
```
/ai-pm data dashboard
```

**输出**: `{项目目录}/12-data-insight-dashboard/index.html`

---

## HTML 仪表盘规范

数据仪表盘为展示型产物，默认使用 **AI 情境定制**：分析汇报场景、受众和数据类型后自主选择设计风格，确保有记忆点。若项目已加载公司规范（`templates/ui-specs/.active-spec`），则优先使用公司规范。

**Chart.js 规范**:
```javascript
// indexAxis:'y' 必须在 options 顶层，不能放在 scales 里
{
  type: 'bar',
  data: { ... },
  options: {
    indexAxis: 'y',   // ← 正确位置：options 顶层
    scales: {
      x: { ... },
      y: { ... }
    }
  }
}
```

**卡片样式**:
```css
.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
```

**布局**: CSS Grid，响应式，最大宽度 1200px，左右 padding 24px。

---

## 分析维度参考

- 用户行为：活跃度、留存率、转化漏斗
- 用户分层：RFM 模型、生命周期阶段、价值分层
- 时间模式：日/周/月趋势、时段分布、季节性
- 异常检测：突变点、离群值、数据质量问题

---

## Anti-Pattern

- Excel 文件不用 `data_only=True` → 读到公式字符串
- `indexAxis:'y'` 放在 `scales` 里 → 图表渲染错误
- 仪表盘设计方向不明确，沦为通用 AI 审美（蓝白配色 + 圆角卡片）
- 分析结论不落到具体产品建议（只描述数据，不给洞察）
