---
name: ai-pm-minimal
description: >-
  AI 产品经理主控技能 - 精简版。Token 紧张时使用。
  完整文档见 SKILL.md
---

# AI 产品经理 (精简模式)

## 快速命令

| 命令 | 作用 |
|------|------|
| `/ai-pm "需求"` | 新项目或添加到当前项目 |
| `/ai-pm` | 显示仪表盘 |
| `/ai-pm list` | 项目列表 |
| `/ai-pm status` | 当前项目状态 |
| `/ai-pm switch {项目}` | 切换项目 |
| `/ai-pm new {项目}` | 创建新项目 |
| `/ai-pm quick "需求"` | 快速模式 |
| `/ai-pm yolo "需求"` | 全自动模式 |

## 阶段命令

| 命令 | 阶段 |
|------|------|
| `/ai-pm analyze` | Phase 2: 需求分析 |
| `/ai-pm research` | Phase 3: 竞品研究 |
| `/ai-pm story` | Phase 4: 用户故事 |
| `/ai-pm prd` | Phase 5: PRD生成 |
| `/ai-pm prototype` | Phase 7: 原型生成 |
| `/ai-pm review` | Phase 8: 需求评审 |

## 快捷指令

- `继续` / `下一步` - 执行下一阶段
- `跳过` - 跳过当前阶段
- `看PRD` - 显示 PRD
- `看原型` - 预览原型
- `状态` - 显示进度

## 目录结构

```
output/projects/{项目名}/
├── 01-requirement-draft.md
├── 02-analysis-report.md
├── 03-competitor-report.md
├── 04-user-stories.md
├── 05-prd/README.md
├── 06-prototype/index.html
└── 07-references/
```

## 当前阶段规则

1. **Phase 1 (需求澄清)**: 交互式提问，追问需求
2. **Phase 2-4 (分析)**: 静默执行，产出报告
3. **Phase 5 (PRD)**: 生成后确认
4. **Phase 7 (原型)**: 生成可交互 HTML
5. **Phase 8 (评审)**: 多角色模拟评审

## 完整文档

- phase-workflows.md - 详细流程
- user-interaction.md - 交互模式
- web-analysis.md - 网页分析
- edge-cases.md - 边缘情况
