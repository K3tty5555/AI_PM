# AI 协作入口

本项目采用 **Claude-first，Codex 辅助** 的协作模式。Claude Code 仍是主要开发与产品工作流；Codex 读取并遵守 Claude 已沉淀的 skills、agents、hooks 背后的脚本逻辑和项目级 memory，在需要时补充实现、审查和整理。

## 必读来源

Codex 进入本项目后，优先读取以下上下文：

1. Claude 项目级 memory 主源：优先使用 `CLAUDE_MEMORY_DIR`；未配置时按当前仓库路径在 `$HOME/.claude/projects/` 自动探测。本机旧路径仍可被脚本兼容识别。
2. 共享索引：`.ai-shared/memory-index.md`
3. Claude skills：`.claude/skills/`
4. Claude agents：`.claude/agents/`
5. 项目规范：`CLAUDE.md`、`docs/design-system.md`

`.ai-shared/` 是桥接层，不替代 Claude 原始资产。索引过期时，以本机 Claude memory、skills、agents 原始文件为准。

## 主事实源

- Claude 项目 memory 是主事实源。
- Codex memory 是镜像、摘要或待合并材料，不反向覆盖 Claude memory。
- Codex 产生的新经验先写入 `.ai-shared/pending-memory/`，由用户确认后再合并进 Claude memory。
- 不自动同步 secrets、API Key、token、cookie、私钥等敏感信息。

## 优先级

发生冲突时按以下顺序处理：

1. 系统 / 开发者 / 安全约束
2. 用户当前指令
3. `AGENTS.md`
4. Claude 项目级 memory
5. `CLAUDE.md`
6. `.ai-shared/*` 生成索引
7. README / docs / 历史计划

## Codex 行为规则

- 全部面向用户的回复使用简体中文。
- PRD 默认只生成 Markdown，不主动导出 DOCX/PDF。
- 未经用户允许，不运行 Playwright 相关命令，包括 `playwright install`、`playwright test`、`npm run test:e2e`。
- 操作前先查已有工具，PRD 导出优先复用 `md2docx.py`。
- AI 给老师或最终用户的话术不能透露版本号、上线时间、下个迭代。
- 客户端 UI 遵循 `docs/design-system.md`，不要回到终末地/终端风格。
- 写 PRD 时遵循KettyWu PM 风格与 `.claude/skills/ai-pm/references/pm-judgment-card.md`。
- `.claude/skills/` 下的 Markdown 修改由主会话直接做，不派给并行子 Agent。
- 并行工作前检查文件冲突，同文件串行处理。

## Skill / Agent / Hook 共用边界

Claude skills 可以被 Codex 读取并按规则执行，但 Claude skill 的 `allowed-tools` 不等同于 Codex 工具权限。

Claude agents 可以被 Codex 读取为 agent card / prompt。Codex 不能原生调用 Claude runtime 的 agent，只能在当前会话中按该角色规则执行，或在用户明确要求并行代理时把 prompt 交给 Codex 子代理。

Claude hooks 不能在 Codex 中自动触发。hook 背后的脚本逻辑可以抽成普通脚本，由 Codex 在合适时机手动运行。

## 维护命令

```bash
scripts/ai-sync/build-memory-index.sh
scripts/ai-sync/build-skill-index.sh
scripts/ai-sync/build-agent-index.sh
scripts/ai-sync/check-ai-context-drift.sh
scripts/ai-sync/sync-claude-memory-to-codex.sh
```

`sync-claude-memory-to-codex.sh` 只生成 Codex 可读摘要，不修改 Claude memory 主源。

跨机器使用时可显式配置：

```bash
export CLAUDE_MEMORY_DIR="$HOME/.claude/projects/<your-project-slug>/memory"
export CODEX_MEMORY_OUT="$HOME/.codex/memories/AI_PM.md"
```
