# PM Agent 体系建立 · 2026-04-26 改动总览

> 本次改动核心：解决"AI 写 PRD 不像 PM 写的"问题。从原"事后 driver 守门"演进为 4 层 PM Agent 体系。

## 4 层架构

```
判断卡（手册）
    ↓
pm-agent.md（KettyWu sub-agent，单一事实源 ⭐）
    ├── Mode A: 写新章节
    ├── Mode B: 重写已有章节
    └── Mode C: lint 整份 PRD（输出 punch list）
        ↑
    ai-pm-driver（thin wrapper / 命令糖衣）
```

| 层 | 文件 | 角色 |
|---|------|------|
| **判断卡（手册）** | `.claude/skills/ai-pm/references/pm-judgment-card.md` | 9 章节系统手册（角色 / 6 直觉 / Agent 5 件事写法 / 越界红线 / 责任分工 / 模板原则 / 篇幅 / 修订日志 / 9 项 checklist）|
| **写作脚手架** | `.claude/skills/ai-pm/phases/phase-5-prd.md` 内嵌 | 7 组反例对比 + 填空模板 + 自检三连问 + 9 项 checklist + pm-agent 调用模板 |
| **pm-agent（写）** | `.claude/agents/pm-agent.md` | KettyWu 灵魂内化判断卡 + 越界红线 + 填空模板 + 9 项自检；3 种 mode（write / rewrite / lint）|
| **driver（命令入口）** | `.claude/skills/ai-pm-driver/SKILL.md` | 87 行 thin wrapper —— `/ai-pm driver [PRD]` 接路径 → 调 pm-agent lint mode → 输出 punch list |

## phase-5-prd 写作链路

```
入口：强制读判断卡
    ↓
functional_spec / agent_design 子步骤
    ↓
优先调用 pm-agent（KettyWu 写章节）
    ↓ 失败回退
主对话用「写作脚手架 + 反例库」自己写
    ↓
9 项 checklist 自检（落盘前）
    ↓
落盘
    ↓
（仅评审前）driver 体检
```

## 关键铁律（CLAUDE.md 已固化）

| 维度 | 必写 | 禁写 |
|------|------|------|
| 技术细节 | "由研发与 X 对齐" | 技术栈 / 接口字段名/路径/枚举值 / 数据库表 |
| 视觉细节 | "风格与 Z 一致" | 毫秒 / 像素 / 色号 / hover/fade/光环/闪烁 等动画词 |
| 算法实现 | "由算法侧定义"，Few-shot 标 `[算法补完]` | prompt 文案 / 模型名 / chunk_size / RAG 检索器 |
| 异常处理 | 用户能感知到的失败 | 接口超时 / Schema 校验 / 缓存未命中（研发自决）|
| 用户话术 | "暂时不支持 + 替代方案" | 透露版本号 / 上线时间 |

**结构必备（迭代版本）**：复用对照表 / 影响范围 / 暂不纳入本期 / 附录 B「待对齐」

**修订日志规则**：保留 PM-评审反馈迭代版本（v1.0 → v1.x），不保留 PM-AI 协作过程版本

**篇幅指引**：单功能补丁 80-150 / 中等场景 200-300 / 复杂含 Agent 章节 300-500 / 500+ 警戒

## 本次提交记录

| Commit | 内容 | 文件数 |
|--------|------|------|
| `22ac058` feat(ai-pm) | PM Agent 体系（pm-agent / 判断卡 / 写作脚手架 / driver lint）| 9（含 3 新建）|
| `3686733` refactor(templates) | 模板多领域化（教育/客服/电商/SaaS）+ PM 视角守门 + 修订日志规则修正 | 4 |
| `5e50fc1` fix(md2docx) | 从 manifest 推断 prototype 目录支持多原型并存 | 1 |
| `011a406` docs(claude) | CLAUDE.md 增补 PM Agent 4 层体系说明 + 铁律对照表 | 1 |

全部已推送到 `github.com:K3tty5555/AI_PM.git` main 分支。

## 配套 Patterns / Memory

- `templates/knowledge-base/patterns/PATTERN-006-agent-prd-template-design.md` 修订日志规则修正
- `templates/knowledge-base/patterns/PATTERN-007-md2docx-multi-prototype-dir.md` md2docx 多原型目录设计
- `memory/project_pm_agent_architecture.md`（用户级 memory）4 层架构 + 触发场景 + 不可删依赖
- `memory/feedback_no_version_in_user_speech.md` AI 给用户话术不透版本号铁律
- `memory/user_prd_writing_style.md` KettyWu PM 风格 V1/V2/V3 蒸馏

## 下次会话 cold-start 路径

按以下顺序读取上下文即可恢复：

1. `CLAUDE.md` —— 项目级铁律 + 4 层体系速览
2. `.claude/skills/ai-pm/references/pm-judgment-card.md` —— 完整判断卡（9 章节）
3. `.claude/agents/pm-agent.md` —— sub-agent 灵魂
4. `.claude/skills/ai-pm/phases/phase-5-prd.md` —— 写作脚手架 + 反例库
5. 本文档 —— 历史决策与依赖关系

## 历史背景（演进过程）

1. **早期**：传统 PRD 模板（feishu-template.md）+ 飞书友好规范
2. **第一版改造**：加 Agent 增量包（agent-supplement.md），支持传统/agent/hybrid 三类产品
3. **多领域化**：把纯教育示例扩为 4 领域（教育/客服/电商/SaaS）
4. **PM 风格判断卡**（本次）：抽离 PM 视角的核心判断标准
5. **pm-agent sub-agent**（本次）：把判断卡内化成 KettyWu 灵魂
6. **driver thin wrapper**（本次）：去除 driver 与 pm-agent 的 90% 功能重复

## 待办

- 评审 5/31 前用 pm-agent 实际写一份新 PRD 验证体系
- 试点 6/1 后收集真实使用反馈，迭代判断卡
- 后续如出现新越界类型，更新 pm-agent.md 即可（单一事实源）
