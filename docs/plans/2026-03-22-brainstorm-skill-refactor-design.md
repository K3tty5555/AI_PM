# 头脑风暴 Skill 文件化改造设计

> 日期：2026-03-22
> 状态：已确认（经多视角审视修订）

---

## 一、目标

将头脑风暴的 AI 行为规则从 Rust 硬编码迁移到 skill 文件，与客户端其他阶段的架构一致。同时修复当前实现中的循环防护、竞态、类型安全等问题。

## 二、Skill 文件

### 路径
`app/src-tauri/resources/skills/ai-pm-brainstorm/SKILL.md`

### 加载方式
不走 `phase_config` 映射（brainstorm 不是阶段），`brainstorm_chat` 中直接调用 `load_skill(skills_root, "ai-pm-brainstorm")`。

### 不用占位符
SKILL.md 是纯内容文件，不含任何占位符（避免与 JSON/Mermaid 冲突，避免改 `load_skill` 公共接口）。

### System prompt 拼装顺序
```
[1] load_skill("ai-pm-brainstorm") 内容
[2] Rust 追加阶段引导词
[3] Rust 追加前序产出物
[4] Rust 追加知识库
```

### 阶段引导词（Rust 中 match）
```rust
match phase {
    "analysis" => "当前阶段：需求分析。重点讨论：要解决什么问题、目标用户、核心痛点、需求边界",
    "stories" => "当前阶段：用户故事。重点讨论：关键场景、用户行为、验收标准、优先级",
    "prd" => "当前阶段：PRD 撰写。重点讨论：功能设计、技术约束、优先级取舍、MVP 范围",
    _ => "",
}
```

### Skill 文件内容草稿

```markdown
---
name: ai-pm-brainstorm
description: 客户端头脑风暴对话技能。帮助产品经理在 3-5 轮内快速理清想法，收敛出可执行结论。
---

# 头脑风暴对话

你是产品经理的搭档，帮助快速理清想法。目标是在 3-5 轮内收敛出可执行的结论。

## 核心原则

- 不要重复已有产出物的内容。用户已经看过了，直接讨论新的、不确定的点
- 每轮回复先给出你的判断或建议，再问一个推进性问题。不要只问问题不给观点
- 回复控制在 3-5 句话。不要长篇大论，不要列举已知信息
- 用户回复很短（如 A、B、好、对）时，直接推进到下一个问题，不要复述用户的选择

## 收敛机制

- 第 3 轮起，如果核心问题已澄清，主动总结讨论要点（用 1-3 条要点）
- 总结后在回复最后单独一行写 [SUGGEST_GENERATE]
- [SUGGEST_GENERATE] 会被前端渲染为「开始生成」按钮
- 即使用户选择继续讨论，也要在后续 2 轮内再次尝试收敛

## 禁止事项

- 不要问「你想聊哪个方向」这类开放式分类问题——直接从最关键的未决问题开始
- 不要复述已有产出物的摘要作为开场白
- 不要在每轮都列出 A/B/C/D 选项——只在真正有分歧时用选择题
- 不要在第一轮就列出所有可能的讨论方向让用户选
```

## 三、循环防护

### 用户感知层（前端）

用户感知的阈值只有一个：**15 轮**（按用户发送次数计）。

| 轮次 | 行为 |
|------|------|
| 1-9 | 正常对话，无任何提示 |
| 10-14 | 输入框上方显示淡色文案「还剩 N 轮对话」 |
| 15 | 输入框替换为状态卡片 |

状态卡片内容：
- 文案：「需求信息已经很充分了，可以开始生成了」（正面框架）
- 主按钮：「生成 {产出物}」
- 辅助按钮：「清空对话重新开始」

### 安全层（后端）

`brainstorm_chat` 入口检查 `messages.len() > 40` 时返回结构化业务错误（非系统异常），前端渲染为友好提示。正常情况下前端 15 轮限制会先生效，后端 20 轮只做安全网。

### 轮数计算

轮数 = 用户消息条数（`messages.filter(m => m.role === "user").length`），不计 assistant 消息。

## 四、前端修复

### 竞态修复
`setupListeners` 改为 async，`sendMessage` 中 `await setupListeners()` 确保 listener 注册完毕再调 API。

### 类型安全
`BrainstormMessage.role` 从 `string` 收窄为 `"user" | "assistant"`。

### "继续讨论"按钮
onClick 改为聚焦 textarea + 滚到底部（不再是空操作）。

### 清空对话确认
`clearMessages` 调用前弹出确认，或用 undo toast（3 秒内可撤销）。

### 消息可访问性
消息气泡加 `aria-label`（如 "AI 回复" / "你的消息"）。

### roundCount 派生
`useBrainstorm` 导出 `roundCount` 和 `isMaxRounds`，`BrainstormChat` 根据这两个值控制 UI。

## 五、后端改造

### 删除硬编码
删除 `build_brainstorm_system_prompt` 函数。

### 新增 skill 加载
```rust
let skills_root = resolve_skills_root(&app)?;
let skill_content = load_skill(&skills_root, "ai-pm-brainstorm")?;
let phase_hint = match args.phase.as_str() { ... };
let system_prompt = format!("{}\n\n---\n\n{}\n\n{}\n\n{}", skill_content, phase_hint, prior_outputs, knowledge);
```

### 消除重复映射
删除 `phase_prior_files` 函数，改为复用 `phase_config` 的 `input_files`。

### 结构化业务错误
轮次超限时返回可区分的错误信息（前端识别后渲染为友好提示而非系统报错）。

## 六、实施优先级

| 顺序 | 任务 |
|------|------|
| 1 | 创建 SKILL.md 文件 |
| 2 | 改造 brainstorm_chat（删硬编码 → load_skill + 追加） |
| 3 | 后端轮次检查 + 结构化错误 |
| 4 | 前端竞态修复 + 类型安全 + listener await |
| 5 | 前端轮数渐进提示 + 状态卡片 |
| 6 | 前端交互修复（继续讨论按钮、清空确认、aria） |
