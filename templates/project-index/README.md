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

## 详细设计 / 实施计划

- 设计：`docs/plans/2026-05-25-project-readme-index-design.md`
- 实施计划：`docs/plans/2026-05-25-project-readme-index-impl.md`

## 试点参考

「某教育 AI 助手」项目（`output/projects/某教育 AI 助手/`）已 retrofit 这 3 份 README 作为 baseline，可参考其结构和粒度。
