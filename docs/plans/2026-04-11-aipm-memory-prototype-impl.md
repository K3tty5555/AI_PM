# AI PM 分层记忆 + 设计指纹感知原型 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 AI PM 技能集增加两个能力：（A）三层项目记忆系统，让 `/ai-pm continue` 能在 30 秒内恢复项目上下文；（B）设计指纹感知原型，读取真实代码仓提取色值/布局/路由后生成贴近产品真实风格的原型。

**Architecture:** 记忆层以 Markdown 文件实现（无外部依赖），存在每个项目的 `_memory/` 目录下；Preset 预设存在 `templates/presets/`，创建项目时内容**复制**进项目，之后各项目独立演化；设计指纹提取仅在 `--codebase` 首次指定时扫描，结果缓存为 `_memory/layout-shell.md`，后续原型生成直接读取缓存。

**Tech Stack:** Markdown 文件（Read/Write 工具）、Bash（grep/find/head 用于代码仓扫描）、现有 AI PM skill 文件体系（`.claude/skills/ai-pm/`）

---

## Direction A: 分层项目记忆

### Task 1: 创建 Preset 预设目录 + 第一个预设

**Files:**
- Create: `templates/presets/智学网B端.md`

**Step 1: 确认目录存在**

```bash
ls /Users/xiaowu/workplace/AI_PM/templates/
```

预期：看到 `prd-styles/` 等现有目录（如不存在 presets 子目录则下一步创建）

**Step 2: 创建 templates/presets/智学网B端.md**

内容如下（完整写入，勿省略）：

```markdown
# 智学网 B 端预设

> 此文件用于 `/ai-pm new {项目名} --preset=智学网B端` 命令。
> 内容会被**复制**进新项目的 `_memory/L0-identity.md`，之后随项目独立演化，修改此文件不影响已有项目。

## 技术栈
Vue 3 + TypeScript + Vite + ElementPlus

## 设计 Token
主色：#05C1AE
错误色：#F45454
警告色：#F6B54E
成功色：#33A3EE
字体：系统默认（-apple-system / 微软雅黑）

## 目标用户
高中教师（数学/英语为主），B 端 SaaS，学校/区县采购。
教师角色包含：授课教师、学情管理员、考试管理员、单校管理员。

## 业务域
智学网，覆盖考试、作业、学情分析三条线。
主要产品线：精准教学（web-precision-agent）、题目设计（web-pt-dj-front）、
容器化工具（zx-container-web）、设计工作台（designer-workbench）。

## 产品原则
- 不做 C 端
- 数据安全红线：成绩发布控制 + 指标发布控制两层
- 权限快照机制：报告查看时实时读当前权限，非发布时固化
- 仅单校管理员/考试管理员可创建考试，教师不参与

## 代码仓路径（供设计指纹提取）
精准教学：/Users/xiaowu/workplace/xunfei_CODE/web-precision-agent
题目设计：/Users/xiaowu/workplace/xunfei_CODE/web-pt-dj-front
容器化：/Users/xiaowu/workplace/xunfei_CODE/zx-container-web
设计工作台：/Users/xiaowu/workplace/xunfei_CODE/designer-workbench
```

**Step 3: 验证写入成功**

读取 `templates/presets/智学网B端.md` 确认内容完整，特别是「设计 Token」和「代码仓路径」章节存在。

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add templates/presets/智学网B端.md
git commit -m "feat(memory): add 智学网B端 preset template"
```

---

### Task 2: 创建 project-memory.md 规范文件

这是整个记忆系统的**集中规范**，其他 phase 文件通过引用此文件来了解如何写入记忆。

**Files:**
- Create: `.claude/skills/ai-pm/references/project-memory.md`

**Step 1: 写入完整内容**

```markdown
# 项目记忆系统规范

## 目录结构

每个项目的 `_memory/` 目录包含：

