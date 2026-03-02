---
name: ai-pm-knowledge
description: >-
  产品知识库管理技能。沉淀产品方法论、设计模式、决策记录，
  支持跨项目经验复用。自动提取项目中的关键决策、设计模式、
  踩坑记录，构建可检索的产品知识图谱。
argument-hint: "[search|add|list|sync] [关键词或内容]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(rm) Read
---

# 产品知识库管理

## 定位

AI_PM 的**知识中枢**，负责产品经验的沉淀、组织和复用。

- **跨项目共享**：所有项目产出的经验自动沉淀到知识库
- **智能检索**：支持语义搜索，快速找到相关经验
- **模式提取**：自动识别重复出现的问题和解决方案
- **决策追踪**：记录关键决策及其上下文，便于复盘

## 知识库结构

```
templates/knowledge-base/
├── patterns/                   # 设计模式库
│   ├── user-onboarding/        # 用户引导模式
│   ├── permission-design/      # 权限设计模式
│   ├── data-visualization/     # 数据可视化模式
│   └── .../
├── decisions/                  # 决策记录 (ADRs)
│   ├── 001-why-not-websocket.md
│   ├── 002-mobile-first.md
│   └── .../
├── pitfalls/                   # 踩坑记录
│   ├── third-party-integration.md
│   ├── performance-optimization.md
│   └── .../
├── metrics/                    # 度量指标库
│   ├── saas-metrics.md
│   ├── engagement-metrics.md
│   └── .../
├── playbooks/                  # 场景化手册
│   ├── 0-1-product-launch.md   # 从0到1产品上线
│   ├── b2b-sales-enablement.md # B端销售赋能
│   └── .../
└── insights/                   # 洞察报告
    ├── user-behavior-patterns.md
    └── market-trend-analysis.md
```

## 自动沉淀机制

### 1. 项目结束时自动提取

```
项目完成 → 扫描项目产出 → 提取可复用知识 → 存入知识库
```

**自动提取的内容：**
- 用户故事中的典型场景 → 存入 patterns/
- PRD中的技术决策 → 存入 decisions/
- 评审中发现的问题 → 存入 pitfalls/
- 效果验证中的指标 → 存入 metrics/

### 2. 知识卡片格式

```markdown
---
id: PATTERN-001
category: user-onboarding
tags: [mobile, saas, activation]
source-project: meeting-assistant-20260228
created: 2026-03-01
confidence: high  # high/medium/low (基于验证次数)
---

# 模式：渐进式功能引导

## 问题场景
用户首次使用复杂功能时，面对全部功能会感到 overwhelm，导致放弃。

## 解决方案
采用"渐进披露"策略：
1. 首次进入：展示核心功能入口（3个以内）
2. 操作触发：在用户使用过程中逐步引导高级功能
3. 成就解锁：完成基础操作后，解锁进阶功能

## 实现要点
- 使用 Tooltip + 高亮的组合引导
- 记录用户进度，下次进入继续引导
- 提供"跳过"选项，尊重用户选择

## 验证数据
- 原方案完成率：23%
- 渐进引导完成率：67%
- 用户满意度：4.2/5

## 适用场景
- [x] 功能复杂的专业工具
- [x] 首次使用体验
- [ ] 简单功能（过度设计）

## 相关模式
- 空状态设计 (PATTERN-003)
- 新手任务系统 (PATTERN-012)
```

## 命令体系

| 命令 | 作用 | 示例 |
|------|------|------|
| `/ai-pm knowledge search {关键词}` | 搜索相关知识 | `knowledge search 权限设计` |
| `/ai-pm knowledge add` | 手动添加知识 | `knowledge add` |
| `/ai-pm knowledge list` | 列出知识分类 | `knowledge list --category=patterns` |
| `/ai-pm knowledge sync` | 同步项目知识到知识库 | `knowledge sync` |
| `/ai-pm knowledge suggest` | 基于当前项目推荐相关知识 | `knowledge suggest` |

## 与主流程集成

### PRD生成阶段：智能推荐

```
AI: 基于你的需求，我发现知识库中有以下相关经验：

📚 相关设计模式：
   1. 渐进式功能引导 - 适用于复杂工具的首页设计
   2. 空状态情感化设计 - 提升用户留存

💡 是否查看详细方案？（回复数字查看）
```

### 评审阶段：经验提醒

```
AI: ⚠️ 知识库提醒

检测到你正在设计【权限系统】，知识库中有 3 个相关踩坑记录：
   1. RBAC vs ABAC 选型决策
   2. 权限粒度设计的权衡
   3. 数据权限的性能优化

建议在评审前查看，避免重复踩坑。
```

### 项目复盘：自动归档

```
项目完成！正在分析可沉淀的知识...

✅ 发现可复用经验：
   • 设计模式：新手引导流程 → 已保存到 patterns/user-onboarding/
   • 决策记录：选择 WebSocket 而非轮询 → 已保存到 decisions/
   • 踩坑记录：第三方登录适配问题 → 已保存到 pitfalls/

这些经验将在后续项目中自动推荐。
```

## 知识图谱构建

自动构建知识点之间的关联：

```
权限设计 → 数据安全 → 合规要求 → GDPR
    ↓
角色管理 → 组织层级 → 审批流程
    ↓
数据权限 → 行级过滤 → 性能优化
```

## Anti-Pattern

- ❌ 不要存储敏感信息（账号密码、内部数据）
- ❌ 不要存储项目特定的业务逻辑
- ❌ 不要存储未验证的假设
- ✅ 只存储经过验证的可复用经验
