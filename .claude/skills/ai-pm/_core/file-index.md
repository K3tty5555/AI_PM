# 技能文件索引

快速定位各功能所在文件，减少盲目翻找。

## 主控技能

| 文件 | 内容 |
|------|------|
| `ai-pm/SKILL.md` | 入口、命令路由表、阶段流程、Phase 文件指针 |

## Phase 文件

| 文件 | 阶段 |
|------|------|
| `ai-pm/phases/phase-0-office-hours.md` | 需求速评（可选） |
| `ai-pm/phases/phase-1-requirement.md` | 需求澄清 |
| `ai-pm/phases/phase-2-analysis.md` | 需求分析 |
| `ai-pm/phases/phase-3-research.md` | 竞品研究 |
| `ai-pm/phases/phase-4-stories.md` | 用户故事 |
| `ai-pm/phases/phase-5-prd.md` | PRD 生成（调用 ai-pm-prd） |
| `ai-pm/phases/phase-6-analytics.md` | 数据埋点（可选） |
| `ai-pm/phases/phase-7-prototype.md` | 原型生成（调用 ai-pm-prototype） |
| `ai-pm/phases/phase-8-review.md` | 需求评审（调用 ai-pm-review） |
| `ai-pm/phases/phase-9-retrospective.md` | 项目复盘（可选） |

## 参考文档

| 文件 | 内容 |
|------|------|
| `ai-pm/references/user-interaction.md` | 路径解析、启动界面、_status.json 规范、记忆迁移 |
| `ai-pm/references/symptom-index.md` | 常见场景速查 + Anti-Pattern |
| `ai-pm/references/project-memory.md` | 项目记忆系统规范（L0/L1/L2） |
| `ai-pm/references/localization-card.md` | 本地化引擎（一页纸过滤器）：外借框架入库前的三步过滤 + 术语表 + 标记约定 |
| `ai-pm/references/risk-frameworks.md` | 上线前风险预演（pre-mortem 本地化），phase-8 评审前强制前置 |
| `ai-pm/references/discovery-frameworks.md` | 假设-验证纪律（discovery 本地化），ai-pm-analyze 新场景/新用户行为时强制 |
| `ai-pm/references/data-rigor-frameworks.md` | 数据严谨度（cohort/留存曲线/AB显著性 本地化），ai-pm-data 真做留存/AB 时强制 |
| `ai-pm/references/competitive-frameworks.md` | 竞品对标卡（battlecard 本地化），ai-pm-research 对销售/竞品压力场景才触发 |

## 扩展功能文件

| 文件 | 内容 |
|------|------|
| `ai-pm/doctor.md` | 22 项健康检查 |
| `ai-pm/illustration.md` | AI 流程图生成 |
| `ai-pm/instinct.md` | 自学习系统 |
| `ai-pm/web-analysis.md` | 网页分析（Playwright） |

## 子技能参考文档

| 文件 | 内容 |
|------|------|
| `ai-pm-prd/references/prd-structure.md` | PRD 8章结构模板（无模板时兜底） |
| `ai-pm-prd/references/export-guide.md` | PDF/DOCX 导出实现（build-pdf-html.js + 三条路径） |

## 工具脚本

| 文件 | 用途 |
|------|------|
| `ai-pm/scripts/docx_to_md.py` | DOCX → Markdown 转换 |
| `ai-pm/scripts/pdf_to_images.py` | PDF → PNG 逐页渲染 |
| `ai-pm-prd/md2docx.py` | Markdown + 截图 → DOCX |
| `ai-pm-prd/build-pdf-html.js` | Markdown → HTML（PDF 构建用） |