```
_memory/
  L0-identity.md      # 产品定位、目标用户、核心约束（~100 tokens，常驻加载）
  L1-decisions.md     # 关键决策 + why + 时间戳（~300 tokens，常驻加载）
  L2-analysis.md      # 分析/竞品阶段专属上下文（按需加载）
  L2-prototype.md     # 原型阶段设计选择 + 待验证假设（按需加载）
  layout-shell.md     # 代码仓提取的布局结构（原型专用，首次 --codebase 时生成）
```

## 初始化

新项目创建时（`/ai-pm new` 或第一个 phase 开始前），执行：

```bash
mkdir -p {project_dir}/_memory/
```

若用 `--preset=xxx` 创建：
0. **前置校验**：先用 `test -f templates/presets/{预设名}.md` 检查文件是否存在。若不存在，**立即报错并列出可用预设**（`ls templates/presets/*.md`），不降级、不静默跳过：
   ```
   错误：预设 "{预设名}" 不存在。
   可用预设：{列出文件名，去掉 .md 后缀}
   ```
1. 读取 `templates/presets/{预设名}.md`
2. 复制其全部内容写入 `_memory/L0-identity.md`（不是引用，是复制）
3. 在终端提示：**"已复制预设内容到 {项目名}/_memory/L0-identity.md，后续修改预设文件不影响此项目。"**
4. 创建空的 `_memory/L1-decisions.md`（内容只含 `# {项目名} · 关键决策` 标题行）

若不用 preset：
1. 创建空的 `_memory/L0-identity.md`（待 Phase 1 完成后填写）
2. 创建空的 `_memory/L1-decisions.md`

## L0-identity.md 格式

产品定位、目标用户、核心约束，总量控制在 ~100 tokens（约 400 字）。

```markdown
# {项目名} · 产品身份

## 产品定位
{一句话：为谁解决什么问题}

## 目标用户
{用户角色、使用场景}

## 技术栈
{前端/后端/主要框架}

## 设计 Token
{主色值、辅助色等}

## 核心约束
{必须遵守的红线、禁止项}

## 业务域
{所属产品线/系统背景}
```

**更新时机**：Phase 1（需求澄清）完成后，根据 01-requirement-draft.md 填充/更新。

## L1-decisions.md 格式

关键功能决策，采用**追加不覆盖**原则。变更时用 `~~superseded~~` 标记旧记录。

**"一条"的定义**：以 `## YYYY-MM-DD: <标题>` 格式的二级标题为单元起点，到下一个同级 `##` 标题之前的全部内容为一条。continue 时"读最近5条"即读最后5个此类块。

```markdown
# {项目名} · 关键决策

## 2026-04-11: 侧边栏 Copilot 替代弹窗
**决策**：分析结果展示改为侧边栏 Copilot 模式
**原因**：弹窗打断操作流，教师反馈负面
**范围**：学情分析页、考后报告页

---

## 2026-03-10: ~~弹窗展示分析结果~~ ← superseded by 2026-04-11
```

**更新时机**：Phase 5（PRD）落盘后，提取「功能规格」中的关键取舍写入。

## L2-{phase}.md 格式

各阶段专属上下文，按需加载（只在对应 phase 时加载）。

### L2-analysis.md（Phase 2/3 完成后写入）

```markdown
# {项目名} · 分析洞察

## 核心用户痛点（Top 3）
1. {痛点1}
2. {痛点2}
3. {痛点3}

## 竞品差异点
- {竞品A}：{优势/不足}
- {竞品B}：{优势/不足}

## 我们的差异化机会
{1-2 句话}
```

### L2-prototype.md（Phase 7 完成后写入）

```markdown
# {项目名} · 原型设计记录

## 设计选择
- UI Shell：{套用了哪个真实 layout / AI 自行生成}
- 色值来源：{使用了 layout-shell.md 中的真实色值 / preset 色值 / AI 推断}
- 主要交互模式：{弹窗 / 侧边栏 / 页面跳转 等}

## 关键页面说明
- {页面名}：{设计意图}

## 待验证假设
- {假设1}：{需要通过用户测试验证的点}
- {假设2}：...
```

## layout-shell.md 格式（B 方向专用）

