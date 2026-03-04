# AI_PM 技能依赖关系

> 技能注册表的唯一事实来源：[skill-manifest.json](../ai-pm/skill-manifest.json)

## 调用关系图

```
                    ┌─────────────────┐
                    │    用户输入      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   ai-pm (主控)   │
                    │   SKILL.md      │
                    │   pipeline.json │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│ ai-pm-analyze │   │ ai-pm-research│   │ ai-pm-story   │
│ Phase 2       │   │ Phase 3       │   │ Phase 4       │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  ai-pm-prd      │
                    │  Phase 5        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼──────┐ ┌─────▼───────────┐
     │ ai-pm-data    │ │ ai-pm-    │ │ ai-pm-prototype │
     │ Phase 6       │ │ config    │ │ Phase 7         │
     └───────────────┘ │ (utility) │ └─────────────────┘
                       └───────────┘
                             │
                    ┌────────▼────────┐
                    │ ai-pm-review    │
                    │ Phase 8         │
                    └─────────────────┘
```

## 扩展技能

### 现场调研模式 (ai-pm-interview)

```
                    ┌─────────────────┐
                    │  /ai-pm interview│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ ai-pm-interview │
                    │  现场调研主控    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
     │ 用户研究员     │ │ 需求整合师│ │  ai-pm-prd  │
     │ 访谈执行       │ │ 需求提取  │ │  PRD生成    │
     └───────────────┘ └──────────┘ └─────────────┘
```

### 多代理协作 (agent-team)

```
                    ┌─────────────────┐
                    │  /agent-team    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   agent-team    │
                    │   任务调度器     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│  产品经理代理  │   │   架构师代理   │   │  UI设计师代理  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│  数据分析师    │   │  文档工程师    │   │   用户研究员   │
└───────────────┘   └───────────────┘   └───────────────┘
```

## 依赖关系表

| 技能 | Pipeline Phase | 依赖技能 | 被谁依赖 |
|------|---------------|---------|---------|
| ai-pm | 主控 | 所有子技能 | - |
| ai-pm-analyze | 2 | - | ai-pm-story, ai-pm-prd |
| ai-pm-research | 3 | - | ai-pm-prd |
| ai-pm-story | 4 | ai-pm-analyze | ai-pm-prd |
| ai-pm-prd | 5 | analyze/research/story | ai-pm-data, prototype, review |
| ai-pm-data | 6 | ai-pm-prd | ai-pm-prototype |
| ai-pm-prototype | 7 | ai-pm-prd, ai-pm-config | ai-pm-review |
| ai-pm-review | 8 | ai-pm-prd, prototype | - |
| ai-pm-config | utility | - | ai-pm, prototype |
| ai-pm-interview | entry | agent-team, ai-pm-prd | ai-pm |
| agent-team | infra | - | ai-pm, ai-pm-interview |

## 数据流向

### Pipeline 数据流 (Phase 0-8)
```
用户输入 → 00-reference-analysis.md → 01-requirement-draft.md
                                        ↓
                                02-analysis-report.md
                                        ↓
                                03-competitor-report.md
                                        ↓
                                04-user-stories.md
                                        ↓
                              05-prd/05-PRD-v1.0.md → 09-analytics-requirement.md
                                                              ↓
                                                    06-prototype/index.html
                                                              ↓
                                                    08-review-report-v{N}.md
                                                              ↓
                                                    05-prd/05-PRD-v1.0.md (原地更新)
```

### PRD 版本管理策略
- **策略**: 原地更新 (in-place)
- **不创建新文件**: 直接在 `05-PRD-v1.0.md` 中修改
- **变更追踪**: 修订日志章节 + Git 历史
- **详见**: `pipeline.json` → `prdVersioning`

---

**提示**: 技能状态和依赖关系的权威定义在 `skill-manifest.json`，本文件仅作可视化参考
