# AI_PM 文件索引

> 快速定位关键文件，避免在全库中搜索

## 架构核心文件

| 文件 | 用途 |
|------|------|
| `ai-pm/pipeline.json` | **Phase 流程唯一事实来源** - 所有阶段定义、顺序、依赖 |
| `ai-pm/skill-manifest.json` | **技能注册表** - 所有技能状态、依赖关系、版本 |

## 技能文件 (Skills)

### 主技能
| 文件 | 用途 |
|------|------|
| `ai-pm/SKILL.md` | 主入口，命令定义 |
| `ai-pm/phase-workflows.md` | Phase 0-8 执行流程详细说明 |
| `ai-pm/user-interaction.md` | 用户交互、风格管理 |
| `ai-pm/web-analysis.md` | 网页分析、playwright |
| `ai-pm/edge-cases.md` | 边缘情况、需求评审 |

### 活跃子技能
| 技能 | 主文件 | Pipeline Phase | 说明 |
|------|--------|---------------|------|
| ai-pm-analyze | `ai-pm-analyze/SKILL.md` | analysis (2) | 需求分析 |
| ai-pm-research | `ai-pm-research/SKILL.md` | research (3) | 竞品研究 |
| ai-pm-story | `ai-pm-story/SKILL.md` | story (4) | 用户故事 |
| ai-pm-prd | `ai-pm-prd/SKILL.md` | prd (5) | PRD 生成 |
| ai-pm-data | `ai-pm-data/SKILL.md` | analytics (6) | 数据指标+洞察+仪表盘 |
| ai-pm-prototype | `ai-pm-prototype/SKILL.md` | prototype (7) | 原型生成 |
| ai-pm-review | `ai-pm-review/SKILL.md` | review (8) | 九角色需求评审 |
| ai-pm-config | `ai-pm-config/SKILL.md` | - | 统一配置（写作风格+UI规范） |
| ai-pm-interview | `ai-pm-interview/SKILL.md` | - | 现场调研/客户访谈 |
| ai-pm-knowledge | `ai-pm-knowledge/SKILL.md` | - | 产品知识库（stub） |
| agent-team | `agent-team/SKILL.md` | - | 多代理协作 |
| playwright-cli | `playwright-cli/SKILL.md` | - | 浏览器自动化 |

### 已废弃技能（仅保留重定向）
| 技能 | 替代 |
|------|------|
| ai-pm-analytics | → ai-pm-data |
| ai-pm-dashboard | → ai-pm-data |
| ai-pm-data-insight | → ai-pm-data |
| ai-pm-writing-style | → ai-pm-config |
| ai-pm-ui-spec | → ai-pm-config |

## 模板文件 (Templates)

### PRD 风格配置
```
templates/prd-styles/
├── default/
│   ├── style-config.json      # 默认风格配置
│   ├── pdf-style.css          # PDF 导出样式
│   └── feishu-template.md     # 飞书格式模板
└── [用户自定义]/              # 用户上传的风格
```

### UI 规范
```
templates/ui-specs/
├── README.md
├── enterprise-sample/         # 企业规范示例
│   └── design-tokens.json
└── [用户自定义]/              # 用户上传的规范
```

### 配置模板
```
templates/configs/
├── reference-config.md        # 参考资源配置
├── project-config.json        # 项目配置
└── project-config-schema.json # 配置 Schema
```

## 项目输出结构

```
output/projects/{项目名}/
├── 00-reference-analysis.md      # Phase 0: 参考分析
├── 00-web-analysis/              # Phase 0: 网页分析截图
├── 01-requirement-draft.md       # Phase 1: 需求澄清
├── 02-analysis-report.md         # Phase 2: 需求分析
├── 03-competitor-report.md       # Phase 3: 竞品研究
├── 04-user-stories.md            # Phase 4: 用户故事
├── 05-prd/                       # Phase 5: PRD
│   ├── 05-PRD-v1.0.md
│   ├── 05-PRD-v1.0.feishu.md
│   └── README.md
├── 06-prototype/                 # Phase 7: 原型
│   ├── index.html
│   ├── css/
│   └── js/
├── 07-references/                # 参考资源
│   ├── reference-config.md
│   └── images/
├── 08-review-report-v{N}.md      # Phase 8: 评审报告
├── 09-analytics-requirement.md   # Phase 6: 数据埋点需求
└── 11-field-research/            # 现场调研（可选）
```

## 常用文件路径速查

| 需求 | 路径 |
|------|------|
| 查看/修改 Phase 流程定义 | `.claude/skills/ai-pm/pipeline.json` |
| 查看技能注册表 | `.claude/skills/ai-pm/skill-manifest.json` |
| 修改主技能行为 | `.claude/skills/ai-pm/SKILL.md` |
| 修改 PRD 生成逻辑 | `.claude/skills/ai-pm-prd/SKILL.md` |
| 修改原型生成逻辑 | `.claude/skills/ai-pm-prototype/SKILL.md` |
| 添加 PRD 导出模板 | `templates/prd-styles/default/` |
| 添加 UI 设计规范 | `templates/ui-specs/{规范名}/` |
| 现场调研模式 | `.claude/skills/ai-pm-interview/SKILL.md` |
| Agent Team 多代理协作 | `.claude/skills/agent-team/SKILL.md` |

## 按功能查找文件

### 阶段流程相关
- Phase 流程定义 → `ai-pm/pipeline.json`（唯一事实来源）
- Phase 0 (网页分析) → `ai-pm/web-analysis.md`
- Phase 1-5 主流程 → `ai-pm/phase-workflows.md`
- Phase 6 (数据设计) → `ai-pm-data/SKILL.md`
- Phase 7 (原型) → `ai-pm-prototype/SKILL.md`
- Phase 8 (评审) → `ai-pm/edge-cases.md` + `ai-pm-review/SKILL.md`

### 配置管理相关
- 统一配置管理 → `ai-pm-config/SKILL.md`
- 写作风格 → `/ai-pm config style`
- UI 规范 → `/ai-pm config ui`

### 导出格式相关
- Markdown (默认) → `ai-pm-prd/SKILL.md`
- PDF 样式 → `templates/prd-styles/default/pdf-style.css`
- 飞书格式 → `templates/prd-styles/default/feishu-template.md`

---

**提示**: 修改 Phase 流程时，请先修改 `pipeline.json`，再同步更新 `phase-workflows.md` 和 `edge-cases.md`