由 `/ai-pm prototype --codebase=` 命令触发生成，描述从代码仓提取的设计指纹。

若提取完全失败，文件内容为：`status: failed`（用于防止被误判为有效缓存）。

```markdown
# {项目名} · 布局指纹

> 提取自：{代码仓路径}
> 提取时间：{YYYY-MM-DD HH:MM}
> status: ok  （或 failed / partial）

## SCSS 色值变量
```css
/* 来源：{相对路径}/css-var.scss（或同等文件）*/
--primary-color: #05C1AE;
--error-color: #F45454;
--warning-color: #F6B54E;
--success-color: #33A3EE;
/* ... 其他找到的 CSS 变量 */
```

## 主布局结构
```
{用文字描述布局：如「顶部导航（60px）+ 左侧边栏（220px，含二级菜单）+ 右侧内容区 + 底部无」}
主要交互区域：{tab-bar 位置、agent panel 位置等}
```

## 路由页面列表
- {路由路径}：{页面名/功能描述}
（列出从 router/index.ts 提取的主要路由）

## 核心 UI 组件模式
```html
<!-- 典型卡片结构 -->
{从 components/ 抽样的真实组件 HTML 结构，精简到 10-20 行}
```
```

## _memory/ 与 _summaries/ 信息边界

| 目录 | 用途 | 可写 | 加载时机 |
|------|------|------|---------|
| `_summaries/` | token 压缩——大 PRD 的只读摘要，供后续 phase 快速读取完整 PRD 时用 | 否（只生成，不追加） | 同 phase 内按需 |
| `_memory/` | 跨会话上下文恢复——可写的决策日志和设计记录 | 是（追加写入） | continue 时加载 |

**不允许两个目录互相复制内容**。例如，`_summaries/prd-summary.md` 中的"关键设计决策"不写入 L1，L1 的来源只有 Phase 5 执行时主动提取的取舍决策。

## /ai-pm continue 读取规范

执行 `/ai-pm continue` 时，除读取 `_status.json` 外，额外执行记忆加载：

1. **固定加载**：用 `test -f` 检查，若 `_memory/L0-identity.md` 存在，读取全文；不存在则静默跳过（不报错）
2. **固定加载**：用 `test -f` 检查，若 `_memory/L1-decisions.md` 存在，读取最近 5 条决策
   - "一条"的边界：以 `## YYYY-MM-DD` 格式的二级标题为单元，读取该标题至下一个同级标题之间的全部内容
3. **按需加载**：先**确认用户即将执行的阶段**（通过 pending_step 或用户输入），再加载对应 `L2-{phase}.md`（`last_phase` 仅作 fallback 推断）：
   - 目标阶段为 `analysis` / `competitor` → 用 `test -f` 检查加载 `L2-analysis.md`
   - 目标阶段为 `prototype` → 用 `test -f` 检查加载 `L2-prototype.md`
4. **按需加载**：若 `_memory/layout-shell.md` 存在（`test -f`）且目标阶段为 `prototype` → 加载
5. **任何 test -f 失败均静默跳过，不报错，不中断 continue 流程**

**输出格式**（输出后直接进入工作，不再追问背景）：

```
── 项目：{项目名} · 恢复上下文 ──

产品：{L0 第一行「产品定位」内容，一句话}
上次完成：{last_phase 中文名}（{_status.json.updated 的日期部分}）
当前阶段：{推荐下一步}

关键决策：
· {L1 最近 3 条决策，每条一行}

遗留问题：
· {L2 中的「待验证假设」或「遗留问题」，若无则省略此节}

继续 {推荐下一步}？[Y/n]
```
```

**Step 2: 验证写入**

读取 `.claude/skills/ai-pm/references/project-memory.md` 确认以下章节存在：
- `## 目录结构`
- `## L0-identity.md 格式`
- `## L1-decisions.md 格式`
- `## /ai-pm continue 读取规范`

**Step 3: Commit**

```bash
git add .claude/skills/ai-pm/references/project-memory.md
git commit -m "feat(memory): add project-memory.md spec for layered memory system"
```

---

