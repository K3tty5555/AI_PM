# {{项目名}}

{{一句话项目定位 —— 包含核心场景、用户、业务目标}}

**当前版本**：{{V1.x}}（{{档期}}）
**当前阶段**：{{Phase 描述，如「PRD V1.0 已定稿，原型待启动」/「原型已完成 N/12，待评审」}}
**关键时间点**：{{硬节点 1-3 条，如「6/1 试点 Go Live · 9/1 商业化」}}

## 索引

- 📋 PRD 历史 / 当前活跃版本 → [`05-prd/README.md`](./05-prd/README.md)
- 📂 参考资料 / 业务知识 / 调研 → [`07-references/README.md`](./07-references/README.md)
- 🧠 AI 项目记忆（动态状态）→ `_memory/`
- ⚙️ 状态配置 → `_status.json`
- 🎯 当前事实基线 → `01-baseline-manifest.json`
- 🔎 跨产物登记 → `_status.json` 的 `artifacts[]`

{{可选：}}
- 🎨 视觉锚点包 → `06-prototype-visual/`（如有 Codex 生成的视觉稿）
- 📊 数据分析与指标产物 → `09-analytics/`（如有指标、洞察、仪表盘、反馈分析）
- 📈 上线影响记录 → `09-analytics/impact-record.json`（如已上线并开始观察）
- 🖼️ PRD / 流程图配图 → `11-illustrations/`（如有 AI 配图）
- 🧪 现场调研草案 → `12-field-research/`（如有现场调研）
- 📣 上线文档 → `13-release-docs/`（如有公告 / 操作手册）
- ✅ 验收材料 → `14-acceptance/`（如有验收清单）
- 🚀 试点材料 → `15-pilot/`（如有试点计划 / 试点名单）
- 💻 工程代码仓 → `{{绝对路径}}`

## {{业务相关补充段落，如试点学校 / 客户列表 / 关键联系人，AI 不要编造}}

## 上游产物版本归属

> **当 PRD 多版本迭代时，01-04 上游产物（需求草稿 / 需求分析 / 竞品研究 / 用户故事）也按版本拆分**。文件名后缀 `-Vx.md` 标明版本归属；frontmatter 含 `version / status` 自描述。
>
> 单 PRD 项目可省略本段。

| 产物 | {{V1.0}} | {{V1.1（当前活跃）}} | {{V2.0（草稿）}} |
|---|---|---|---|
| 01 需求草稿 | `01-requirement-draft/V1.md` 历史定稿 | ⚠️ `V2.md` 占位待补 | — |
| 02 需求分析 | `02-analysis-report/V1.md` 历史定稿 | ⚠️ `V2.md` 占位待补 | — |
| 03 竞品研究 | `03-competitor-report/V1.md` 历史定稿 | ⚠️ `V2.md` 占位待补 | — |
| 04 用户故事 | `04-user-stories/V1.md` 历史定稿 | ⚠️ `V2.md` 占位待补 | — |
| 05 PRD | 详见 `05-prd/README.md` | 详见 `05-prd/README.md` | 详见 `05-prd/README.md` |
| 06 原型 | — | ⚠️ 待启动 | — |
| 08 评审 | `08-reviews/V1-initial.md` | ✅ / ⚠️ | — |

**版本约定**：
- 0x 上游产物**用文件夹**组织（详见 `templates/project-index/README.md` 的「0x 上游产物文件夹约定」段）
- 每个 0x 文件夹内 `Vx.md` frontmatter 含 `version` / `status` 字段自描述
- 新版本占位文档由 ai-pm-analyze / ai-pm-story / ai-pm-research 启动正式产出时**重写**（不是修改）
- 08 评审用 `08-reviews/` 文件夹，多次评审按 `V{n}-{round/version}.md` 命名

---

*本索引由 ai-pm / ai-pm-prototype skill 自动维护（版本号变化、原型完成时同步 patch）；PM review 后定稿。*
