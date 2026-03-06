---
name: ai-pm-data
description: >-
  AI_PM 统一数据技能。提供数据指标设计、数据洞察分析、项目仪表盘三大能力。
  整合原 ai-pm-analytics、ai-pm-data-insight、ai-pm-dashboard 功能。
argument-hint: "[metrics|insight|dashboard] [参数]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cat) Agent
---

# ai-pm-data - 统一数据技能

> 整合数据分析、数据洞察、项目仪表盘三大能力

## 快速开始

```bash
# 设计数据指标（基于PRD）
/ai-pm data metrics

# 分析数据文件
/ai-pm data insight ./user-data.xlsx

# 查看项目仪表盘
/ai-pm data dashboard
```

## 子命令

### 1. metrics - 数据指标设计

基于 PRD 设计完整的数据指标体系、埋点方案、A/B测试。

**来源**: 原 `ai-pm-analytics`

**用法**:
```bash
/ai-pm data metrics                    # 基于当前 PRD
/ai-pm data metrics --input=PRD.md     # 指定 PRD
/ai-pm data metrics abtest             # 设计 A/B 测试
```

**输出**:
- `09-analytics-requirement.md` - 数据需求文档
- 指标体系、埋点方案、A/B测试设计

**工作流程**:
```
读取 PRD
    ↓
提取可量化指标
    ↓
设计指标体系（北极星→一级→二级→过程）
    ↓
设计埋点方案
    ↓
输出数据需求文档
```

### 2. insight - 数据洞察分析

上传数据文件（Excel/CSV/JSON），通过 EDA 发现业务洞察。

**来源**: 原 `ai-pm-data-insight`

**用法**:
```bash
/ai-pm data insight ./data.xlsx           # 分析数据文件
/ai-pm data insight ./data.csv --focus=conversion  # 聚焦转化率
/ai-pm data insight report                # 生成洞察报告
```

**执行模式（大文件自动隔离）**:

当数据文件存在（`./data.xlsx` 等）时，自动使用 Subagent 隔离模式：

```
主线程：接收命令，准备以下参数
  - 文件路径（绝对路径）
  - 项目输出目录
  - --focus 参数（如有）

使用 Agent tool 派发 subagent：
  系统提示词：「你是数据分析专家，仅完成以下任务，不与用户交互」
  任务：
    1. 用 openpyxl data_only=True 加载文件
    2. 执行 EDA（描述统计、分布、异常值、相关性）
    3. 输出分析结论到 {项目目录}/10-data-insight-report.md
    4. 生成仪表盘 HTML 到 {项目目录}/12-data-insight-dashboard/index.html
    5. 写完毕后退出

主线程：读 10-data-insight-report.md，展示 Top 3 洞察给用户
```

**约束**：subagent 不能向用户提问，所有参数必须在派发时传入。

**输出**:
- `10-data-insight-report.md` - 数据洞察报告
- `11-data-driven-requirements.md` - 数据驱动需求
- `12-data-insight-dashboard/` - 可视化仪表盘

**分析维度**:
- 用户行为分析（活跃度、留存、转化漏斗）
- 用户分层分析（RFM、生命周期、价值分层）
- 时间模式分析（日度趋势、时段分布、周期性）

### 3. dashboard - 项目仪表盘

项目全景视图、进度追踪、关键指标可视化。

**来源**: 原 `ai-pm-dashboard`

**用法**:
```bash
/ai-pm data dashboard                    # 当前项目仪表盘
/ai-pm data dashboard --project={ID}     # 指定项目
/ai-pm data dashboard compare            # 多项目对比
```

**输出**:
- 实时项目状态可视化
- 多项目对比视图
- 关键指标趋势图

## 迁移指南

### 从旧命令迁移

| 旧命令 | 新命令 | 状态 |
|--------|--------|------|
| `/ai-pm analytics` | `/ai-pm data metrics` | ✅ 完全兼容 |
| `/ai-pm analytics abtest` | `/ai-pm data metrics abtest` | ✅ 完全兼容 |
| `/ai-pm data-insight` | `/ai-pm data insight` | ✅ 完全兼容 |
| `/ai-pm dashboard` | `/ai-pm data dashboard` | ✅ 完全兼容 |

### 过渡期说明

- **2026-03-01 ~ 2026-03-15**: 新旧命令同时可用，旧命令输出重定向提示
- **2026-03-15 后**: 旧命令将提示使用新命令

## 架构整合说明

### 为何合并

原三个技能职责重叠：
- `analytics`: 设计指标 → 但指标设计后需要洞察分析
- `data-insight`: 分析数据 → 但分析结果需要仪表盘展示
- `dashboard`: 展示数据 → 但展示内容来自前两者

合并后优势：
- 统一数据入口，降低用户认知负担
- 数据流闭环：指标设计 → 数据采集 → 洞察分析 → 可视化
- 减少技能数量：13 → 11

### 数据流

```
PRD (输入)
    ↓
metrics (指标设计)
    ↓
[实际数据采集]
    ↓
insight (洞察分析)
    ↓
dashboard (可视化展示)
    ↓
产品决策 (输出)
```

## 质量门禁

- [ ] 数据完整性检查（无缺失值、异常值）
- [ ] 指标口径定义清晰
- [ ] 埋点覆盖完整
- [ ] 可视化准确无误

详见 [_core/quality-gates.md](../_core/quality-gates.md)

## 执行协议

本技能遵循 [AI_PM 公共执行协议](../_core/common-protocol.md)。

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|-----|
| v1.0.0 | 2026-03-01 | 初始版本，合并 analytics + data-insight + dashboard |

## 相关技能

- [ai-pm-prd](../ai-pm-prd/SKILL.md) - PRD生成，metrics 的输入来源
- [ai-pm-knowledge](../ai-pm-knowledge/SKILL.md) - 知识库，沉淀数据分析模式
