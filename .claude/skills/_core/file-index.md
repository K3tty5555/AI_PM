# AI_PM 文件索引

> 快速定位关键文件，避免在全库中搜索

## 技能文件 (Skills)

### 主技能
| 文件 | 用途 | 行数 |
|------|------|------|
| `ai-pm/SKILL.md` | 主入口，命令定义 | ~150 |
| `ai-pm/phase-workflows.md` | Phase 0-9 执行流程 | ~300 |
| `ai-pm/user-interaction.md` | 用户交互、风格管理 | ~430 |
| `ai-pm/web-analysis.md` | 网页分析、playwright | ~430 |
| `ai-pm/edge-cases.md` | 边缘情况、需求评审 | ~250 |

### 子技能
| 技能 | 主文件 | 说明 |
|------|--------|------|
| ai-pm-analyze | `ai-pm-analyze/SKILL.md` | 需求分析 |
| ai-pm-research | `ai-pm-research/SKILL.md` | 竞品研究 |
| ai-pm-story | `ai-pm-story/SKILL.md` | 用户故事 |
| ai-pm-prd | `ai-pm-prd/SKILL.md` | PRD 生成 |
| ai-pm-prototype | `ai-pm-prototype/SKILL.md` | 原型生成 |
| ai-pm-review | `ai-pm-review/SKILL.md` | 需求评审 |
| ai-pm-analytics | `ai-pm-analytics/SKILL.md` | 数据分析 |
| ai-pm-ui-spec | `ai-pm-ui-spec/SKILL.md` | UI 规范（将被 ai-pm-config 整合） |
| ai-pm-writing-style | `ai-pm-writing-style/SKILL.md` | 写作风格（将被 ai-pm-config 整合） |
| ai-pm-config | `ai-pm-config/SKILL.md` | 统一配置管理（写作风格+UI规范） |
| agent-team | `agent-team/SKILL.md` | 多代理协作 |
| ai-pm-interview | `ai-pm-interview/SKILL.md` | 现场调研/客户访谈 |

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

### 标准项目结构

```
output/projects/{项目名}/
├── 00-reference-analysis.md      # Phase 0: 参考分析
├── 00-web-analysis/              # Phase 0: 网页分析截图
│   ├── admin.yml                 # 页面快照
│   ├── admin.png                 # 页面截图
│   └── dashboard.png             # 仪表盘截图
├── 01-requirement-draft.md       # Phase 1: 需求澄清
├── 02-analysis-report.md         # Phase 2: 需求分析
├── 03-competitor-report.md       # Phase 3: 竞品研究
├── 04-user-stories.md            # Phase 4: 用户故事
├── 05-prd/                       # Phase 5: PRD
│   ├── 05-PRD-v1.0.md
│   ├── 05-PRD-v1.0.feishu.md
│   └── README.md
├── 06-prototype/                 # Phase 6-8: 原型
│   ├── index.html
│   ├── css/
│   └── js/
├── 07-references/                # 参考资源
│   ├── reference-config.md
│   └── images/
├── 08-review-report-v1.md        # Phase 9: 评审报告
└── 11-field-research/            # 现场调研（可选）
    ├── 00-prep-notes.md          # 准备笔记
    ├── 01-interview-guide.md     # 访谈提纲
    ├── 02-interview-notes.md     # 访谈记录
    ├── 03-prd-draft-v1.md        # PRD草稿v1
    ├── 04-prototype/             # 原型
    ├── 05-iteration-log.md       # 迭代记录
    └── output/                   # 导出交付
```

## 常用文件路径速查

| 需求 | 路径 |
|------|------|
| 修改主技能行为 | `.claude/skills/ai-pm/SKILL.md` |
| 修改 PRD 生成逻辑 | `.claude/skills/ai-pm-prd/SKILL.md` |
| 修改原型生成逻辑 | `.claude/skills/ai-pm-prototype/SKILL.md` |
| 添加 PRD 导出模板 | `templates/prd-styles/default/` |
| 添加 UI 设计规范 | `templates/ui-specs/{规范名}/` |
| 查看项目状态脚本 | `.claude/skills/ai-pm/status-check.sh` |
| 核心协议定义 | `.claude/skills/_core/common-protocol.md` |
| 现场调研模式 | `.claude/skills/ai-pm-interview/SKILL.md` |
| 访谈模板 | `.claude/skills/ai-pm-interview/templates/interview-templates.md` |
| Agent Team 多代理协作 | `.claude/skills/agent-team/SKILL.md` |

## 按功能查找文件

### 用户交互相关
- 需求澄清流程 → `ai-pm/user-interaction.md`
- 风格管理 → `ai-pm/user-interaction.md` + `ai-pm-writing-style/SKILL.md`
- 设计规范选择 → `ai-pm/user-interaction.md` + `ai-pm-ui-spec/SKILL.md`

### 阶段流程相关
- Phase 0 (网页分析) → `ai-pm/web-analysis.md`
- Phase 1-5 主流程 → `ai-pm/phase-workflows.md`
- Phase 6 (数据分析) → `ai-pm-analytics/SKILL.md`
- Phase 7-8 (原型) → `ai-pm-prototype/SKILL.md`
- Phase 9 (评审) → `ai-pm/edge-cases.md` + `ai-pm-review/SKILL.md`

### 导出格式相关
- Markdown (默认) → `ai-pm-prd/SKILL.md`
- PDF 样式 → `templates/prd-styles/default/pdf-style.css`
- 飞书格式 → `templates/prd-styles/default/feishu-template.md`

### 现场调研相关
- 现场调研主流程 → `ai-pm-interview/SKILL.md`
- 访谈模板库 → `ai-pm-interview/templates/interview-templates.md`
- 用户研究员角色 → `ai-pm-interview/agents/user-researcher.md`
- 需求整合师角色 → `ai-pm-interview/agents/requirement-synthesizer.md`

### 多代理协作相关
- Agent Team 主控 → `agent-team/SKILL.md`

### 配置管理相关
- 统一配置管理 → `ai-pm-config/SKILL.md`
- 写作风格配置（旧）→ `ai-pm-writing-style/SKILL.md`
- UI 规范配置（旧）→ `ai-pm-ui-spec/SKILL.md`

---

**提示**: 修改前请先阅读对应 SKILL.md 的执行协议部分
