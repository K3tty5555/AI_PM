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

## 多版本 0x 文件约定（重要）

当项目跨多个 PRD 版本迭代时，**01-04 上游产物也必须按版本拆分**，避免 AI 把旧版本的需求草稿误当作当前版本上下文。

### 文件命名

```
01-requirement-draft-V1.md     ← V1 时期需求草稿（历史定稿）
01-requirement-draft-V2.md     ← V2 时期需求草稿（历史定稿或当前活跃）
01-requirement-draft-V3.md     ← V3 时期占位（待补）
02-analysis-report-V1.md
02-analysis-report-V2.md
...
```

### Frontmatter 自描述（每个 0x-*-Vx.md 文件头）

```markdown
---
version: V2
status: 历史定稿     # 枚举：历史定稿 / A 级定稿 / 草稿 / 待补 / 已废弃
phase: 需求草稿       # 01-04 对应的 phase 中文名
upstream-from: 01-requirement-draft-V1.md  # 可选，指向上一版同名文件
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
upstream-from: 01-requirement-draft-V2.md
---

# 01 需求草稿 V3 · 占位

> 待补。本期 V3「{场景}」...

## 跟 V2 的差异
- ...

## 占位项
- [ ] ...

## 上游引用
- V2 同期：[`01-requirement-draft-V2.md`](./...)
- V3 PRD：`05-prd/...`

---
*占位文档。正式启动 V3 时由 ai-pm-{phase} 重写。*
```

### 单 PRD 项目可省略

单 PRD 项目（V1.0 唯一版本）按现有 `01-requirement-draft.md` 无后缀命名即可，不强制加 V1 后缀。**多版本启动时** ai-pm-analyze / ai-pm-story / ai-pm-research / ai-pm-prd 落盘前**先检查**是否单版本→多版本临界点，触发 rename。

## 详细设计 / 实施计划

- 设计：`docs/plans/2026-05-25-project-readme-index-design.md`
- 实施计划：`docs/plans/2026-05-25-project-readme-index-impl.md`

## 试点参考

「某教育 AI 助手」项目（`output/projects/某教育 AI 助手/`）已 retrofit 这 3 份 README 作为 baseline，可参考其结构和粒度。
