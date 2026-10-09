# 受管范围（升级时会被读、可能被写的文件）

## 两个类别

受管对象分两类，规则来源不同：

| 类别 | 是什么 | 合并规则来自 | 白名单来自 |
|------|--------|--------------|------------|
| **官方原件树** | 官方维护、随包分发的原件：`.claude/`、`CLAUDE.md`、`templates/` 骨架、`scripts/` | 本文「二分铁律」+ `merge-protocol.md` | 下面「受管清单」 |
| **数据资产** | 分发物、不是原件：知识库卡片、persona、打包携带的知识库归档 | `merge-protocol.md`（判定键不同，见该文「知识库卡片」节） | 打包器的 `PRIVATE_EXTRA` 清单 |

**分类的键是「该文件是否 tracked」，不是路径前缀。** `templates/` 同时装着官方骨架（tracked）和用户的个人知识库 / persona（未 tracked），按前缀切会整块归错。

这是结构性划分，不是例外表：例外表指「官方原件树内的 tracked 例外」，会随文件增减长期漂移；类别区分不随单个文件增删而变。

## 二分铁律

**在受管清单内：tracked 参与合并；未 tracked 一律不碰，不设例外表。**

依据：官方仓库 `.gitignore` 已把个人数据与官方原件分离开。任何"边缘文件例外表"都会长期漂移，因此不设。

## 受管清单

**未在受管清单中列出的路径一律不受管（显式白名单语义）。** 已 tracked 但不在下表内的同样不受管——例如 `.codex/`（`hooks.json` 除外）、`.githooks/`、`.impeccable/`、`tests/`、`AGENTS.md`、`README.md` / `README_zh-CN.md`、`LICENSE`、`AI_PM_教程中心.html`、`.archive/`、`.impeccable.md`。

| 路径 | 说明 |
|------|------|
| `.claude/skills/` | 官方 skill。**私有的 `xfchat-wiki/` `tpd_cli/` `d2c*/` 除外**（它们不在官方 tracked 范围内） |
| `.claude/agents/` | `pm-agent.md` `prototype-agent.md` |
| `.claude/hooks/` | hook 脚本（约 7 个，快照值） |
| `.claude/settings.json` | **结构化文件**：走语法树级合并，不走行级（见 merge-protocol.md） |
| `.gitignore` | **结构化文件**：按行语义解析合并（见 merge-protocol.md） |
| `.codex/hooks.json` | **结构化文件**：同上 |
| `CLAUDE.md` | 项目宪法 |
| `templates/` | **仅 tracked 的（约 56 个，快照值）**；其余未追踪文件是用户的个人知识库 / persona，不受管 |
| `scripts/` | **仅 tracked 的（约 72 个，快照值）**；`.metrics-dict.md` / `.share-denylist` / `.prose-*` 等私有文件除外 |

表中计数一律是**快照值、不是契约**：机器判定现取 `git ls-files <路径>`；数据资产未 tracked，走目录实读。

**「永不触碰」优先于本清单。** 清单给的是目录级范围，永不触碰给的是其中的具体排除项（如受管 `templates/` 但排除其未追踪文件、受管 `scripts/` 但排除 `.` 开头的私有文件、受管 `.gitignore` 但其规则覆盖的内容本身不受管）。两者相遇时以永不触碰为准。

**本节不适用于数据资产。** 上面那句只管官方原件树。数据资产（知识库卡片、persona、携带的知识库归档）住在 `templates/knowledge-base/`、`templates/persona/`、`output/assets/`，字面上会撞上「`templates/` 下未追踪的文件」和「`output/`」两条。但它们是**分发物**，不是升级合并的对象：由打包器 `PRIVATE_EXTRA` 携带，按 `merge-protocol.md` 的知识库卡片节独立判定。既不归本清单管，也不受永不触碰管——永不触碰拦的是「升级时被覆盖 / 被删」，对分发物本就无从谈起。

## 永不触碰

- `output/`（含 `assets/` `projects/` `weekly/` `sharing/`）
- `docs/`（作者本机私有）
- `.claude/projects/`（会话记录，按绝对路径定位，动了就断链）
- `.claude/settings.local.json`（个人权限）
- `.claude/hooks/.knowledge-capture.enabled`（用户的知识沉淀开关旗标）
- `.claude/logs/`
- `.d2c/`（含明文凭证）
- `.ai-shared/`（含真实对话记录）
- `templates/` 下未追踪的文件
- `scripts/` 下 `.` 开头的私有文件
- 一切被 `.gitignore` 覆盖的内容

**但由打包器 `PRIVATE_EXTRA` 携带的数据资产不在其列。** 它们是分发物，不是升级合并对象。本段的「`templates/` 下未追踪的文件」与「`output/`」两条不覆盖它们。理由见上文「本节不适用于数据资产」。

## 铁律

**受管 = 白名单内的单文件。绝不目录级替换。**

理由（实测）：`.claude/` 里混着用户的资产——`settings.local.json`、`.knowledge-capture.enabled`、`logs/`、私有的 `xfchat-wiki/` `tpd_cli/` `d2c*/`。目录级替换会连带删除它们：用户的知识沉淀开关被静默关掉、内网技能消失。

## 备份范围

升级前备份的内容 = 受管清单内的文件（不含 `output/`，它不参与升级）。落到 `~/.ai-pm/update/backups/<时间戳>/`。
