# AI 共享桥接层

本目录用于让 Claude Code 与 Codex 共用项目上下文。当前项目采用 Claude 与 Codex 并重的协作模式，二者都可以承担主要开发与产品工作流。

这里的文件是导航、索引和待合并材料，不替代原始资产。已沉淀历史上下文主要来自：

- Claude 项目级 memory：通过 `CLAUDE_MEMORY_DIR` 指向本机 Claude 项目 memory；未配置时脚本会按当前仓库路径和 `$HOME/.claude/projects/` 自动探测
- Claude skills：`.claude/skills/`
- Claude agents：`.claude/agents/`
- Codex memory：作为并列工作上下文、摘要或待合并材料使用

## 文件说明

| 文件 | 用途 |
|------|------|
| `memory-index.md` | Claude 项目 memory 的索引 |
| `skill-index.md` | Claude skills 的索引 |
| `agent-index.md` | Claude agents 的索引 |
| `pending-memory/` | Codex 新沉淀的待合并 memory 或协作规则变更 |

## 生成脚本

```bash
scripts/ai-sync/build-memory-index.sh
scripts/ai-sync/build-skill-index.sh
scripts/ai-sync/build-agent-index.sh
scripts/ai-sync/check-ai-context-drift.sh
scripts/ai-sync/sync-claude-memory-to-codex.sh
```

生成文件会带 `generated_at` 和 `source`。如果索引与原始文件冲突，读取原始文件。

## 环境变量

| 变量 | 用途 |
|------|------|
| `CLAUDE_MEMORY_DIR` | 指定本机 Claude 项目 memory 目录 |
| `CLAUDE_SKILLS_DIR` | 覆盖 Claude skills 目录，默认 `.claude/skills` |
| `CLAUDE_AGENTS_DIR` | 覆盖 Claude agents 目录，默认 `.claude/agents` |
| `CODEX_MEMORY_OUT` | 覆盖 Codex 摘要输出路径，默认 `$HOME/.codex/memories/AI_PM.md` |
