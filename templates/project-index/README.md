# 项目 README 索引模板

每个 `output/projects/{项目名}/` 下应有 3 份 README，由 ai-pm / ai-pm-prd / ai-pm-prototype skill 自动维护：

| 模板 | 落地路径 | 维护者 / 触发时机 |
|------|---------|------------------|
| `root-readme.template.md` | `{项目}/README.md` | ai-pm 初始化生成；ai-pm-prototype 改「当前阶段」；版本号变化改「当前版本」 |
| `prd-readme.template.md` | `{项目}/05-prd/README.md` | ai-pm-prd 生成/修改/重命名/废弃 PRD 时 patch |
| `references-readme.template.md` | `{项目}/07-references/README.md` | 手动加/删 references 时 AI 提示 patch；用途不确定标 `[待 PM 补充]` |

## 使用方式

模板里 `{{占位符}}` 由 AI 用项目实际信息替换。新项目初始化时，ai-pm skill 应：

1. 复制 `root-readme.template.md` 到 `{项目}/README.md`，填充已知字段
2. 复制 `prd-readme.template.md` 到 `{项目}/05-prd/README.md`，PRD 表格初始为空
3. 复制 `references-readme.template.md` 到 `{项目}/07-references/README.md`，参考资料表格初始为空
4. 后续由对应 skill 在生成 PRD / 加 references 时自动 patch

## 防编造约束

- **PRD 状态字段**：只能从枚举选（`A 级定稿 / B 级 / C 级 / 草稿 / 已废弃 / 已超出版本`），不能自创
- **references 用途**：不确定写 `[待 PM 补充]`，不许猜
- **历史链**：AI patch 时只 INSERT 新条目，不 DELETE/REWRITE 旧条目
- **跨版本关系**：必须从 PRD 正文「版本范围说明」抽取，不能自己推断

## 0x 上游产物文件夹约定（重要）

**所有 0x 上游产物都用文件夹组织**——和 05-prd/ 06-prototype/ 07-references/ 10+ 扩展目录保持一致的根目录命名风格，根目录不再被多版本文件撑满。

### 目录结构

```
{项目}/
├── 01-requirement-draft/
│   ├── README.md        ← 版本索引（可选；单 PRD 项目可省略）
│   ├── V1.md
│   ├── V2.md
│   └── V3.md
├── 02-analysis-report/
│   ├── V1.md
│   └── V2.md
├── 03-competitor-report/
│   └── V1.md
├── 04-user-stories/
│   └── V1.md
├── 05-prd/              ← 已是文件夹（不变）
├── 06-prototype/        ← 已是文件夹（不变）
├── 07-references/       ← 已是文件夹（不变）
├── 08-reviews/          ← 同 phase 多次评审都放这里
│   ├── README.md        ← 评审历史索引（可选）
│   ├── V1-initial.md
│   ├── V3-initial.md
│   ├── V3-round2.md
│   └── V3-v1.3.md
├── 09-analytics/        ← 数据分析与指标产物
├── 10-retrospective.md  ← 项目复盘（单文件）
└── 11+ 注册扩展目录      ← 见下方「10+ 扩展目录注册表」
```

### Frontmatter 自描述（每个文件夹内 Vx.md 文件头）

```markdown
---
version: V2
status: 历史定稿     # 枚举：历史定稿 / A 级定稿 / 草稿 / 待补 / 已废弃
phase: 需求草稿       # 01-04 / 08 对应的 phase 中文名
upstream-from: V1.md  # 可选，指向同文件夹上一版
created: 2026-03-10
note: V2「{场景}」时期产出。V3 需重新走 01-04 流程。
---
```

### 占位文档结构（V{新} 待补时）

```markdown
---
version: V3
status: 待补
phase: 需求草稿
upstream-from: V2.md
---

# 01 需求草稿 V3 · 占位

> 待补。本期 V3「{场景}」...

## 跟 V2 的差异
- ...

## 占位项
- [ ] ...

## 上游引用
- V2 同期：[`V2.md`](./V2.md)
- V3 PRD：`05-prd/...`

---
*占位文档。正式启动 V3 时由 ai-pm-{phase} 重写。*
```

