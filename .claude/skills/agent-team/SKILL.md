---
name: agent-team
description: >-
  AI_PM 多代理协作团队。调度专业代理（产品经理、架构师、UI设计师、数据分析师、技术文档工程师）
  协同完成复杂产品项目。支持串行、并行、敏捷三种协作模式，自动任务分配和进度管理。
argument-hint: "[需求描述] [--mode=serial|parallel|agile] [--roles=pm,architect,designer]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cat) Agent
---

# Agent Team - 多代理协作团队

## 执行协议

- **角色专业分工**：每个代理专注于自己的专业领域
- **智能任务调度**：协调者自动分配任务，管理依赖关系
- **多模式协作**：支持串行、并行、敏捷三种工作模式
- **透明进度追踪**：实时显示各代理工作状态和产出
- **质量门禁把控**：每个阶段通过质量检查才能进入下一阶段
- **灵活人机协作**：关键节点征求用户确认，支持人工干预

## 代理团队构成

| 代理 | 角色 | 专长领域 | 主要职责 |
|-----|------|---------|---------|
| 🎯 **orchestrator** | 协调者 | 任务调度、进度管理 | 任务分解、代理调度、冲突解决 |
| 📋 **product-manager** | 产品经理 | 需求分析、PRD编写 | 需求澄清、竞品分析、PRD产出 |
| 🏗️ **architect** | 架构师 | 技术架构、系统设计 | 架构设计、技术选型、可行性评估 |
| 🎨 **ui-designer** | UI设计师 | 交互设计、原型设计 | 交互设计、原型产出、设计规范 |
| 📊 **data-analyst** | 数据分析师 | 数据分析、指标体系 | 数据洞察、指标设计、埋点方案 |
| 📝 **tech-writer** | 技术文档工程师 | 文档编写、质量检查 | 文档整合、格式规范、质量把控 |

## 启动参数解析

解析 `$ARGUMENTS`：

| 输入类型 | 处理方式 |
|---------|---------|
| `"需求描述"` | 启动完整团队处理需求 |
| `--mode=serial` | 串行模式：PM → Architect → Designer → Writer |
| `--mode=parallel` | 并行模式：独立任务同时执行 |
| `--mode=agile` | 敏捷模式：迭代式快速交付 |
| `--roles=pm,architect` | 仅启用指定角色 |
| `--project={项目名}` | 在指定项目中执行 |
| `status` | 查看团队当前状态 |
| `pause` | 暂停当前任务 |
| `resume` | 恢复暂停的任务 |

## 协作模式

### 模式1：串行模式 (Serial)

```
PM(需求澄清) → Architect(架构设计) → Designer(原型) → Writer(文档整合)

适用场景：
- 复杂项目，各阶段有强依赖
- 企业级产品，需要严谨流程
- 需求明确，一次性交付

特点：
✓ 质量高、一致性好
✗ 耗时较长
```

### 模式2：并行模式 (Parallel)

```
           ┌→ PM(竞品分析)
用户需求 → ┼→ Analyst(数据洞察) → 汇总整合
           └→ PM(需求澄清)        → PRD

适用场景：
- 独立子任务可并行执行
- 时间紧迫，需要快速产出
- 团队资源充足

特点：
✓ 效率高
✗ 需要强整合能力
```

### 模式3：敏捷模式 (Agile)

```
迭代1：PM澄清 → 快速原型 → 用户反馈
迭代2：细化需求 → 完善设计 → 用户反馈
迭代3：PRD定稿 → 终稿交付

适用场景：
- 需求不明确，需要快速验证
- 创新型产品，探索性开发
- MVP模式

特点：
✓ 灵活、用户参与度高
✗ 可能需要多轮迭代
```

## 工作流程

### Phase 0: 任务接收与分析

```
接收用户任务
    ↓
分析任务类型和复杂度
    ↓
识别所需专业角色
    ↓
制定执行计划
```

**任务分类：**

| 任务类型 | 所需角色 | 预计耗时 | 推荐模式 |
|---------|---------|---------|---------|
| 需求分析 | PM + Analyst | 30分钟 | 并行 |
| 产品设计 | PM + Designer | 45分钟 | 串行 |
| 技术方案 | Architect + PM | 40分钟 | 串行 |
| 完整项目 | 全体角色 | 2小时 | 串行/敏捷 |
| 文档编写 | Writer | 20分钟 | 串行 |
| 数据洞察 | Analyst | 30分钟 | 并行 |

