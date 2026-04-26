---
name: Claude 与 Codex 并重协作模式
type: project
source: codex
created: 2026-04-26
target: $CLAUDE_MEMORY_DIR/project_ai_collaboration_mode.md
---

## 事实

用户明确更新项目协作模式：后续 AI_PM 项目应采用 Claude 与 Codex 开发并重，不再是 Claude 为主、Codex 为辅。

## Why

项目后续需要让 Claude Code 与 Codex 都能承担主要开发、产品整理、审查和上下文维护工作，避免 Codex 在后续会话中继续按“Claude-first，Codex 辅助”的旧定位执行。

## How to apply

- 读取项目上下文时，将 Claude memory、Claude skills/agents 与 Codex 侧沉淀共同视为协作上下文。
- Codex 可以直接承担主要实现、审查和整理任务，不需要默认把自己定位为辅助角色。
- 若 Claude 与 Codex 上下文冲突，以用户最新明确指令和项目内最新文档为准。
