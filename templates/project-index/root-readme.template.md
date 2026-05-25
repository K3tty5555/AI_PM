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

{{可选：}}
- 🎨 视觉锚点包 → `06-prototype-visual/`（如有 Codex 生成的视觉稿）
- 💻 工程代码仓 → `{{绝对路径}}`

## {{业务相关补充段落，如试点学校 / 客户列表 / 关键联系人，AI 不要编造}}

## 上游产物版本归属

> **当 PRD 多版本迭代时，01-04 上游产物（需求草稿 / 需求分析 / 竞品研究 / 用户故事）也按版本拆分**。文件名后缀 `-Vx.md` 标明版本归属；frontmatter 含 `version / status` 自描述。
>
> 单 PRD 项目可省略本段。

| 产物 | {{V1.0}} | {{V1.1（当前活跃）}} | {{V2.0（草稿）}} |
|---|---|---|---|
| 01 需求草稿 | `01-requirement-draft-V1.md` 历史定稿 | ⚠️ 待补 / 占位 | — |
| 02 需求分析 | `02-analysis-report-V1.md` 历史定稿 | ⚠️ 待补 / 占位 | — |
| 03 竞品研究 | `03-competitor-report-V1.md` 历史定稿 | ⚠️ 待补 / 占位 | — |
| 04 用户故事 | `04-user-stories-V1.md` 历史定稿 | ⚠️ 待补 / 占位 | — |
| 05 PRD | 详见 `05-prd/README.md` | 详见 `05-prd/README.md` | 详见 `05-prd/README.md` |
| 06 原型 | — | ⚠️ 待启动 | — |
| 08 评审 | — | ✅ / ⚠️ | — |

**版本约定**：
- 文件名后缀 `-Vx.md` 标明所属版本
- 每个 0x 文件 frontmatter 含 `version` / `status` 字段（`历史定稿 / A 级定稿 / 草稿 / 待补 / 已废弃`）自描述
- 新版本占位文档由 ai-pm-analyze / ai-pm-story / ai-pm-research 启动正式产出时**重写**（不是修改）

---

*本索引由 ai-pm / ai-pm-prototype skill 自动维护（版本号变化、原型完成时同步 patch）；PM review 后定稿。*