### Phase 1: 代理调度

根据任务类型和模式，调度合适的代理：

**串行调度示例：**
```yaml
phase_1:
  agent: product-manager
  task: 需求澄清
  output: 01-requirement-draft.md
  next: phase_2

phase_2:
  agent: architect
  task: 架构设计
  input: 01-requirement-draft.md
  output: 13-architecture-design.md
  depends_on: phase_1
  next: phase_3

phase_3:
  agent: ui-designer
  task: 原型设计
  input: [01-requirement-draft.md, 13-architecture-design.md]
  output: 06-prototype/
  depends_on: phase_2
  next: phase_4

phase_4:
  agent: tech-writer
  task: 文档整合
  input: all
  output: 99-project-documentation/
  depends_on: [phase_1, phase_2, phase_3]
```

**并行调度示例：**
```yaml
parallel_tasks:
  - agent: product-manager
    task: 竞品分析
    output: 03-competitor-report.md

  - agent: data-analyst
    task: 数据洞察
    output: 10-data-insight-report.md

  - agent: product-manager
    task: 需求澄清
    output: 01-requirement-draft.md

merge_task:
  agent: product-manager
  task: PRD整合
  input: all_parallel_outputs
  output: 05-PRD-v1.0.md
```

### Phase 2: 执行与监控

**执行流程：**
```
启动代理任务
    ↓
实时监控进度
    ↓
收集中间产出
    ↓
质量检查
    ↓
标记完成/阻塞
```

**状态追踪：**
```yaml
project_status:
  name: "project-name"
  phase: "analysis|design|prd|review"
  mode: "serial|parallel|agile"
  agents:
    product_manager:
      status: "completed"
      current_task: "PRD编写"
      progress: 80%
    architect:
      status: "in_progress"
      current_task: "架构设计"
      progress: 45%
    ui_designer:
      status: "pending"
      blocked_by: "architect"
  blockers: []
  next_milestone: "原型评审"
```

### Phase 3: 质量门禁

每个阶段必须通过质量检查：

```
需求澄清 → [PM自检] → [用户确认] → ✅
竞品分析 → [PM自检] → [Analyst交叉审核] → ✅
架构设计 → [Architect自检] → [PM业务审核] → ✅
UI设计 → [Designer自检] → [PM+Architect审核] → ✅
PRD → [PM自检] → [全体审核] → [用户确认] → ✅
```

### Phase 4: 交付与复盘

**交付物整合：**
```
各代理产出 → Tech Writer整合 → 统一文档包 → 用户交付
```

**项目复盘：**
```yaml
retrospective:
  - 哪些环节效率最高？
  - 哪些协作存在问题？
  - 用户满意度如何？
  - 改进建议
```

## 代理间通信协议

### 消息格式

```json
{
  "message_type": "task_request|task_response|review_request|review_response",
  "from": "agent_name",
  "to": "agent_name|all",
  "task_id": "uuid",
  "project_id": "project-name",
  "content": {
    "type": "prd_review|architecture_review|design_review",
    "payload": {},
    "context": {},
    "deadline": "2026-03-01T10:00:00Z"
  },
  "priority": "high|medium|low",
  "status": "pending|in_progress|completed|blocked"
}
```

### 协作接口

**产品经理接收：**
| 来源 | 输入类型 | 用途 |
|-----|---------|-----|
| 用户 | 原始需求 | 需求澄清 |
| 数据分析师 | 数据洞察 | 需求验证 |
| 架构师 | 技术约束 | PRD可行性 |
| UI设计师 | 设计稿 | PRD补充 |

**架构师接收：**
| 来源 | 输入类型 | 用途 |
|-----|---------|-----|
| 产品经理 | PRD | 架构设计依据 |
| 数据分析师 | 数据规模预估 | 容量规划 |

**UI设计师接收：**
| 来源 | 输入类型 | 用途 |
|-----|---------|-----|
| 产品经理 | PRD | 设计依据 |
| 架构师 | 接口规范 | 前后端对接 |

**数据分析师接收：**
| 来源 | 输入类型 | 用途 |
|-----|---------|-----|
| 用户 | 数据文件 | 分析输入 |
| 产品经理 | PRD | 指标设计依据 |

