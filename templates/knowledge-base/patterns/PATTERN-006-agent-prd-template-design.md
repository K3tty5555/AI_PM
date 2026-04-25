---
id: PATTERN-006
category: patterns
tags: [Agent PRD, 模板设计, 三类产品, 增量包]
source-project: 教育超级智能体-20260425
created: 2026-04-25
confidence: high
---

# Agent PRD 模板用"基础+增量包"而不是"独立模板"

## 问题场景

为传统产品 / Agent 产品 / 混合产品三类设计 PRD 模板时，三种思路：
- **方案 A 单模板带条件章节**：模板膨胀，传统产品看到 agent 段落困惑
- **方案 B 三套独立模板**：维护成本高，共通章节漂移
- **方案 C 基础模板 + 增量包**（采用）：80% 共通章节走基础模板，20% agent 特有走增量包按需注入

## 解决方案

### 拼装关系

| 产品类型 | 用法 |
|---------|------|
| 传统产品 | 仅基础模板，跳过所有挂接位 |
| Agent 产品 | 基础模板 + 完整增量包（10 节）|
| 混合产品 | 基础模板 + 最小集（§A2/A4/A5/A7/A9）|

### 挂接机制

基础模板里用 HTML 注释做挂接位：

```markdown
<!-- agent-supplement: §A10 为什么不用 Agent，仅 agent/hybrid 产品在此注入 §2.3 -->
```

phase-5-prd 根据 `_memory/L1-decisions.md` 的 `product_type` 字段决定：
- traditional → 删除注释，不注入
- agent / hybrid → 替换注释为对应章节内容

### 增量包必含的 10 节

| 节 | 必填？ |
|----|-------|
| §A1 意图分类与触发 | Agent 必填 |
| §A2 能力边界（In/Out/Edge）| 必填 |
| §A3 自主性等级（L1-L5）| 必填 |
| §A4 AI 自主决策清单 ⭐ | 必填 |
| §A5 工具/能力清单 + 上下文双层 | 必填 |
| §A6 行为契约（人设/语气/Few-shot）| 推荐 |
| §A7 失败与兜底（含 HITL）| 必填 |
| §A8 评测方案（轻量两档）| 推荐 |
| §A9 AI 入口与权限边界 ⭐ | 混合产品必填 |
| §A10 为什么不用 Agent ⭐ | 推荐（反向论证防 AI 万能化）|

⭐ = 通用 agent 模板（如 agent-prd-writer）没有、本地化补足的关键章节。

## 验证数据

- 基于 V1.2 组卷 PRD 反向验证：覆盖度 40%
- 基于 V1.3 精准教学 PRD 反向验证：覆盖度 43%
- 两版验证暴露的缺口都已补回模板（§A4.4 业务规则约束、§A7 写作 tips 等）

## 适用场景

- 同时支持传统产品 + Agent 产品 PRD 输出的产品组
- 已有飞书风格基础模板、不希望颠覆现有写作习惯的团队
- 需要给研发评审"7 问自检卡"快速验收 PRD 的场景

## 关键原则

1. **80/20 原则**：背景/目标/用户/范围/上线/风险共通，意图/决策/对话/能力归责才是 agent 特有
2. **挂接位优于追加**：在基础模板里用注释标记位置，比在文末追加完整 agent 章节更易读
3. **配套双闸识别**：phase-0 office-hours 加一题 + phase-1 兜底必问，避免 product_type 漏识别
4. **L2 起步原则**：教育/医疗/金融场景默认 L2（AI 草拟+用户确认），不轻易上 L3
5. **失败表只列用户能感知的**：技术层失败（接口超时降级、Schema 校验）由研发自决，不进 PRD

## 反模式

- ❌ 把 Agent 产品 PRD 写成"会聊天的 Web 表单"——只写交互不写决策清单
- ❌ 用工具列表代替能力清单——研发看不出业务必要性
- ❌ 不写自主性等级——研发评审"AI 会不会自动改用户数据"答不上
- ❌ HITL 介入点过多——体验下降，AI 价值打折

## 相关文件

- `templates/prd-styles/default/feishu-template.md`（基础模板）
- `templates/prd-styles/default/agent-supplement.md`（增量包）
- `templates/configs/autonomy-levels.md`（L1-L5 速查）
- `.claude/skills/ai-pm/phases/phase-5-prd.md`（拼装逻辑）
