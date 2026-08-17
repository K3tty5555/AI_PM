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
| `memory-snapshots/` | Claude / Codex memory 的脱敏副本 |
| `conversations/` | 会话索引与摘要（raw 副本已冻结为历史档案，默认不新增） |
| `context/` | 稳定项目上下文、产品决策、术语和待确认问题 |
| `pending-memory/` | Codex 新沉淀的待合并 memory 或协作规则变更 |

## 生成脚本

```bash
scripts/ai-sync/build-memory-index.sh
scripts/ai-sync/build-skill-index.sh
scripts/ai-sync/build-agent-index.sh
scripts/ai-sync/check-ai-context-drift.sh
scripts/ai-sync/check-ai-context-freshness.sh
scripts/ai-sync/sync-claude-memory-to-codex.sh
scripts/ai-sync/snapshot-ai-memory.sh
scripts/ai-sync/snapshot-claude-conversations.sh
scripts/ai-sync/snapshot-codex-conversations.sh
scripts/ai-sync/build-conversation-index.py
scripts/ai-sync/summarize-conversation.py --missing
scripts/ai-sync/sync-ai-context.sh
```

推荐日常使用：

```bash
scripts/ai-sync/check-ai-context-freshness.sh
scripts/ai-sync/sync-ai-context.sh
```

个人风格月度审计：

```bash
scripts/ai-sync/run-monthly-voice-profile-update.sh --force --since-date YYYY-MM-DD
```

Claude 与 Codex 的项目级 `SessionStart` hook 会在每月首次进入项目时静默调用
`scripts/ai-sync/voice-profile-monthly-hook.sh`。它直接从原生会话日志流式提取并脱敏，
只在 `.ai-shared/pending-memory/` 生成待确认候选稿，不自动覆盖主 memory。
如需把 PRD 样本限定到本人，可设置逗号分隔的 `AIPM_VOICE_PROFILE_AUTHOR_MARKERS` 作者别名。

`check-ai-context-freshness.sh` 默认只查 memory 快照与索引水位（raw 档案对比需显式 `--check-raw`）。`sync-ai-context.sh` 刷新 memory/skill/agent 索引、生成 Codex 可读摘要、保存 memory 副本并重建会话索引；**2026-07-12 起默认不再复制 raw 会话**（`--include-raw` 显式开启；现存 raw 为历史档案，见 conversations/raw/INVENTORY.md）。

生成文件会带 `generated_at` 和 `source`。如果索引与原始文件冲突，读取原始文件。

## 环境变量

| 变量 | 用途 |
|------|------|
| `CLAUDE_MEMORY_DIR` | 指定本机 Claude 项目 memory 目录 |
| `CLAUDE_PROJECT_DIR` | 指定本机 Claude 项目会话目录，默认取 `CLAUDE_MEMORY_DIR` 的上级 |
| `CLAUDE_SKILLS_DIR` | 覆盖 Claude skills 目录，默认 `.claude/skills` |
| `CLAUDE_AGENTS_DIR` | 覆盖 Claude agents 目录，默认 `.claude/agents` |
| `CODEX_HOME` | 覆盖 Codex home，默认 `$HOME/.codex` |
| `CODEX_MEMORY_IN` | 覆盖 Codex memory 输入路径，默认 `$HOME/.codex/memories/AI_PM.md` |
| `CODEX_MEMORY_OUT` | 覆盖 Codex 摘要输出路径，默认 `$HOME/.codex/memories/AI_PM.md` |

## 对话记录与隐私

- `.ai-shared/conversations/raw/` 保存原始会话副本，但已通过 `.gitignore` 忽略，默认不提交。
- `.ai-shared/conversations/summaries/` 是可共享摘要层；自动生成的是草稿，需要人工或 AI 复核后再当事实使用。
- `.ai-shared/memory-snapshots/` 是脱敏副本，不替代 Claude / Codex 各自 memory 主源。
- 任何长期规则仍先进入 `pending-memory/`，经用户确认后再合并。

## git 追踪矩阵（单源——CLAUDE.md 只留指针到这里；2026-07-12 review 修复批补）

| 子目录/文件 | git 追踪 | 说明 |
|------------|---------|------|
| `README.md`、`*/README.md` | ✅ | 目录结构与协议说明 |
| `review-exchange/README.md` | ✅ | 评审交换协议（内容文件 ❌ 仅本机） |
| `pending-memory/*.md` | ❌ | Codex→Claude 记忆交接，含项目偏好，仅本机 |
| `context/open-questions.md` | ❌ | 含内部字段/埋点细节，仅本机 |
| `context/product-decisions.md` | ❌ | 含产品命名/场景定义，仅本机 |
| `memory-snapshots/`、`conversations/` | ❌ | 快照与会话记录（含 raw 历史档案），仅本机 |
| `memory-index.md` / `skill-index.md` / `agent-index.md` | ❌ | 生成索引，仅本机 |

**铁律**：内容文件一律按「仅本机」处理，不得假设会上传 GitHub；新增子目录先在 .gitignore 落规则再写内容。
