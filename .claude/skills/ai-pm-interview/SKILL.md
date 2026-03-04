---
name: ai-pm-interview
description: >-
  现场调研/客户访谈模式。适用于线下与客户面对面沟通场景，
  支持结构化访谈、实时记录、现场生成 PRD/原型、快速迭代调优。
  专为已有功能改进需求的现场调研设计。
argument-hint: "[已有功能名或 --project=项目名]"
allowed-tools: Read Write Edit Bash(ls) Bash(mkdir) Bash(cat) Bash(test) Bash(cd) Bash(pwd)
parent: ai-pm
---

# 现场调研/客户访谈模式

## 概述

现场调研模式专为**线下与客户面对面沟通**场景设计，帮助你：

- 🎤 **结构化访谈** - 按框架提问，不遗漏关键点
- 📝 **实时记录** - 记录客户原话，保留真实需求
- ⚡ **现场生成** - 快速产出 PRD/原型，当场展示
- 🔄 **迭代调优** - 根据反馈快速调整，反复确认

## 适用场景

| 场景 | 示例 |
|-----|------|
| 内部业务方调研 | 去销售部门调研 CRM 改进需求 |
| 外部客户访谈 | 拜访大客户，收集产品反馈 |
| 现场需求确认 | 在客户现场确认需求细节 |
| 敏捷迭代沟通 | 与核心用户快速迭代方案 |

## 工作流程

```
Phase 0: 准备阶段（访谈前）
    ↓ 了解已有功能背景
    ↓ 准备访谈提纲

Phase 1: 现场访谈（与客户面对面）
    ↓ 结构化提问
    ↓ 实时记录客户反馈

Phase 2: 快速生成（现场产出）
    ↓ 基于访谈记录生成 PRD/原型
    ↓ 现场展示给客户

Phase 3: 迭代调优（反复沟通）
    ↓ 收集客户反馈
    ↓ 快速调整方案

Phase 4: 导出交付
    ↓ 生成完整文档
```

> 📋 **Phase 0-3 执行详情**：[interview-phases.md](./interview-phases.md)（文件管理、断点续传、访谈流程）
> 📤 **Phase 4 导出 + 快捷指令 + Agent Team**：[interview-output.md](./interview-output.md)

---

## 与标准模式的关系

**现场调研模式** vs **标准模式**：

| 对比项 | 现场调研模式 | 标准模式 |
|-------|-------------|---------|
| **适用场景** | 线下现场、面对面 | 线上、异步 |
| **速度要求** | 极快（现场） | 正常 |
| **文档详细度** | 精简版 | 完整版 |
| **迭代方式** | 实时迭代 | 阶段性迭代 |
| **输出** | PRD草案+原型 | 完整PRD+原型+数据设计 |

**模式转换**：
- 现场调研结束后，可选择转入标准模式继续完善
- 标准模式可以复用现场调研的访谈记录

---

## Anti-Pattern

- ❌ 不要在现场花太长时间写详细文档
- ❌ 不要一次性问完所有问题再记录
- ❌ 不要过度解读客户需求
- ❌ 不要承诺无法实现的交付时间
- ❌ 不要让客户等待太久（生成时间要短）

---

## 关联文件

- [SKILL.md](../ai-pm/SKILL.md) - 主技能入口
- [user-interaction.md](../ai-pm/user-interaction.md) - 用户交互模式
- [interview-templates.md](./templates/interview-templates.md) - 访谈模板库
- [interview-phases.md](./interview-phases.md) - Phase 0-3 执行详情、文件管理、断点续传
- [interview-output.md](./interview-output.md) - Phase 4 导出、快捷指令、Agent Team 协作
