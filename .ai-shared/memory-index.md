---
generated_at: 2026-04-26 14:46:24 +0800
source: auto-detected Claude project memory dir
do_not_edit: true
---

# Claude 项目 Memory 索引

主事实源：`auto-detected Claude project memory dir/`

## 文件清单

| 类型 | 文件 | 名称 | 用途 |
|------|------|------|------|
| other | `MEMORY.md` | MEMORY | 项目总记忆入口，串联关键铁律、项目状态、业务知识和架构决策 |
| other | `dashboard-pitfalls.md` | dashboard-pitfalls | 数据洞察仪表盘开发避坑模式 |
| feedback | `feedback_chinese_only.md` | 必须使用简体中文 | 所有回复必须使用简体中文，已违反3次（03-19韩文、03-20英文×2），用户明确表达不满 |
| feedback | `feedback_icon_workflow.md` | macOS 应用图标工作流 | 处理 Tauri 应用图标的正确方式——设计师出带 squircle 透明角的 PNG，开发侧只做缩放 |
| feedback | `feedback_no_version_in_user_speech.md` | AI 对用户的话术禁止透露版本号或上线时间 | PRD 里 AI 给老师 / 用户的对话文案不能含 V1.x、上线时间、下个迭代等内部规划信息；用「暂时不支持」+「替代方案」代替。 |
| feedback | `feedback_playwright_rules.md` | Playwright 使用规范 | 运行 Playwright 命令前必须遵守的规则，避免重复下载 Chromium 和未经允许执行测试 |
| feedback | `feedback_prd_export.md` | PRD 导出默认格式 | PRD 生成时不默认导出 DOCX，只生成 Markdown |
| feedback | `feedback_use_existing_tools.md` | feedback_use_existing_tools | 做操作前先查已有工具，不要重写。PRD 导出用 md2docx.py，子 Agent 不改 .claude/ 路径文件 |
| project | `project_agent_template_multi_domain.md` | Agent PRD 模板多领域化（2026-04-25） | agent-supplement.md 和 autonomy-levels.md 已从纯教育案例扩展为 4 领域示例（教育/客服/电商/SaaS），结构通用、例子可挑近的抄。PATTERN-006 保留教育味作为案例研究。 |
| project | `project_edu_business_knowledge.md` | 教育超级智能体 · 业务知识沉淀 | V1.1/V1.2/V1.3 PRD 工作期间形成的业务规律：4 类题库结构、场景分组对话上下文规则、意图分发分层、组卷搜题边界、教师权限模型、教育场景 AI 自主性等级、B 端 Agent 上下文穿透原则。 |
| project | `project_edu_pilot_schools.md` | 教育超级智能体 · 试点学校 | 3 所种子学校名单 + 6/1 试点首批 Go Live 对齐 |
| project | `project_edu_roadmap_2026.md` | 教育超级智能体 · 2026 产品路标 | 2026-04-20 更新至 v1.6：阶段验收改名+时间点移至6/22；暑假验收通过可加人力 |
| project | `project_edu_status_20260425.md` | 教育超级智能体 · 当前状态快照（2026-04-25） | V1.1/V1.2/V1.3 三份 PRD 已定稿、原型可交互、docx 带截图导出；用户接管 V1.1 后续修订；模板已多领域化。下一步等待 V1.1 用户修订后续动作。 |
| project | `project_edu_super_agent.md` | 教育超级智能体项目 | 智学网 AI 助手 Copilot 项目的完整上下文——三场景 Skill 定义、数据安全红线、需求池覆盖分析、团队分工 |
| project | `project_illustration_client.md` | project_illustration_client | 客户端集成 AI 文生图能力的完整需求（5 个子系统），下个会话实施 |
| project | `project_pm_agent_architecture.md` | PM Agent 体系架构（2026-04-26） | ai-pm 整体重构为 4 层 PM Agent 体系——前置脚手架 + sub-agent 写作 + 后置 lint。phase-5-prd 流程：先调 pm-agent 写章节 → 主对话编排 → 9 项 checklist 自检 → 落盘 → driver 仅评审前体检。 |
| project | `project_ui_redesign.md` | UI Redesign — Cobalt Blue Bauhaus + Apple HIG | 2026-03-17 决定全面重做客户端 UI，从「终末地」终端风格改为 Bauhaus + Apple HIG 风格；2026-03-18 完成实现并推送 PR |
| reference | `reference_edu_codebase.md` | 教育超级智能体 · 工程代码仓位置 | 智学网 AI 助手实际工程代码仓路径，用于查看研发进度和实现细节 |
| user | `user_prd_writing_style.md` | PRD写作风格（KettyWu） | KettyWu PM 风格——基于 V1/V2/V3/V1.7 PRD 蒸馏的结构、语气、判断标准。配套 `.claude/skills/ai-pm/references/pm-judgment-card.md` 是 PM Agent 内核。 |
| user | `user_role_zhixue.md` | 用户角色 - 智学网产品总监 | 用户是智学网产品总监，关注 AI 时代教育产品新机会，正在做教育超级智能体竞品分析 |

## 敏感信息规则

同步到 Codex memory 时只保留配置位置和用途，不复制真实 API Key、token、cookie、私钥、密码。