### Task 3: 更新 SKILL.md — 命令路由 + 目录结构

**Files:**
- Modify: `.claude/skills/ai-pm/SKILL.md`

**Step 1: 更新命令路由表**

在 SKILL.md 的「主流程命令」表中，找到：

```
| `/ai-pm new [项目名]` | 创建新项目 |
```

替换为：

```
| `/ai-pm new [项目名]` | 创建新项目（无 preset） |
| `/ai-pm new [项目名] --preset=[预设名]` | 创建新项目并应用预设（复制到 L0-identity.md） |
```

**Step 2: 更新原型命令**

找到：

```
| `/ai-pm prototype` | 生成原型 |
```

替换为：

```
| `/ai-pm prototype` | 生成原型（若已有 layout-shell.md 则自动应用） |
| `/ai-pm prototype --codebase=[路径]` | 首次指定代码仓，提取设计指纹后生成原型 |
```

**Step 3: 更新项目目录结构**

找到 `## 项目目录结构` 下的 ` ```  ` 代码块，在 `_summaries/` 行之后追加：

```
└── _memory/                     项目记忆（自动维护，勿手动删除）
    ├── L0-identity.md           产品定位/用户/约束（~100 tokens）
    ├── L1-decisions.md          关键决策 + why（~300 tokens）
    ├── L2-analysis.md           分析/竞品洞察（按需）
    ├── L2-prototype.md          原型设计记录（按需）
    └── layout-shell.md          代码仓设计指纹（--codebase 提取）
```

**Step 4: 更新 references 参考文档表**

在 `## 参考文档` 表中追加一行：

```
| `references/project-memory.md` | 项目记忆系统规范（L0/L1/L2/layout-shell 格式 + continue 读取规范） |
```

**Step 5: 更新 allowed-tools**

找到 frontmatter 中：

```
allowed-tools: Read Write Edit Bash(ls) Bash(mkdir) Bash(cat) Bash(chmod) Bash(test) Bash(python3) Agent
```

替换为：

```
allowed-tools: Read Write Edit Bash(ls) Bash(mkdir) Bash(cat) Bash(chmod) Bash(test) Bash(python3) Bash(grep) Bash(find) Bash(head) Bash(wc) Agent
```

（新增 grep/find/head 用于代码仓设计指纹提取，wc 已在 phase-5/7 用到但补全声明）

**Step 6: 验证**

读取 SKILL.md 确认：
- 命令表包含 `--preset` 和 `--codebase` 两个新变体
- 目录结构包含 `_memory/` 及其子文件
- 参考文档表包含 `project-memory.md`

**Step 7: Commit**

```bash
git add .claude/skills/ai-pm/SKILL.md
git commit -m "feat(memory): update SKILL.md with --preset, --codebase commands and _memory/ directory"
```

---

### Task 4: 更新 user-interaction.md — 新项目初始化 + continue 行为

**Files:**
- Modify: `.claude/skills/ai-pm/references/user-interaction.md`

**Step 1: 更新 _status.json schema**

找到 `## _status.json 规范` 中的 JSON 示例，在 `"summaries": {}` 这行之后追加：

```json
  "memory": {
    "codebase_path": ""
  }
```

说明：
- **不存布尔标记**：L0/L1/L2 等文件是否存在，运行时用 `test -f {project_dir}/_memory/L0-identity.md` 检查，不在 `_status.json` 中维护布尔值（避免双重真相源——手动删文件后布尔值仍为 true，导致 continue 误判）
- `codebase_path`：代码仓路径无法从文件存在性推断，单独保留，首次 `--codebase` 时写入
- **老项目兼容**：若 `memory` 字段完全不存在（老项目），视同 `{ "codebase_path": "" }`，不报错、不中断，就地补全后继续

**Step 2: 更新新项目创建规则**

在 `### phase 写入规则` 一节（或 `新项目创建时，在项目目录下生成初始 _status.json` 那段）末尾追加：

