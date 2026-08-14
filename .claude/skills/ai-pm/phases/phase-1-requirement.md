# Phase 1: 需求澄清

**输入**: 用户需求描述（口述或已有文档）
**输出**: `01-requirement-draft/V{n}.md`（文件夹制，见 SKILL.md 命名约定）

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

引导放入 `07-references/`，读取后跳过访谈，直接生成 01-requirement-draft/V{n}.md。

→ 详见 `references/user-interaction.md`「有现成文档时的处理」

## 迭代型项目检测（兜底闸 · 必跑）

**核心 insight**：迭代项目的需求 = delta，不是新功能。把迭代项目当 0→1 跑，会漏掉一类系统性的坑——「老系统能做但新流程缺」「老系统隐性步骤新流程没承接」「老功能下线但运营/客服不知道」。

### 检测逻辑

满足任一条件即为迭代型：

```bash
# 1. 07-references/ 非空
test -d {project_dir}/07-references && [ "$(ls -A {project_dir}/07-references 2>/dev/null)" ]

# 2. L1-decisions.md 提及历史版本
grep -E "V[0-9]|迭代|历史版本|老版本|上一版|V[0-9]\.[0-9]" {project_dir}/_memory/L1-decisions.md 2>/dev/null

# 3. 用户需求描述含迭代关键词（脑判）
# 关键词：迭代 / 扩展 / 兼容老 / 接入老 / V2/V3 / 升级 / 兼容旧版
```

- **判断为迭代型** → 进入「迭代项目分支」
- **判断为 0→1** → 跳过，按现有流程进行
- **判断不确定** → 主动问用户一次：「这是基于已有产品的迭代，还是 0→1 新项目？」

### 迭代项目分支：基线 delta 工作表

**强制交付物**：`{project_dir}/01-baseline-delta.md` + `{project_dir}/01-baseline-manifest.json`

方法论参考 `.claude/skills/ai-pm/references/baseline-delta-worksheet.md`，必读。

#### 步骤 1：参考资料清单化

扫描 `07-references/` 目录，列出所有文件，逐个打标签：
- 老版本 PRD
- 操作手册
- 线上数据 / 采用率
- 用户调研 / 反馈
- 竞品对应功能
- 其他

输出表格到 `01-baseline-delta.md` 顶部。

#### 步骤 2：强制阅读老系统资料（写需求草稿之前）

按优先级阅读：
- **P0（必读）**：老版本 PRD + 操作手册——建立老系统行为基线
- **P1（按需）**：线上数据 / 用户反馈——建立用户感知基线
- **P2（参考）**：竞品对应功能

**阅读视角**：不是「这个文档讲了什么」，而是「老系统的用户/运营/系统今天做什么；新版上线后这些行为会变成什么」。

**重点扫三类高密度避坑信息**：
1. 老 PRD 里的「异常流 / 配置依赖 / 互斥规则 / 补充说明 / 注：」
2. 操作手册里所有「需先 X」「需手动 Y」的隐性步骤
3. 运营/客服已知的「下线即问」功能

#### 步骤 3：产出基线 delta 工作表

四列结构：

| 老系统行为 | 新系统对应 | 用户感知差异 | PRD 干预 |
|----------|----------|------------|---------|

每行必过自检：
- 「老系统行为」是具体行为，不是笼统词
- 「新系统对应」非「待定」（保留 / 取消 / 替换 / 缺失四选一）
- 「缺失」行必有产品干预方案
- 「用户感知差异」非空（无感知也要标注理由）
- 「PRD 干预」引用具体章节号

详细模板和填写示例见 `references/baseline-delta-worksheet.md`。

#### 步骤 4：未覆盖坑清单

mitigation 列为空的行汇总到 `01-baseline-delta.md` 末尾的「未覆盖坑清单」章节，作为 Phase 5 写 PRD 时的重点关注项。

**填表过程 = 找坑过程。** 没填完整不能进 Phase 5。

#### 步骤 5：写入机读 baseline manifest

先用零写 bootstrap 发现候选来源和产物：

```bash
python3 scripts/aipm_contracts.py bootstrap --project "{project_dir}" --type iteration
```

用户确认候选范围后才可追加 `--apply`。随后由主对话基于已读材料补齐 `01-baseline-manifest.json` 的 claims：

- 当前事实 / 目标 / 已拍决策 / 假设分开登记，不把假设写成事实。
- 高风险 claim 必须关联 confirmed source；中风险无来源只能警告；低风险留痕。
- 被删除或改口径的 claim 写稳定 `claim_id` 和可扫描 aliases。
- `_status.json.artifacts[].dependencies` 关联 claim ID；无法判断时留空并明确 coverage gap，不猜。

完成后运行：

```bash
python3 scripts/aipm_contracts.py project --project "{project_dir}"
```

契约 error 未清零不能进入 Phase 5；warning 逐条展示给用户，高风险未决问题仍阻断。

## Phase 1 完成后：写入 L0 记忆

`01-requirement-draft/V{n}.md` 落盘后，立即执行：

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
