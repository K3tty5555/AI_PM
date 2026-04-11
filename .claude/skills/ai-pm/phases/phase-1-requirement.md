# Phase 1: 需求澄清

**输入**: 用户需求描述（口述或已有文档）
**输出**: `01-requirement-draft.md`

## 执行方式

交互式访谈，每次只问 1-2 个最关键的问题。

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

   若项目已有 L0-identity.md（通过 --preset 创建）：
   → `test -f {project_dir}/_memory/L0-identity.md` 检查
   → 已存在时**不覆盖**，在已有内容基础上追加或补全空白章节
   → 不存在时直接写入

格式参考 `references/project-memory.md` 的 L0-identity.md 格式。
