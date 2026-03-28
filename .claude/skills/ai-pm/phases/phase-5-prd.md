# Phase 5: PRD 生成

**输入**: `01-requirement-draft.md` + `02-analysis-report.md` + `03-competitor-report.md` + `04-user-stories.md`
**输出**: `05-prd/05-PRD-v1.0.md`

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
