# 验收提单台账模板库

存团队的「产品验收台账」格式，供 `/ai-pm acceptance`（ai-pm-acceptance 技能）出台账时用。跟 `prd-styles`（PRD 写作风格）一个套路——**我们给一套默认的，团队能自设**。

## 结构

```
acceptance-templates/
├── default/template-config.json        # 🏭 默认 9 列（飞书提单台账），必需
└── {你的模板名}/template-config.json    # 👤 团队自设
```

## 默认模板（default）

9 列：`版本 / 序号 / 问题描述 / 截图 / 问题类型 / 优先级 / 提出人 / 研发责任人 / 处理状态`。

## 怎么自设

1. 复制 `default/` 为 `{你的模板名}/`。
2. 改 `template-config.json` 的 `columns`（增删列 / 改标题宽度 / 给截图列标 `type: image` / 设 `align`、`wrap`）。
3. 用 `/ai-pm acceptance --template={你的模板名}` 启用，或 `/ai-pm config acceptance` 切换。

## template-config.json 字段说明

| 字段 | 说明 |
|---|---|
| `templateInfo` | `name` / `description` |
| `columns[]` | `key`（对应 issues.json 里的字段名）/ `title`（表头）/ `width` / `align`(left/center) / `wrap` / `type`（=image 则嵌截图缩略图）|
| `fillRule` | `aiFills[]`（AI 填哪些列）/ `leaveBlank[]`（留空给人的列）/ `note`。**铁律：判定/处理状态列务必进 leaveBlank，AI 不自动填。** |
| `render` | `headerFill`（表头底色）/ `font` / `thumbWidth`（截图缩略图宽 px）|

> issues.json 每条记录的字段名要跟你模板 columns 的 `key` 对应；生成器只渲染 columns 里列出的列。
