---
generated_at: 2026-04-27 13:50:39 +0800
source: .claude/agents
do_not_edit: true
---

# Claude Agent 索引

Codex 不能原生调用 Claude Code 的 custom agent runtime，但可以读取 agent prompt 作为角色卡执行。

| Agent | 入口 | 用途 | Codex 使用方式 |
|------|------|------|------|
| `pm-agent` | `.claude/agents/pm-agent.md` | KettyWu 风格的资深 PM sub-agent。当主对话需要"以 PM 视角写一段 PRD 内容 / 审视 PRD 章节 / 拒绝越界写法"时调用。比 ai-pm-driver 更主动——driver 是 lint，pm-agent 是会写 PRD 的人。Use when ai-pm flow 进到 phase-5-prd 的 functional_spec / agent_design 子步骤，或用户要求"以 PM 视角重写这段"、"按KettyWu风格写"、"让 PM 决策这块"。 | 读取 prompt，在主会话中按角色规则执行 |
