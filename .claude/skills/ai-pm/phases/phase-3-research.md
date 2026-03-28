# Phase 3: 竞品研究

**输入**: `01-requirement-draft.md`
**输出**: `03-competitor-report.md`

## 执行方式

Phase 3 与 Phase 2 并行执行。使用 Agent 工具并行派发两个子任务，本文件描述 Subagent B（竞品研究）。

### Subagent B（竞品研究）

读取 `01-requirement-draft.md`，输出竞品功能对比矩阵、市场空白、差异化策略，写入 `03-competitor-report.md`。

### 文案建议（AIDA 框架）

竞品分析完成后，自动生成一段 AIDA 格式的产品价值主张草稿：
- 读取 `templates/presets/copywriting-frameworks.md` 中 AIDA 模板
- 用竞品差异化结论填充模板
- 输出到 `03-competitor-report.md` 末尾的「价值主张草稿」段落

主线程等待 Subagent A（需求分析）和 Subagent B 均完成后进入 Phase 4。
