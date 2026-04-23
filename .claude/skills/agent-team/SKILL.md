---
name: agent-team
description: >-
  需求复杂、需要多角色并行协作时使用（通常由 ai-pm --team 自动调度，也可直接调用）。
  当用户说「多代理模式」「并行执行」「需求很复杂需要团队协作」「--team模式」「多角色协同」时使用此技能。
argument-hint: "[需求描述] [--mode=serial|parallel|agile] [--roles=pm,architect,designer]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cat) Agent
---

# Agent Team - 多代理协作引擎

> 通常由 `/ai-pm --team` 自动调度。也支持直接调用 `/agent-team [需求描述]`。

## 代理团队构成

### 核心角色

| 代理 | 角色 | 主要职责 |
|-----|------|---------|
| **orchestrator** | 协调者 | 任务分解、代理调度、冲突解决 |
| **product-manager** | 产品经理 | 需求澄清、竞品分析、PRD产出 |
| **architect** | 架构师 | 架构设计、技术选型、可行性评估 |
| **ui-designer** | UI设计师 | 交互设计、原型产出、设计规范 |
| **data-analyst** | 数据分析师 | 数据洞察、指标设计、埋点方案 |
| **tech-writer** | 技术文档工程师 | 文档整合、格式规范、质量把控 |

### 现场调研专属角色

| 代理 | 角色 | 主要职责 |
|-----|------|---------|
| **user-researcher** | 用户研究员 | 访谈执行、行为观察、洞察分析 |
| **requirement-synthesizer** | 需求整合师 | 需求提取、信息整合、优先级排序 |

## 触发方式

| 方式 | 命令 | 说明 |
|-----|------|-----|
| ai-pm 自动调度（推荐） | `/ai-pm --team "需求"` | ai-pm 判断复杂度后自动调用本引擎 |
| 直接调用 | `/agent-team "需求"` | 跳过 ai-pm 主控，直接启动多代理 |

## 协作模式

| 参数 | 模式 | 适用场景 |
|-----|------|---------|
| `--mode=serial` | 串行：PM → Architect → Designer → Writer | 复杂项目，各阶段有强依赖 |
| `--mode=parallel`（默认） | 并行：独立子任务同时执行后汇总 | 时间紧迫，任务可拆分 |
| `--mode=agile` | 敏捷：迭代式快速交付，多轮反馈 | 需求不明确，MVP探索 |

## Orchestrator 执行协议（Wave 模式）

> 所有角色通过 Agent tool 真正并行执行，替代原有「模拟角色切换」方式。

### Wave 执行流程

**Wave 1（并行，无依赖）**：

使用 Agent tool 同时派发以下 subagent（根据需求选择）：

```
Agent → subagent-PM
  系统提示词：「你是资深产品经理，仅完成任务，不与用户交互」
  任务：基于需求「{用户需求}」，完成需求分析
  输出：{项目目录}/02-analysis-report.md

Agent → subagent-Analyst
  系统提示词：「你是竞品分析师，仅完成任务，不与用户交互」
  任务：基于需求「{用户需求}」，完成竞品研究
  输出：{项目目录}/03-competitor-report.md

Agent → subagent-KB（可选，知识库有相关内容时启用）
  系统提示词：「你是知识库检索员，仅完成任务，不与用户交互」
  任务：搜索知识库中与「{需求关键词}」相关的经验
  输出：/tmp/kb-insight.md
```

Wave 1 全部完成后，向用户汇报结果摘要。

**Wave 2（依赖 Wave 1 输出）**：

```
Agent → subagent-PRD
  系统提示词：「你是 PRD 撰写专家，仅完成任务，不与用户交互」
  任务：
    读取：{项目目录}/02-analysis-report.md
    读取：{项目目录}/03-competitor-report.md
    读取：/tmp/kb-insight.md（如存在）
    输出：{项目目录}/05-prd/05-PRD-v1.0.md
```

**Wave 3（依赖 Wave 2 输出，按需启动）**：

