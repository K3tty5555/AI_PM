# Phase 5: PRD 生成

**输入**: `01-requirement-draft.md` + `02-analysis-report.md` + `03-competitor-report.md` + `04-user-stories.md`
**输出**: `05-prd/05-PRD-v1.0.md`

## 知识库推荐触发（Plan Mode 前执行）

在展示 Plan Mode 前，先检查是否有相关知识可推荐：

1. 从 `01-requirement-draft.md` 提取业务关键词（3–6 个）
2. 调用 `ai-pm-knowledge suggest {关键词}` 搜索相关踩坑/模式
3. **有匹配结果** → 展示推荐，等待用户「查看详情」或「跳过」
4. **无匹配结果** → 静默跳过，直接进入 Plan Mode

## Plan Mode 前置展示（执行前必须展示）

用户触发 PRD 生成后，**先展示执行计划**并等待确认：

```
即将开始：PRD 生成
─────────────────────────────
执行步骤（共 9 步）：
  1. PRD 生成前确认
  2. 写作风格选择
  3. 产品概述
  4. 用户角色
  5. 功能规格   ← 最耗时，约占 50%
  6. 数据结构
  7. 交互流程
  8. 非功能需求
  9. 落盘 + 摘要 + 成本记录

读取文件：01-requirement-draft.md, 02-analysis-report.md,
         03-competitor-report.md, 04-user-stories.md
写入文件：05-prd/05-PRD-v1.0.md（及摘要，若 ≥20KB）

继续？[Y/n]
```

- 用户回复 Y / 回车 / 「继续」 → 执行 Checkpoint 子步骤（从 preflight_confirm 开始）
- 用户回复 n / 「取消」 → 返回主菜单，不写入任何文件

## Checkpoint 子步骤定义

> **注**：共 9 步，验收标准已整合至「功能规格」步骤内，不单独列为子步骤。

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
| `prd_done` | PRD 完成 | 文件落盘，写摘要，写成本记录 |
| `memory_write` | 决策记忆写入 | 写入 L1-decisions.md（3–5 条关键取舍） |

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

在 `_status.json` 的**顶层**新增（或更新）`summaries` 字段：
```json
"summaries": {
  "prd": "{ISO8601 时间戳}"
}
```

### 5. 写入成本记录

```bash
# 获取 PRD 文件字节数
wc -c {project_dir}/05-prd/05-PRD-v1.0.md
```

将字节数 × 0.25 作为 `tokens_estimate`，写入 `_status.json`：

```json
"cost": {
  "phases": {
    "prd": {
      "model": "claude-sonnet-4-6",
      "tokens_estimate": {file_bytes * 0.25},
      "completed_at": "{ISO8601 时间戳}"
    }
  },
  "total_estimate": {累加所有 phases 的 tokens_estimate}
}
```

## memory_write 步骤：写入 L1 决策记忆

`prd_done` 子步骤完成（含摘要 + 成本记录落盘）之后，执行 `memory_write` 步骤：

1. `mkdir -p {project_dir}/_memory/`（若不存在则创建）
2. 从 `05-prd/05-PRD-v1.0.md` 的「功能规格」章节提取关键取舍决策：
   - 选择了什么方案，以及原因（来自「背景」「设计说明」「注意」等段落）
   - 明确排除的功能及原因（来自「不在范围内」「禁止」等）
   - 典型场景：采用侧边栏而非弹窗、分步表单而非单页表单等

3. 以**追加**方式写入 `_memory/L1-decisions.md`（`test -f` 检查：不存在则创建，存在则在末尾追加）：
   每条决策格式：
   ```
   ## {YYYY-MM-DD}: {决策标题}
   **决策**：{内容}
   **原因**：{为什么}
   **范围**：{影响功能/页面}

   ---
   ```
   提取 3-5 条最关键的决策即可，不要穷举。

格式参考 `references/project-memory.md` 的 L1-decisions.md 格式。