```
新项目创建时，同时执行：
1. mkdir -p {project_dir}/_memory/
2. 若指定 --preset={名}：
   a. 读取 templates/presets/{名}.md
   b. 将其全部内容写入 _memory/L0-identity.md
   c. 创建空的 _memory/L1-decisions.md（只有标题行）
   d. 更新 _status.json: memory.L0 = true, memory.L1 = true（L1 虽空但已创建）
3. 若不指定 --preset：
   a. 不预先创建 L0/L1（留给对应 phase 写入）
```

**Step 3: 更新 continue 命令规范**

找到 `### continue 命令执行规范`（在 SKILL.md 中），或在 user-interaction.md 中新增一节：

在 `## _status.json 规范` 一节之后，新增：

```markdown
## /ai-pm continue 执行规范（含记忆加载）

1. 读取 `_status.json`（若 `memory` 字段不存在，就地补全为 `{ "codebase_path": "" }`，不中断）
2. 加载项目记忆（见 `references/project-memory.md` 的「/ai-pm continue 读取规范」）
   - 任何文件不存在均静默跳过，不报错
   - 老项目无 `_memory/` 目录时，跳过所有记忆加载，直接按现有 checkpoint 逻辑恢复
3. 若有 `pending_step` → 展示恢复点 + 记忆摘要后继续执行
4. 若无 checkpoint → 展示记忆摘要后按 phase 级别恢复

**注**：记忆摘要的格式和内容详见 `references/project-memory.md`。
```

**Step 4: 验证**

读取 user-interaction.md 确认：
- `_status.json` schema 包含 `"memory"` 字段
- 存在 `--preset` 初始化说明

**Step 5: Commit**

```bash
git add .claude/skills/ai-pm/references/user-interaction.md
git commit -m "feat(memory): update _status.json schema and continue behavior with memory loading"
```

---

### Task 5: 更新 phase-1-requirement.md — Phase 1 完成后写 L0

**Files:**
- Modify: `.claude/skills/ai-pm/phases/phase-1-requirement.md`

**Step 1: 在文件末尾追加记忆写入规范**

在 phase-1-requirement.md 末尾追加：

```markdown
## Phase 1 完成后：写入 L0 记忆

`01-requirement-draft.md` 落盘后，立即执行：

1. `mkdir -p {project_dir}/_memory/`
2. 从 requirement-draft 提取以下内容写入 `_memory/L0-identity.md`：
   - **产品定位**：需求文档中的「产品/功能定位」或「解决什么问题」一句话
   - **目标用户**：用户角色列表
   - **技术栈**：若用户提到了前端框架/后端约束（若未提及留空）
   - **核心约束**：用户明确说的「不做XX」「必须XX」等红线

   若项目已有 L0-identity.md（通过 --preset 创建）：
   → **不覆盖**，而是在已有内容基础上追加或补全空白章节

格式参考 `references/project-memory.md` 的 L0-identity.md 格式。
```

（不需要更新 `_status.json` 的布尔标记——文件存在性本身即为状态来源。）

**Step 2: 验证**

读取 phase-1-requirement.md 确认末尾有 `## Phase 1 完成后：写入 L0 记忆` 节。

**Step 3: Commit**

```bash
git add .claude/skills/ai-pm/phases/phase-1-requirement.md
git commit -m "feat(memory): write L0-identity after Phase 1 requirement draft"
```

---

### Task 6: 更新 phase-2-analysis.md — Phase 2/3 完成后写 L2-analysis

**Files:**
- Modify: `.claude/skills/ai-pm/phases/phase-2-analysis.md`

**Step 1: 在文件末尾追加记忆写入规范**

```markdown
## Phase 2/3 完成后：写入 L2 分析记忆

`02-analysis-report.md` 和 `03-competitor-report.md` 均落盘后（主线程等待两个 Subagent 完成后执行）：

1. 从两份报告中提取以下内容写入 `_memory/L2-analysis.md`：
   - **核心用户痛点 Top 3**（来自 02-analysis-report.md）
   - **竞品差异点**（来自 03-competitor-report.md，各竞品一行）
   - **差异化机会**（1-2 句话总结）

格式参考 `references/project-memory.md` 的 L2-analysis.md 格式。
```