```
Agent → subagent-Review
  系统提示词：「你是资深评审专家，仅完成任务，不与用户交互」
  任务：
    读取：{项目目录}/05-prd/05-PRD-v1.0.md
    执行精简版三角色评审（产品+前端开发+测试）
    输出：{项目目录}/08-review-report-v1.md
```

启动规则：默认自动启动；若用户传入 `--skip-review` 则跳过。

### 模式映射

| 参数 | Wave 执行策略 |
|------|------------|
| `--mode=serial` | Wave 1: PM → Wave 2: PRD（读取PM输出）→ Wave 3: Review |
| `--mode=parallel`（默认） | Wave 1: PM+Analyst 同时 → Wave 2: PRD → Wave 3: Review |
| `--mode=agile` | Wave 1: PM+Analyst+KB → Wave 2: PRD（轻量版）→ 快速交付 |

> **serial 模式说明**：Wave 1 仅派发 subagent-PM，Wave 2 的 PRD 不含竞品研究，适用于快速小需求。

### 约束

- 每个 subagent 的提示词必须包含「不与用户交互」
- subagent 的所有输入（文件路径、项目目录）在 Agent tool 调用时传入，不能运行时询问
- subagent 产出必须落文件，主线程读文件做汇总，不依赖 subagent 的返回文本

## Wave 容错规范

### 失败记录

当某 subagent 执行失败（超时、报错、文件未落盘）时：

1. **不中断整个 Wave**；同 Wave 的其他 subagent 继续执行
2. 将失败信息写入项目 `_status.json` 的 `agent_errors` 字段：

```json
"agent_errors": {
  "{wave_id}_{agent_role}": {
    "error": "{错误摘要，不超过 100 字}",
    "timestamp": "{ISO8601}",
    "retryable": true
  }
}
```

命名规则：key 为 `wave{N}_{role}`，例如 `wave1_analyst`、`wave2_prd`。

3. Wave 结束后向用户汇报结果：

```
Wave 1 完成（1 个 subagent 失败）：
  ✅ subagent-PM → 02-analysis-report.md
  ❌ subagent-Analyst → 竞品数据获取超时（可重试）

继续 Wave 2？或重试失败项？
  继续 / 重试
```

### --retry 参数

`/ai-pm --team --retry=wave1`：

1. 读 `_status.json.agent_errors`，筛选 key 以 `wave1_` 开头且 `retryable: true` 的条目
2. **仅重跑失败的 subagent**，已成功的 subagent 输出文件保留不变
3. 重跑成功后，清除 `agent_errors` 中对应条目
4. 重新执行后续 Wave（依赖被修复输出的 Wave）

**限制**：`--retry` 只能重跑有错误记录的 Wave，不支持强制重跑已成功的 Wave。

## 任务分解与角色分配

| 任务类型 | 所需角色 | 推荐模式 |
|---------|---------|---------|
| 需求分析 | PM + Analyst | 并行 |
| 产品设计 | PM + Designer | 串行 |
| 技术方案 | Architect + PM | 串行 |
| 完整项目 | 全体角色 | 串行/敏捷 |
| 数据洞察 | Analyst | 并行 |
| 现场调研（单客户） | Researcher + Synthesizer + PM | 串行 |
| 现场调研（多客户） | 多Researcher + Synthesizer + PM | 并行 |

## 命令参考

| 命令 | 功能 |
|------|------|
| `/agent-team "需求"` | 启动完整团队处理需求 |
| `/agent-team --mode=serial "需求"` | 串行模式 |
| `/agent-team --mode=parallel "需求"` | 并行模式（默认） |
| `/agent-team --mode=agile "需求"` | 敏捷模式 |
| `/agent-team --roles=pm,architect "需求"` | 仅启用指定角色 |
| `/agent-team --skip-review "需求"` | 跳过评审阶段 |
| `/ai-pm --team --retry=wave1` | 重跑 Wave 1 中失败的 subagent（保留已成功输出） |
| `/ai-pm --team --retry=wave2` | 重跑 Wave 2 中失败的 subagent |
| `/ai-pm --team "需求"` | 推荐方式：经由 ai-pm 自动调度 |
