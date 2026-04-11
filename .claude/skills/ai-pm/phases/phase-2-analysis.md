# Phase 2: 需求分析

**输入**: `01-requirement-draft.md`
**输出**: `02-analysis-report.md`

## 执行方式

Phase 2 与 Phase 3 并行执行。使用 Agent 工具并行派发两个子任务，本文件描述 Subagent A（需求分析）。

### Subagent A（需求分析）

读取 `01-requirement-draft.md`，输出目标用户画像、核心痛点、MVP 功能范围，写入 `02-analysis-report.md`。

主线程等待 Subagent A 和 Subagent B（竞品研究）均完成后进入 Phase 4。

## Phase 2/3 完成后：写入 L2 分析记忆

`02-analysis-report.md` 和 `03-competitor-report.md` 均落盘后（主线程等待两个 Subagent 完成后执行）：

1. `mkdir -p {project_dir}/_memory/`（若不存在则创建）
2. 从两份报告中提取以下内容写入 `_memory/L2-analysis.md`：
   - **核心用户痛点 Top 3**（来自 02-analysis-report.md）
   - **竞品差异点**（来自 03-competitor-report.md，各竞品一行）
   - **差异化机会**（1-2 句话总结）

格式参考 `references/project-memory.md` 的 L2-analysis.md 格式。
