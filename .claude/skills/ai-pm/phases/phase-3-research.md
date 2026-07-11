# Phase 3: 竞品研究

**输入**: `01-requirement-draft/`（最新 V，+ 关联兄弟项目，见下）
**输出**: `03-competitor-report/V{版本}.md`（文件夹版，非旧扁平文件）

## 执行方式

Phase 3 与 Phase 2 并行执行。使用 Agent 工具并行派发两个子任务，本文件描述 Subagent B（竞品研究）。

### Subagent B（竞品研究）

读取 `01-requirement-draft.md`，输出竞品功能对比矩阵、市场空白、差异化策略，写入 `03-competitor-report/V{版本}.md`。

> **方法论事实源 = `.claude/skills/ai-pm-research/SKILL.md`**（不在此抄正文，避免双源漂移）。Subagent B 执行前读它，按其步骤走。这里只点关键挂钩，细节去 SKILL.md：
> - **步骤1**：先关联扫描兄弟项目（related-scan + rg/牵动链 + 用户点名三道组合）拿"我方现状/在途决策"，再定**靶子问题**（竞品对位要能回答我方正在拍的决策，不是"有没有这功能"）；判首次轮/增量轮。
> - **步骤3**：有竞品账号时走「模式 B 登录态实探」（手册 `.claude/skills/ai-pm-research/references/live-probe.md`，开浏览器前先获授权）。
> - **步骤4 + 输出**：关键功能点对到决策级事实、每条带威胁等级/验证状态字段、产出含结构化处置段（候选包/不跟清单/决策点）。
> - **输出前自检**：未验证结论标 `[待验证]`/`[反推]`；操作层≠数据产出层别混。

### 文案建议（AIDA 框架）

竞品分析完成后，自动生成一段 AIDA 格式的产品价值主张草稿：
- 读取 `templates/presets/copywriting-frameworks.md` 中 AIDA 模板
- 用竞品差异化结论填充模板
- 输出到 `03-competitor-report/V{版本}.md` 末尾的「价值主张草稿」段落

主线程等待 Subagent A（需求分析）和 Subagent B 均完成后进入 Phase 4。
