# Phase 1: 需求澄清

**输入**: 用户需求描述（口述或已有文档）
**输出**: `01-requirement-draft.md`

## 执行方式

交互式访谈，每次只问 1-2 个最关键的问题。

## 产品类型识别（兜底闸 · 必问）

**触发条件**：本阶段开始时检查 `_memory/L1-decisions.md` 中是否有 `product_type` 字段。

```bash
grep -E "^product_type:" {project_dir}/_memory/L1-decisions.md 2>/dev/null
```

- **已存在**（如 office-hours 已记录）→ 静默跳过，直接进入交互式访谈
- **不存在** → **必须作为第一个问题问用户**：

```
在开始之前，先确认一下产品类型 —— 这决定了 PRD 模板的章节结构：

  1. 传统产品 — 用户主动操作走流程（CRUD、后台、运营工具）
  2. Agent 产品 — 用户表达意图，AI 替他决策执行（独立 Copilot、智能体）
  3. 混合产品 — 传统功能 + AI 助手嵌入（带 AI 入口的现有业务系统）

请选择 [1/2/3]：
```

用户选择后：
1. 写入 `_memory/L1-decisions.md` 顶部：`product_type: {traditional|agent|hybrid}`
2. 简短确认："已记录为 {类型} 产品。继续访谈。"
3. 进入正常的交互式访谈流程

**中途修正机制**：访谈过程中若发现产品类型识别错了（例如最初选了"传统"但访谈中暴露大量 AI 决策场景），允许用户主动说"产品类型改成 X"，覆写 L1-decisions.md 对应字段，**phase-5-prd.md 拼装时以最新值为准**。

## 有现成文档时

引导放入 `07-references/`，读取后跳过访谈，直接生成 01-requirement-draft.md。

→ 详见 `references/user-interaction.md`「有现成文档时的处理」

## Phase 1 完成后：写入 L0 记忆

`01-requirement-draft.md` 落盘后，立即执行：

1. `mkdir -p {project_dir}/_memory/`
2. 从 requirement-draft 提取以下内容写入 `_memory/L0-identity.md`：
   - **产品定位**：需求文档中的「产品/功能定位」或「解决什么问题」一句话
   - **目标用户**：用户角色列表
   - **技术栈**：若用户提到了前端框架/后端约束（若未提及留空）
   - **核心约束**：用户明确说的「不做XX」「必须XX」等红线

   若项目已有 L0-identity.md：
   → `test -f {project_dir}/_memory/L0-identity.md` 检查
   → 不存在时直接写入
   → 已存在时，读取内容判断：
     - 若含骨架标记 `<!-- Phase 1 需求澄清完成后由 ai-pm 自动填写 -->`：视同不存在，**直接覆写**全部内容
     - 否则（通过 --preset 创建的富内容）：**不覆盖**，在已有内容基础上追加或补全空白章节

格式参考 `references/project-memory.md` 的 L0-identity.md 格式。
