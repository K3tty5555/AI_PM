# templates/persona/ — 个人 persona 本机备份区

存放产品分身（persona）相关的个人风格 profile 的**本机备份副本**，含真实语料，**一律不入库**。

## 为什么有这个目录

这些 profile 的**权威源（live recall）**在 AI 记忆目录：
`~/.claude/projects/<项目hash>/memory/`（随 Claude Code 自动召回）。

那个位置随项目路径 hash 绑定、`.claude` 被清理会丢。本目录是它的**仓库侧备份**——跟随仓库一起被同步/备份，但通过 `.gitignore` 屏蔽内容、不上传 GitHub。

## 隐私

- 本目录内容（`*.md` 等）**全部 gitignore**，只有 `README.md` 和 `.gitkeep` 入库。
- 与 `.gitignore` 中"个人 PRD 风格 profile""个人知识库内容"同一处置原则：含真实语料，仅本机。
- ⚠️ 这是**静态快照**，会和 memory/ 里的 live 版本逐渐漂移；profile 有更新后用下方脚本刷新。

## 怎么刷新备份

跑同步脚本即可（自动发现 memory 里所有 `user_*.md` persona 文件，含以后新增的）：

```bash
./scripts/backup-persona.sh            # 同步
./scripts/backup-persona.sh --dry-run  # 只看会改什么，不动文件
```

脚本会按 Claude Code 规则从仓库路径派生记忆目录；换机器/路径异常时可 `AI_PM_MEMORY_DIR=/正确/路径 ./scripts/backup-persona.sh` 手动指定。

## 当前备份（memory/ 下 user_*.md 全量）

| 文件 | 说明 |
|---|---|
| `user_voice_profile.md` | 口语声音画像（893 条真实消息蒸馏） |
| `user_prd_writing_style.md` | PRD 写作风格（中文序号 / 两栏表 / 复用写法 / 纯度判据） |
| `user_prd_agent_genre.md` | Agent PRD 独立文体 |
| `user_role_zhixue.md` | 用户角色画像 |

> 范围 = `memory/user_*.md`；`feedback_* / project_* / pitfall_*` 不属 persona，不备份。
