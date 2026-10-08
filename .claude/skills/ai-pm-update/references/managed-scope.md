# 受管范围（升级时会被读、可能被写的文件）

## 二分铁律

**tracked 参与合并；未 tracked 一律不碰，不设例外表。**

依据：官方仓库 `.gitignore` 已把个人数据与官方原件分离开。任何"边缘文件例外表"都会长期漂移，因此不设。

## 受管清单

| 路径 | 说明 |
|------|------|
| `.claude/skills/` | 官方 skill。**私有的 `xfchat-wiki/` `tpd_cli/` `d2c*/` 除外**（它们不在官方 tracked 范围内） |
| `.claude/agents/` | `pm-agent.md` `prototype-agent.md` |
| `.claude/hooks/` | 6 个 hook 脚本 |
| `.claude/settings.json` | **结构化文件**：走语法树级合并，不走行级（见 merge-protocol.md） |
| `CLAUDE.md` | 项目宪法 |
| `templates/` | **仅 tracked 的 56 个**；下面 400+ 个未追踪文件是用户的个人知识库/persona |
| `scripts/` | **仅 tracked 的 71 个**；`.metrics-dict.md` / `.share-denylist` / `.prose-*` 等私有文件除外 |

## 永不触碰

- `output/`（含 `assets/` `projects/` `weekly/` `sharing/`）
- `docs/`（作者本机私有）
- `.claude/projects/`（会话记录，按绝对路径定位，动了就断链）
- `.claude/settings.local.json`（个人权限）
- `.claude/hooks/.knowledge-capture.enabled`（用户的知识沉淀开关旗标）
- `.claude/logs/`
- `.d2c/`（含明文凭证）
- `.ai-shared/`（含真实对话记录）
- `templates/` 下 400+ 未追踪文件
- `scripts/` 下 `.` 开头的私有文件
- 一切被 `.gitignore` 覆盖的内容

## 铁律

**受管 = 白名单内的单文件。绝不目录级替换。**

理由（实测）：`.claude/` 里混着用户的资产——`settings.local.json`、`.knowledge-capture.enabled`、`logs/`、私有的 `xfchat-wiki/` `tpd_cli/` `d2c*/`。目录级替换会连带删除它们：用户的知识沉淀开关被静默关掉、内网技能消失。

## 备份范围

升级前备份的内容 = 受管清单内的文件（不含 `output/`，它不参与升级）。落到 `~/.ai-pm/update/backups/<时间戳>/`。