**Step 2: 验证**

读取 phase-2-analysis.md 确认末尾有 `## Phase 2/3 完成后：写入 L2 分析记忆` 节。

**Step 3: Commit**

```bash
git add .claude/skills/ai-pm/phases/phase-2-analysis.md
git commit -m "feat(memory): write L2-analysis after Phase 2/3 completion"
```

---

### Task 7: 更新 phase-5-prd.md — PRD 落盘后写 L1-decisions

**Files:**
- Modify: `.claude/skills/ai-pm/phases/phase-5-prd.md`

**Step 1a: 在 Checkpoint 子步骤表中新增 `memory_write` 步骤**

找到 phase-5-prd.md 中的 checkpoint 子步骤表（含 `prd_done` 那行），在其**之后**追加一行：

```
| `memory_write` | 决策记忆写入 | 写入 L1-decisions.md（3–5 条关键取舍） |
```

同时在 Plan Mode 前置展示的步骤列表中，将"9. 落盘 + 摘要 + 成本记录"改为：

```
  9. 落盘 + 摘要 + 成本记录
  10. 决策记忆写入（L1-decisions.md）
```

**Step 1b: 在文件末尾追加记忆写入规范**

```markdown
## memory_write 步骤：写入 L1 决策记忆

`prd_done` 子步骤完成（含摘要 + 成本记录落盘）之后，执行 `memory_write` 步骤：

1. 从 `05-prd/05-PRD-v1.0.md` 的「功能规格」章节提取关键取舍决策：
   - 选择了什么方案，以及原因（来自「背景」「设计说明」「注意」等段落）
   - 明确排除的功能及原因（来自「不在范围内」「禁止」等）
   - 典型场景：采用侧边栏而非弹窗、分步表单而非单页表单、等

2. 以**追加**方式写入 `_memory/L1-decisions.md`（不覆盖已有内容）：
   - 每条决策格式：
     ```
     ## {YYYY-MM-DD}
     **决策**：{内容}
     **原因**：{为什么}
     **范围**：{影响功能/页面}
     ---
     ```
   - 提取 3-5 条最关键的决策即可，不要穷举

格式参考 `references/project-memory.md` 的 L1-decisions.md 格式。
```

**Step 2: 验证**

读取 phase-5-prd.md 末尾部分确认有 `## PRD 落盘后：写入 L1 决策记忆` 节。

**Step 3: Commit**

```bash
git add .claude/skills/ai-pm/phases/phase-5-prd.md
git commit -m "feat(memory): write L1-decisions after PRD completion"
```

---

## Direction B: 设计指纹感知原型

### Task 8: 更新 phase-7-prototype.md — 添加 --codebase 支持 + L2 写入

**Files:**
- Modify: `.claude/skills/ai-pm/phases/phase-7-prototype.md`

这是本次改动最复杂的一个任务，分三个子步骤：8a（--codebase 参数处理）、8b（指纹提取逻辑）、8c（L2-prototype 写入）。

---

#### Step 8a: 添加 --codebase 参数处理节

在 `### Plan Mode 前置展示` 之前（文件顶部，`## Phase 7: 原型生成` 节内），插入：

