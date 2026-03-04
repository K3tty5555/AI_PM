# Agent Team 模板

本目录包含 Agent Team 多代理协作系统的标准模板。

## 模板清单

### 1. 任务模板 (task-template.json)

定义了 Agent Team 任务的标准结构，包含：
- 任务基本信息（ID、名称、类型、复杂度、优先级）
- 代理分配（各代理的角色、任务、依赖关系）
- 工作流配置（串行/并行/敏捷模式）
- 阶段划分（需求→设计→开发→评审）
- 质量门禁（评审标准和检查项）
- 沟通配置（报告频率、通知方式）

**使用场景：** 创建新任务时作为基础模板

### 2. 项目状态模板 (project-status-template.json)

定义了项目运行时的状态跟踪格式，包含：
- 项目基本信息（ID、名称、状态、模式）
- 代理状态（各代理的进度、当前任务、阻塞项）
- 阶段状态（各阶段的开始/完成时间）
- 产出物管理（已完成/进行中/待开始的产出物）
- 质量门禁状态（各阶段的质量检查情况）
- 阻塞项跟踪（当前阻塞项目及原因）

**使用场景：** 项目启动时创建，持续更新跟踪进度

### 3. 通信日志模板 (communication-log-schema.json)

定义了代理间通信的消息格式，包含：
- 消息标识（ID、时间戳、类型）
- 收发方（from/to）
- 消息内容（主题、正文、数据、附件）
- 状态跟踪（优先级、任务状态）
- 关联关系（回复的消息ID）

**使用场景：** 记录代理间所有通信，便于追溯和调试

### 4. 项目复盘模板 (retrospective-template.md)

项目结束后的复盘文档模板，包含：
- 项目概述（目标、时间、参与人员）
- 成果总结（产出物、质量指标）
- 过程回顾（各阶段耗时、效率分析）
- 问题分析（遇到的困难、原因分析）
- 经验沉淀（最佳实践、改进建议）
- 后续行动（待办事项、责任人）

**使用场景：** 项目结束后进行总结和知识沉淀

## 目录结构

```
templates/05-agent-team/
├── README.md                          # 本文件
├── task-template.json                 # 任务定义模板
├── project-status-template.json       # 项目状态模板
├── communication-log-schema.json      # 通信日志Schema
├── retrospective-template.md          # 项目复盘模板
└── examples/                          # 示例项目
    └── example-project/               # 完整示例
        ├── project-status.json
        ├── logs/
        │   └── communication.jsonl
        └── 99-retrospective.md
```

## 使用流程

### 1. 创建新项目

```bash
# 1. 复制任务模板
cp task-template.json projects/{project-name}/task-definition.json

# 2. 修改配置，指定代理、模式、阶段等
# 3. 创建项目状态文件
cp project-status-template.json projects/{project-name}/project-status.json

# 4. 初始化通信日志
mkdir -p projects/{project-name}/logs
touch projects/{project-name}/logs/communication.jsonl
```

### 2. 运行项目

```bash
# 启动 Agent Team
/agent-team --project={project-name} --mode=serial "需求描述"
```

### 3. 跟踪进度

```bash
# 查看项目状态
/agent-team status --project={project-name}

# 或读取状态文件
cat projects/{project-name}/project-status.json | jq
```

### 4. 项目结束

```bash
# 生成复盘报告
cp retrospective-template.md projects/{project-name}/99-retrospective.md
# 填写复盘内容
```

## 消息类型说明

通信日志支持以下消息类型：

| 消息类型 | 用途 | 示例 |
|---------|-----|-----|
| task_assignment | 任务分配 | 协调者分配任务给代理 |
| task_started | 任务开始 | 代理开始执行任务 |
| task_progress | 进度更新 | 代理汇报执行进度 |
| task_completed | 任务完成 | 代理完成任务并提交产出 |
| task_blocked | 任务阻塞 | 代理报告阻塞原因 |
| review_request | 评审请求 | 请求其他代理评审产出 |
| review_response | 评审响应 | 返回评审意见 |
| deliverable_ready | 产出物就绪 | 通知产出物可用 |
| information_request | 信息请求 | 请求补充信息 |
| information_response | 信息响应 | 返回请求的信息 |
| decision_request | 决策请求 | 请求协调者/用户决策 |
| decision_made | 决策已定 | 通知决策结果 |
| status_update | 状态更新 | 代理状态变化通知 |
| handoff | 工作交接 | 任务从一个代理移交给另一个 |
| system_event | 系统事件 | 项目启动/完成等系统级事件 |

## 最佳实践

1. **及时更新状态**：每次任务状态变化时更新 project-status.json
2. **记录关键通信**：重要的决策、评审、交接必须记录到通信日志
3. **保持格式一致**：严格按照模板格式，便于工具解析
4. **定期备份**：项目状态文件是恢复进度的关键，需定期备份
5. **复盘沉淀**：每个项目结束后填写复盘文档，积累团队经验

## 与其他技能的关联

```
ai-pm (主技能)
    ↓ 复杂项目调用
agent-team (多代理协调)
    ↓ 调度
├─ product-manager
├─ architect
├─ ui-designer
├─ data-analyst
└─ tech-writer

ai-pm-data (项目数据管理)
    ↓ 读取
project-status.json (状态可视化)
```
