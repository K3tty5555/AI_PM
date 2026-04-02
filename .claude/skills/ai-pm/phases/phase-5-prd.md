# Phase 5: PRD 生成

**输入**: `01-requirement-draft.md` + `02-analysis-report.md` + `03-competitor-report.md` + `04-user-stories.md`
**输出**: `05-prd/05-PRD-v1.0.md`

## Checkpoint 子步骤定义

PRD 生成过程按以下子步骤推进，每步开始前更新 `_status.json` 中的 `checkpoints.prd`：

| 步骤 ID | 步骤名称 | 说明 |
|---------|---------|------|
| `preflight_confirm` | PRD 生成前确认 | 用户确认内容无误 |
| `style_select` | 写作风格选择 | 用户选择风格 |
| `product_overview` | 产品概述 | 写产品背景/定位/目标 |
| `user_roles` | 用户角色 | 写用户画像/角色定义 |
| `functional_spec` | 功能规格 | 写详细功能设计（最耗时） |
| `data_schema` | 数据结构 | 写核心数据字段/流转 |
| `ui_flows` | 交互流程 | 写页面流程/状态机 |
| `non_functional` | 非功能需求 | 写性能/安全/兼容性 |
| `prd_done` | PRD 完成 | 文件落盘，写摘要 |

**checkpoint 更新时机**：

每步开始前：
```
checkpoints.prd.step = "{当前步骤 ID}"
checkpoints.prd.pending_step = "{当前步骤 ID}"
checkpoints.prd.last_updated = "{ISO8601}"
```

步骤完成后：
```
checkpoints.prd.completed_steps.append("{当前步骤 ID}")
checkpoints.prd.pending_step = "{下一步骤 ID}"
```

**恢复逻辑**（`/ai-pm continue` 时）：
- 读 `checkpoints.prd.pending_step`
- 跳过 `completed_steps` 中的步骤，从 `pending_step` 继续

## PRD 生成前确认节点

**步骤 A：内容确认**

汇总展示前 4 阶段核心结论：
- 目标用户 / 核心痛点 / 主要功能范围 / 成功指标

询问："以上内容有需要调整的吗？没问题回复「没问题」或「生成」，有调整直接说。"

等用户确认内容无误后，执行步骤 B。

**步骤 B：写作风格选择**

单独询问写作风格：
- 标准风格（default）
- 自定义风格（若已配置 persona，列出可用风格名）

用户选择后执行 PRD 写入。

## FAB 功能描述

PRD「详细功能设计」中每个核心功能，自动生成 FAB 三行描述（Feature → Advantage → Benefit）。
- 读取 `templates/presets/copywriting-frameworks.md` 中 FAB 模板
- 为每个功能填充 FAB 结构，Benefit 部分用数字或场景说明
- 写入 PRD 对应功能描述段落中

## PRD 落盘后：生成摘要（自动执行）

PRD 文件写入后，立即执行以下步骤。

### 1. 检查是否需要生成摘要

用 Bash 检查 PRD 文件大小：
```bash
wc -c {project_dir}/05-prd/05-PRD-v1.0.md
```

- 文件 < 20480 字节（20KB）→ 跳过摘要生成
- 文件 ≥ 20480 字节 → 执行摘要生成

### 2. 生成 PRD 摘要

读取 `05-prd/05-PRD-v1.0.md`，按以下结构生成摘要，**总字数控制在 1500–2000 字**：

```
## PRD 摘要 · {项目名} v{版本}
生成时间：{YYYY-MM-DD}

### 产品定位（100 字以内）
{目标用户} + {核心价值主张，一句话}

### 功能模块
- **{模块名}**：{核心逻辑，不超过 30 字}
（列出全部模块）

### 关键设计决策（3–5 条）
1. {决策内容} — {背景/原因}

### 数据与边界
- 核心数据字段：{字段1}、{字段2}、...
- 关键约束：{约束说明}
- 禁止项：{禁止行为}

### 遗留问题
🔴 P0（必须解决）：
- ...
🟡 P1（可推迟）：
- ...

### 下阶段输入
- **给 Phase 7（原型）**：重点验证 {交互点}
- **给 Phase 8（评审）**：重点审视 {设计决策}
```

### 3. 落盘

```bash
mkdir -p {project_dir}/_summaries/
```
写入：`{project_dir}/_summaries/prd-summary.md`

### 4. 更新 _status.json

在 `_status.json` 的 `checkpoints` 字段下新增（或更新）：
```json
"summaries": {
  "prd": "{ISO8601 时间戳}"
}
```