```markdown
### --codebase 参数处理（原型生成前执行）

触发时机：用户执行 `/ai-pm prototype --codebase={路径}` 或当前阶段检测到 `--codebase` 参数时。

**执行流程**：

0. **路径安全校验**（在任何 bash 命令之前执行）：
   - 路径必须是绝对路径（以 `/` 开头）
   - 路径必须位于用户 home 目录下（前缀匹配 `~` 展开后的路径）
   - 若不满足，立即报错："路径 {路径} 不在允许范围内，请使用绝对路径且位于 home 目录下。"
   - 不执行任何 bash 命令

1. **检查缓存**：`test -f _memory/layout-shell.md`
   - **存在且不含 `status: failed` 标记** → 读取文件头部的"提取时间"，提示"已有设计指纹缓存（{提取时间}），直接使用。如需重新提取，请删除 `_memory/layout-shell.md` 后重试。" → 跳过提取，直接进入原型生成
   - **不存在或含 `status: failed`** → 执行提取流程

2. **提取流程（约 30 秒）**，各步骤独立，任何步骤失败均记录后继续其他步骤：

   a. **设计 Token / 色值**（三级 fallback）：
   ```bash
   # 优先：SCSS 变量文件
   find {codebase_path}/src -maxdepth 6 -name "css-var.scss" -o -name "variables.scss" -o -name "colors.scss" 2>/dev/null | head -3
   ```
   有结果时：`grep -E "^\s*(--|\\$)[a-z-]*color" {file} | head -30`

   无结果时，fallback 到 CSS 自定义属性：
   ```bash
   find {codebase_path}/src -maxdepth 6 -name "*.css" 2>/dev/null | xargs grep -l "\-\-.*color" 2>/dev/null | head -3
   ```

   仍无结果时，fallback 到 Tailwind config：
   ```bash
   find {codebase_path} -maxdepth 3 -name "tailwind.config.*" 2>/dev/null | head -1
   ```

   **全部 fallback 均无结果**：在 layout-shell.md 中记录 `设计Token: 未找到，使用默认色彩方案`，并向用户提示。

   b. **主布局结构**：
   ```bash
   find {codebase_path}/src -maxdepth 6 -name "*.vue" 2>/dev/null | xargs grep -l "layout\|Layout\|shell\|Shell" 2>/dev/null | head -3
   ```
   对找到的文件用 Read 工具读取 `<template>` 部分（前 80 行），提炼布局文字描述（顶部导航高度、侧边栏宽度、主内容区结构），不逐行复制原始 Vue 代码。

   c. **路由页面列表**（支持多种项目结构）：
   ```bash
   find {codebase_path}/src -maxdepth 5 -name "*.ts" -o -name "*.js" 2>/dev/null | xargs grep -l "createRouter\|routes:" 2>/dev/null | head -3
   ```
   读取找到的文件，提取 `path` + `name` / `component` 字段，列出主要路由（最多 20 条）。

   d. **核心 UI 组件模式**（精简抽取，控制信息密度）：
   ```bash
   find {codebase_path}/src/components -maxdepth 3 -name "*.vue" 2>/dev/null | head -5
   ```
   对每个文件，只提取：组件名（文件名）+ `props` 类型声明 + `<template>` 根元素的**直接子元素结构**（不超过 10 行），不复制完整 template。

3. **写入 `_memory/layout-shell.md`**（格式见 `references/project-memory.md`）
   - 若提取**完全失败**（4 组命令均无有效输出），在文件中写入 `status: failed`，并向用户明确提示"设计指纹提取失败，原型将使用默认风格生成"
   - 若**部分成功**，正常写入已提取到的内容，并标注哪项未找到

4. **更新 `_status.json.memory.codebase_path`** 为传入路径

5. 向用户提示提取结果摘要（成功/部分成功/失败）→ 继续原型生成
```

---

#### Step 8b: 更新原型生成步骤 layout_structure，注入 layout-shell 上下文

找到 checkpoint 子步骤表中的 `layout_structure` 行，在其下方（执行规范部分）添加：

