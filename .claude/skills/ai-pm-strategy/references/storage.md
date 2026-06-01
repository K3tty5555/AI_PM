# 存储与版本规范

战略沙盘产出独立存放，不进入 `output/projects/`。

## 根目录

```text
output/strategy-sandbox/
├── README.md
├── product-registry.md
├── project-level/
└── product-level/
```

## 项目级目录

```text
output/strategy-sandbox/project-level/{项目名}/
├── README.md
└── topics/
    └── {议题类型}-{短标题}/
        ├── README.md
        ├── drafts/
        │   └── YYYY-MM-DD-HHMM/
        │       └── 00-session-snapshot.md
        ├── V1-YYYY-MM-DD/
        │   ├── 00-session.md
        │   ├── 01-strategy-memo.md
        │   ├── 02-assumptions.md
        │   └── 03-briefing-qa.md
        └── V2-YYYY-MM-DD/
            ├── 00-session.md
            ├── 01-strategy-memo.md
            ├── 02-assumptions.md
            ├── 03-briefing-qa.md
            └── 04-delta-from-v1.md
```

## 产品级目录

```text
output/strategy-sandbox/product-level/{产品名}/
├── README.md
└── topics/
    └── {议题类型}-{短标题}/
        ├── README.md
        └── V1-YYYY-MM-DD/
            ├── 00-session.md
            ├── 01-strategy-memo.md
            ├── 02-project-portfolio-map.md
            ├── 03-assumptions.md
            └── 04-briefing-qa.md
```

## 层级职责

| 文件 | 作用 |
|---|---|
| `strategy-sandbox/README.md` | 全部沙盘索引 |
| `product-registry.md` | 产品-项目关系表 |
| `{对象}/README.md` | 某个项目或产品下的议题索引 |
| `{议题}/README.md` | 该议题历次推演、观点变化、未关闭问题 |
| `Vx-日期/` | 某一轮正式沙盘产出 |
| `drafts/` | 临时草稿，不视为正式沉淀 |

## 议题命名

目录格式：

```text
topics/{议题类型}-{自定义短标题}/
```

默认议题类型：

- 下一阶段方向
- 资源取舍
- 增长瓶颈
- 商业化客户价值
- 竞争应对
- 用户心智
- 能力建设
- 组织协同

示例：

```text
topics/下一阶段方向-智能体后续主线/
topics/资源取舍-作业与智能体协同投入/
topics/竞争应对-AI学习助手市场窗口/
```

## 保存规则

- 默认不保存。
- 正式保存：生成 `Vx-YYYY-MM-DD/`。
- 草稿保存：生成 `drafts/YYYY-MM-DD-HHMM/`。
- 不覆盖旧版本。
- 同议题多轮讨论生成 `V1`、`V2`、`V3`。
- 从 `V2` 开始必须生成 delta 文件。

delta 记录：

- 哪些判断变了
- 哪些假设被强化
- 哪些假设被推翻
- 哪些问题仍未关闭
- 用户自己的倾向是否变化

## 产品-项目关系表

路径：

```text
output/strategy-sandbox/product-registry.md
```

模板：

```markdown
# 产品-项目关系表

## {产品名}

| 项目 | 项目目录 | 关系 | 状态 | 备注 |
|---|---|---|---|---|
| {项目名} | output/projects/{目录名} | 核心探索项目 | 进行中 | {说明} |
```

规则：

- 首次做产品级沙盘且无关系表时，自动扫描 `output/projects/*/README.md`，给出候选项目清单。
- 用户确认哪些项目属于该产品后，写入 `product-registry.md`。
- 后续产品级沙盘优先读取关系表。
- 关系表只是导航索引，不代表战略判断。