### 子目录 README.md（多版本时可选）

```markdown
# 01 需求草稿 · 版本索引

| 版本 | 文件 | 状态 | 主交付 |
|---|---|---|---|
| V1 | `V1.md` | 历史定稿 | 一句话主交付 |
| V2 | `V2.md` | 历史定稿 | 一句话主交付 |
| V3 | `V3.md` | 待补 | — |

> 跨版本关系详见根 README「上游产物版本归属」表。
```

### 单 PRD 项目

单 PRD 项目（V1.0 唯一版本）也用文件夹结构：

```
01-requirement-draft/
└── V1.md
```

虽然只有一个 V1.md，但保持命名一致；后续升级到 V2 时只需新建 `V2.md` 即可，零迁移成本。

### 临界点处理

单 PRD → 多 PRD 临界点（项目即将从 V1 进入 V2）时，**不需要 rename**——V1.md 已在文件夹里。直接在同文件夹添加 V2.md 即可。这是 v2 文件夹约定相比 v1 `-Vx` 后缀的最大优势。

## 详细设计 / 实施计划

- 设计：`docs/plans/2026-05-25-project-readme-index-design.md`
- 实施计划：`docs/plans/2026-05-25-project-readme-index-impl.md`

## 试点参考

某 Agent 项目（`output/projects/{你的项目名}/`）已 retrofit 这 3 份 README 作为 baseline，可参考其结构和粒度。

## 10+ 扩展目录注册表

10 以后不得再自由占号。新增项目专项资产前，先复用下表；确实需要新类型时，先更新本表和 `ai-pm/SKILL.md` 的目录树，再让 skill 产出。

| 路径 | 用途 | 说明 |
|---|---|---|
| `09-analytics/` | 数据分析与指标产物 | 指标设计、洞察报告、数据驱动需求、仪表盘、反馈分析、增长诊断统一放这里 |
| `09-analytics/analytics-requirement.md` | 埋点方案 / 指标设计 | 原 `09-analytics-requirement.md` 迁入此路径 |
| `09-analytics/data-insight-report.md` | 数据洞察报告 | 原 `10-data-insight-report.md` 迁入此路径 |
| `09-analytics/data-driven-requirements.md` | 数据驱动需求 | 原 `11-data-driven-requirements.md` 迁入此路径 |
| `09-analytics/dashboard/` | 数据仪表盘 | 原 `12-data-insight-dashboard/` 迁入此路径 |
| `09-analytics/feedback-analysis.md` | 用户反馈文本分析 | 原 `14-feedback-analysis.md` 迁入此路径 |
| `09-analytics/growth-diagnosis/` | 增长诊断 / 增长分析专项 | 例如旧 `09-growth-diagnosis/` |
| `10-retrospective.md` | 项目复盘 | 保持单文件 |
| `11-illustrations/` | PRD / 流程图 AI 配图 | 被 PRD 导出与插图命令使用，编号固定 |
| `12-field-research/` | 现场调研草案隔离区 | 原 `11-field-research/` 迁入此路径，避免与插图冲突 |
| `13-release-docs/` | 上线文档套件 | 更新公告 + 操作手册 |
| `14-acceptance/` | 验收清单 / 验收记录 | 不生成 QA 全量用例，只放 PM/业务验收材料 |
| `15-pilot/` | 试点计划 / 试点名单 / 试点脚本 | 试点执行材料 |
| `16-agent-skills/` | Agent 技能规格 | prompt、tools、test cases、共享上下文 |
| `17-next-version-prep/` | 下版本准备 | VNext 草稿、范围预研、版本差异准备 |
| `_logs/` | 运行日志 / 临时调试日志 | 原 `logs/` 迁入此路径 |

`output/` 顶层只允许放容器目录：`projects/`、`_archive/`、`_prd-corpus/`、`strategy-sandbox/`、`weekly/`、`priority/` 等。一次性分享资产、临时演示工程不放顶层，归档到 `output/_archive/`。