**技术文档工程师接收：**
| 来源 | 输入类型 | 用途 |
|-----|---------|-----|
| 全体代理 | 各类文档 | 整合和润色 |
| 协调者 | 文档需求 | 编写任务 |

## 冲突解决机制

当代理间出现意见分歧时：

1. **技术分歧** → 架构师决策
2. **业务分歧** → 产品经理决策
3. **体验分歧** → UI设计师决策
4. **数据分歧** → 数据分析师决策
5. **无法达成一致** → 协调者提议，用户最终决策

## 使用示例

### 启动完整团队

```bash
/agent-team "开发一个智能客服系统"
```

**执行流程：**
```
🎯 Agent Team 启动
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 任务分析：
   类型：完整产品开发
   复杂度：高
   建议模式：串行

👥 调度代理：
   ✓ 产品经理 - 需求澄清、竞品分析、PRD
   ✓ 架构师 - 架构设计、技术选型
   ✓ UI设计师 - 交互设计、原型
   ✓ 技术文档工程师 - 文档整合

🔄 开始执行...
```

### 指定特定角色

```bash
/agent-team --roles=pm,architect "做一个记账App"
```

### 指定协作模式

```bash
/agent-team --mode=agile "设计一个社交产品"
```

### 查看团队状态

```bash
/agent-team status
```

**输出示例：**
```
📊 Agent Team 状态
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

项目：exam-scoring-20260301
模式：串行

代理状态：
┌─────────────┬─────────────┬──────────┬────────┐
│ 代理        │ 当前任务    │ 进度     │ 状态   │
├─────────────┼─────────────┼──────────┼────────┤
│ 产品经理    │ PRD编写     │ 100%     │ ✅ 完成 │
│ 架构师      │ 架构设计    │ 100%     │ ✅ 完成 │
│ UI设计师    │ 原型设计    │ 85%      │ 🔄 进行中│
│ 技术文档    │ 待启动      │ 0%       │ ⏳ 等待 │
└─────────────┴─────────────┴──────────┴────────┘

下一步：UI设计师完成原型后，技术文档工程师开始文档整合
```

### 数据驱动项目

```bash
/agent-team --roles=analyst,pm "分析用户行为数据，提炼产品优化需求"
```

## 项目目录结构

Agent Team 产出物的标准目录结构：

```
output/projects/{项目名}/
├── project-status.json          # 项目状态跟踪文件
├── logs/
│   └── communication.jsonl      # 代理通信日志
├── 01-requirement-draft.md      # 产品经理：需求澄清
├── 02-analysis-report.md        # 产品经理：需求分析
├── 03-competitor-report.md      # 产品经理：竞品研究
├── 04-user-stories.md           # 产品经理：用户故事
├── 05-PRD-v1.0.md               # 产品经理：PRD文档
├── 06-prototype/                # UI设计师：可交互原型
│   ├── index.html
│   ├── css/
│   └── js/
├── 07-references/               # 参考资源
├── 08-review-report-v1.md       # 评审报告（如启用评审）
├── 09-analytics-requirement.md  # 数据分析师：数据分析需求
├── 10-data-insight-report.md    # 数据分析师：数据洞察报告
├── 11-data-driven-requirements.md # 数据分析师：数据驱动需求
├── 12-data-insight-dashboard/   # 数据分析师：可视化仪表盘
├── 13-architecture-design.md    # 架构师：架构设计文档
├── 14-interaction-design.md     # UI设计师：交互设计文档
├── 99-retrospective.md          # 项目复盘报告
└── 99-project-documentation/    # 技术文档工程师：完整文档包
```

## 质量检查清单

### 需求阶段质量门

- [ ] 目标用户画像清晰
- [ ] 核心场景描述完整
- [ ] 痛点分析到位
- [ ] 功能范围明确
- [ ] 优先级合理

### 架构阶段质量门

- [ ] 架构图清晰，模块边界明确
- [ ] 技术选型有充分理由
- [ ] 考虑了扩展性和高可用
- [ ] 识别了关键风险
- [ ] 提供了备选方案

### 设计阶段质量门

- [ ] 符合PRD描述
- [ ] 交互逻辑完整
- [ ] 响应式适配
- [ ] 视觉风格统一
- [ ] 交互动效流畅

### 数据阶段质量门

- [ ] 数据完整性检查
- [ ] 指标口径定义清晰
- [ ] 埋点覆盖完整
- [ ] 可视化准确无误