```markdown
**layout_structure 执行时**：
- 若 `_memory/layout-shell.md` 存在：读取全文，在构建 HTML 骨架时：
  - 用 layout-shell 中的「主布局结构」决定 HTML 的顶层 div 嵌套
  - 用「SCSS 色值变量」替换原型中的 CSS 颜色（`:root { --primary: #05C1AE; ... }` 注入到 `<style>` 顶部）
  - 用「路由页面列表」决定导航菜单项（不捏造不存在的页面）
  - 用「核心 UI 组件模式」作为卡片/表格样式的参考基础
- 若无 layout-shell：按现有逻辑 AI 自行设计
```

---

#### Step 8c: 在原型完成后追加 L2-prototype 写入

在文件末尾（审计完成 `audit_done` 步骤描述之后）追加：

```markdown
## 原型/审计完成后：写入 L2 原型记忆

`07-audit-report.md` 落盘后，执行：

1. 写入 `_memory/L2-prototype.md`，内容包括：
   - **设计选择**：
     - UI Shell：`套用了 layout-shell.md（来自 {codebase_path}）` 或 `AI 自行生成`
     - 色值来源：`layout-shell.md 中的 CSS 变量` / `preset 预设色值` / `AI 推断`
     - 主要交互模式：列出原型中使用的主要交互（弹窗/侧边栏/标签页等）
   - **关键页面说明**：列出原型包含的主要页面及其设计意图（来自 PRD 功能模块）
   - **待验证假设**：来自 07-audit-report.md 中「未覆盖功能」或「部分覆盖」条目，标记为需后续验证

2. 更新 `_status.json`: `memory.L2_prototype = true`

格式参考 `references/project-memory.md` 的 L2-prototype.md 格式。
```

**Step 8d: 验证**

读取 phase-7-prototype.md 确认以下内容存在：
- `### --codebase 参数处理` 节
- `layout_structure 执行时` 注入说明
- `## 原型/审计完成后：写入 L2 原型记忆` 节

**Step 8e: Commit**

```bash
git add .claude/skills/ai-pm/phases/phase-7-prototype.md
git commit -m "feat(prototype): add --codebase design fingerprint extraction and L2-prototype memory write"
```

---

## 验收测试

### 模拟验收 A：分层记忆流程

用以下假设场景口头验证（无需真实运行，逻辑推演即可）：

1. 执行 `/ai-pm new 考试智能批阅 --preset=智学网B端`
   - 预期：`_memory/L0-identity.md` 被创建并包含智学网B端.md 的内容
   - 预期：`_status.json.memory.L0 = true`

2. Phase 1 完成后
   - 预期：L0-identity.md 被补全「产品定位」字段（基于 requirement-draft 提取）

3. Phase 5 完成后
   - 预期：`_memory/L1-decisions.md` 存在并有至少 1 条决策记录

4. 新开会话，执行 `/ai-pm continue`
   - 预期：输出「── 项目：考试智能批阅 · 恢复上下文 ──」格式的摘要
   - 预期：摘要包含「产品定位」「关键决策」两节内容
   - 预期：不再询问「能介绍一下项目背景吗」

### 模拟验收 B：设计指纹流程

1. 执行 `/ai-pm prototype --codebase=/Users/xiaowu/workplace/xunfei_CODE/web-precision-agent`
   - 预期：先校验路径合法性（绝对路径 + home 目录内）
   - 预期：运行 4 组 bash 命令提取信息（含 `-maxdepth` 参数）
   - 预期：生成 `_memory/layout-shell.md`，含 `#05C1AE` 等真实色值，`status: ok`
   - 预期：`_status.json.memory.codebase_path` 写入路径

2. 原型 HTML 生成后
   - 预期：`<style>` 中有 `:root { --primary-color: #05C1AE; ... }` 声明
   - 预期：导航菜单项与路由文件中的路由一致，无捏造页面

3. 再次执行 `/ai-pm prototype`（无 --codebase）
   - 预期：`test -f _memory/layout-shell.md` 通过，且无 `status: failed`
   - 预期：提示「已有设计指纹缓存」，不重新提取

4. 非法路径测试（`--codebase=../../etc`）
   - 预期：报错"路径不在允许范围内"，不执行任何 bash 命令

5. SCSS 文件不存在场景
   - 预期：3 级 fallback 全部执行，全找不到时 layout-shell.md 写入 `设计Token: 未找到`，`status: partial`，用户收到明确提示

---

## 实施顺序

建议按以下顺序执行，每个 Task 独立，完成后 commit：

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8
```

Task 1-4（框架）可在 30 分钟内完成，Task 5-7（phase hooks）每个 5 分钟，Task 8（设计指纹）最复杂约 15 分钟。

---

*计划写于 2026-04-11，对应设计文档：`docs/plans/2026-04-11-aipm-memory-prototype-design.md`*