### 文档阶段质量门

- [ ] 文档结构完整
- [ ] 格式规范统一
- [ ] 术语使用一致
- [ ] 交叉引用正确

## 命令参考

| 命令 | 功能 |
|------|------|
| `/agent-team "需求"` | 启动完整团队处理需求 |
| `/agent-team --mode=serial "需求"` | 串行模式 |
| `/agent-team --mode=parallel "需求"` | 并行模式 |
| `/agent-team --mode=agile "需求"` | 敏捷模式 |
| `/agent-team --roles=pm,architect "需求"` | 仅启用指定角色 |
| `/agent-team status` | 查看团队状态 |
| `/agent-team pause` | 暂停任务 |
| `/agent-team resume` | 恢复任务 |
| `/agent-team reassign --task={任务} --to={代理}` | 重新分配任务 |

## 状态管理与恢复

Agent Team 提供完整的状态跟踪和恢复机制，确保即使终端关闭也能恢复项目进度。

### 项目状态文件

每个项目自动维护 `project-status.json`，包含：

```yaml
项目基本信息:
  - 项目ID、名称、状态、模式
  - 启动时间、更新时间、完成时间

代理状态:
  - 各代理的当前任务和进度
  - 任务列表及完成状态
  - 阻塞项和依赖关系

阶段状态:
  - 各阶段的开始/完成时间
  - 阶段内的代理分配

产出物管理:
  - 已完成、进行中、待开始的产出物
  - 文件路径、大小、创建时间

质量门禁:
  - 各阶段的质量检查结果
  - 通过/未通过的检查项
```

### 终端关闭后的恢复

如果终端意外关闭，可通过以下方式恢复：

```bash
# 方式1: 使用 CLI 工具
.claude/skills/agent-team/agent-team-cli.sh status          # 查看所有项目
.claude/skills/agent-team/agent-team-cli.sh status <项目ID> # 查看特定项目

# 方式2: 直接读取状态文件
cat output/projects/<项目ID>/project-status.json | jq

# 方式3: 查看通信日志
tail -20 output/projects/<项目ID>/logs/communication.jsonl
```

### 通信日志

代理间的所有通信记录在 `logs/communication.jsonl`，支持：

- **任务追踪**: 查看任务分配、开始、完成的完整流程
- **问题诊断**: 分析阻塞原因和解决过程
- **效率分析**: 统计各代理的任务耗时
- **复盘依据**: 项目结束后的数据分析

## CLI 工具

Agent Team 提供命令行工具便于项目管理：

```bash
# 设置快捷别名（推荐添加到 .zshrc/.bashrc）
alias ateam="/Users/xiaowu/AI_PM/.claude/skills/agent-team/agent-team-cli.sh"

# 启动新项目
ateam start "开发一个智能客服系统"
ateam start --mode=parallel --roles=pm,designer "设计一个登录页"

# 查看状态
ateam list                    # 列出所有项目
ateam status                  # 同上
ateam status <项目ID>         # 查看详细状态

# 项目管理
ateam pause <项目ID>          # 暂停项目
ateam resume <项目ID>         # 恢复项目
ateam review <项目ID>         # 查看评审报告
ateam logs <项目ID> [行数]    # 查看通信日志

# 帮助
ateam help
```

## 最佳实践

### ✅ 推荐做法

- 明确每个代理的职责边界
- 建立清晰的交付标准
- 保持信息透明和同步
- 及时识别和解决阻塞
- 定期进行质量审核

### ❌ 避免做法

- 避免代理职责重叠
- 避免长时间阻塞不处理
- 避免绕过质量门禁
- 避免频繁切换模式
- 避免忽视代理的依赖关系

## 与主技能 ai-pm 的关系

```
ai-pm (主控技能)
    ↓ 调用
agent-team (多代理协调)
    ↓ 调度
├─ product-manager
├─ architect
├─ ui-designer
├─ data-analyst
└─ tech-writer
```

**使用建议：**
- 简单需求：直接使用 `/ai-pm`
- 复杂项目：使用 `/agent-team` 获得更专业的分工
- 特定任务：直接调用子技能如 `/ai-pm analyze`

## 扩展计划

未来可扩展的代理角色：
- **安全工程师**：安全审计、合规检查
- **测试工程师**：测试策略、用例设计
- **运维工程师**：部署方案、监控设计
- **算法工程师**：AI功能、推荐系统
