# Phase 7: 原型生成 + 设计质量审计

**输入**: `05-prd/` 下最新版本 PRD MD + `_memory/L2-prd-versions.md`（若存在）
**输出**: `06-prototype/prototype-spec.json` + `06-prototype/lowfi/index.html` + `06-prototype/index.html` + `06-prototype/review/index.html` + `07-audit-report.md` + `_memory/L2-prototype.md`

## 参考文档读取（各阶段前置，自动执行）

> **单一事实源 = `phase-5-prd.md` 「参考文档读取」节**（2026-07-12 收敛：原三处 40 行副本已漂移过一次——失败语义两个版本）。本阶段照该节执行：PDF 视觉读取→PNG 逐页、DOCX→md 转换、摘要进 `_memory/L2-prd-versions.md`、无文档静默跳过；**失败语义**：渲染/转换失败不中断（输出 `SKIP:{文件名}:{原因}`），参数/环境依赖错误（如缺 pypdf）属阻断（ERROR + exit 1）。

## Phase 7: 原型生成

### 当前产品 source/target gate（迭代项目强制）

生成蓝图前按 `ai-pm-prototype` 的「步骤1.8」创建 `06-prototype/source-target-manifest.json`，并运行：

```bash
python3 scripts/aipm_contracts.py prototype --project "{project_dir}"
```

- Web/Mobile 分别取证，分别写 current/target/unchanged。
- 证据缺失可做显式假设稿，但不得宣称还原现状或完成端别适配，且不能通过正式评审 gate。
- 0→1 项目写 `not-applicable`，不强造旧产品基线。
- 原型审计必须核对被删除 claim 是否仍出现在入口、文案、状态和交互里；评审前运行 `/ai-pm reconcile`。

### --codebase 参数处理（原型生成前执行）

触发时机：用户执行 `/ai-pm prototype --codebase={路径}` 或当前阶段检测到 `--codebase` 参数时。

**执行流程**：

0. **路径安全校验**（在任何 bash 命令之前执行）：
   - 路径必须是绝对路径（以 `/` 开头）
   - 路径必须位于用户 home 目录下（前缀匹配 `~` 展开后的路径）
   - 若不满足，立即报错："路径 {路径} 不在允许范围内，请使用绝对路径且位于 home 目录下。"
   - 不执行任何 bash 命令

1. **检查缓存**：`test -f {project_dir}/_memory/layout-shell.md`
   - **存在且不含 `status: failed` 标记** → 读取文件头部的"提取时间"，提示"已有设计指纹缓存（{提取时间}），直接使用。如需重新提取，请删除 `{project_dir}/_memory/layout-shell.md` 后重试。" → 跳过提取，直接进入原型生成
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

3. **写入 `_memory/layout-shell.md`**（格式见 `references/project-memory.md`，该文件已存在）
   - 若提取**完全失败**（4 组命令均无有效输出），在文件中写入 `status: failed`，并向用户明确提示"设计指纹提取失败，原型将使用默认风格生成"
   - 若**部分成功**，正常写入已提取到的内容，并标注哪项未找到

4. **更新 `_status.json`**：将 `memory.codebase_path` 设置为传入路径（仅更新此字段，不新增其他布尔字段）

5. 向用户提示提取结果摘要（成功/部分成功/失败）→ 继续原型生成

### Plan Mode 前置展示（执行前必须展示）

用户触发原型生成后，**先展示执行计划**并等待确认：

```
即将开始：原型生成
─────────────────────────────
执行步骤（共 10 步）：
  1. 原型生成前确认（含 token 消耗提示）
  2. 视觉锚点包检查（如有）
  3. 原型蓝图 + 视觉方向
  4. 动效档位选择
  5. 页面框架搭建
  6. 各页面生成
  7. 样式精修
  8. 原型落盘 + 成本记录
  9. 完整性 + 设计质量审计（自动）
  10. 审计报告落盘

读取文件：_summaries/prd-summary.md（或当前 PRD：05-prd/<当前 PRD 文件>）
可选读取：06-prototype-visual/manifest.json, 06-prototype-visual/visual-fingerprint.md
写入文件：06-prototype/index.html, 07-audit-report.md

继续？[Y/n]
```

- 用户回复 Y / 回车 / 「继续」 → 执行 Checkpoint 子步骤（从 preflight_confirm 开始）
- 用户回复 n / 「取消」 → 返回主菜单

### 启动前：加载 PRD 上下文

按以下顺序读取 PRD 上下文，避免直接载入大文件：

1. 检查 `{project_dir}/_summaries/prd-summary.md` 是否存在
   - **存在** → 读摘要作为主要上下文；若原型需要具体字段或流程细节，再按需读 PRD 对应章节
   - **不存在且 PRD < 20KB** → 直接读完整 PRD
   - **不存在且 PRD ≥ 20KB** → 先按 phase-5-prd.md 中的「PRD 落盘后：生成摘要」规范生成摘要，再读摘要

同样，Phase 7.5 审计读取 PRD 时遵循相同的优先级（摘要优先，原文按需）。

基于 PRD 生成可交互的单页网页原型。生成前提示 Token 消耗并等待用户确认。

### 启动前：视觉锚点包检查

在 Prototype Agent 质量前置之前，检查 `{project_dir}/06-prototype-visual/manifest.json`：

1. **存在且 `status=ready`**
   - 读取 `manifest.json`
   - 读取 `visual-fingerprint.md`
   - 如存在 `audit.md`，读取其中“可交接给 Claude Code 的约束”
   - 汇总 `images[].label`、`images[].image`、`images[].usableForHtmlConstraint`
   - 原型蓝图和 HTML 生成必须遵循视觉锚点包中的布局节奏、组件比例、页面密度、色彩气质和禁忌项
   - 向用户提示："检测到视觉锚点包，已作为 HTML 原型视觉约束读取。"

2. **存在但 `status=partial`**
   - 读取 `visual-fingerprint.md` 和已生成/计划生成的图片清单
   - 允许继续普通原型流程，但必须在审计报告中标注“视觉锚点包未完成”，并列出缺失页面
   - 若 `request.json` 中 `gateMode=strict`，暂停并提示用户先切到 Codex 生成完整视觉锚点包

3. **存在但 `status=failed`**
   - 不阻断普通 HTML 原型
   - 在审计报告中标注视觉锚点包失败原因，降级使用 PRD / 设计规范 / `layout-shell.md`

4. **不存在**
   - 普通原型继续执行
   - 若用户明确选择“视觉锚定原型 / --visual-strict”，先写出 `06-prototype-visual/request.json` 后暂停，提示用户切到 Codex 生成视觉锚点包

**边界**：
- Claude Code 只读取和生成 `request.json`，不直接调用 Codex 或生图工具。
- 视觉锚点图只约束 HTML 原型的布局、密度、组件形态和视觉气质，不替代可点击交互。
- 图片中文字只作为视觉表达，最终文案、字段和规则以 PRD 正文为准。

### 启动前：Prototype Agent 质量前置

原型生成不是直接写 HTML。进入 `layout_structure` 前，必须先按 `.claude/agents/prototype-agent.md` 的 Mode A 产出原型蓝图；如果 Agent 工具不可用，主对话按同一角色规则执行。

**调用模板**：

```
Agent(subagent_type=prototype-agent, prompt="
读取 PRD/摘要、项目记忆、设计规范/代码仓指纹（如有）、视觉锚点包（如有），输出原型蓝图。
重点包括：页面与主流程、信息层级、状态清单、交互清单、视觉设计方向、生成硬约束。
视觉设计是原型质量的一部分，不能因为是原型就接受模板套壳或灰白卡片。
原型 = 镜像：屏幕上只留用户真会看到的字，不写对评审解释产品的注解（防 PRD bleed，PRD 陈述规则、原型表演规则）；生成硬约束里必须包含这条。
")
```

**蓝图必须覆盖**：
- 页面/视图清单：每页目的、关键操作、是否需截图占位。
- 主流程：用户如何完成核心任务。
- 信息层级：首屏重点、次级信息、操作区、反馈区。
- 状态清单：默认、空、加载、错误、成功；Agent 产品另含 AI 思考、工具失败、结果预确认。
- 视觉方向：布局密度、组件策略、色彩气质、字体层级、数据呈现方式。
- 生成硬约束：5-8 条可执行约束，用于约束后续 HTML。

**落地要求**：
- HTML 生成必须显式遵循蓝图，不允许重新自由发挥。
- 若有 `{project_dir}/06-prototype-visual/manifest.json` 且状态为 `ready`，HTML 生成必须优先遵循 `visual-fingerprint.md` 与 `manifest.images[].image` 指向的视觉锚点图。
- 若有 `{project_dir}/_memory/layout-shell.md`，蓝图中的视觉方向必须以代码仓指纹为优先约束。
- AI 情境定制模式下，prototype-agent 负责做场景化视觉判断，不能退回通用 SaaS 模板。
- 蓝图可作为上下文使用；若当前运行环境允许写文件，可同步记录到 `_memory/L2-prototype.md` 的「设计选择」草稿中。

### 关键帧规格与中保真线框确认门（精细原型前强制）

按 `ai-pm-prototype/references/collaboration-loop.md`：

1. 把页面、关键状态、主流程和稳定功能点写入 `06-prototype/prototype-spec.json`。
2. 校验 spec，生成 `06-prototype/lowfi/index.html`；该页必须同时展示全部关键流程和关键帧，并让用户看清具体栏宽、导航、表单、列表、表格、画布、弹窗和操作区关系，每帧下方可评论。
3. 等待用户确认页面范围、布局和流程方向。
4. 只有与当前 spec hash 一致的 `decision=approved` 才进入精细原型；用户提出问题时先修 spec 和低保真。

0→1 原型，以及页面结构、主流程、关键状态变化必须执行。纯视觉或局部小修仅在用户明确要求时可跳过，并留 `skip_reason`。

PRD 的“核心流程”优先写成 Mermaid 代码块（通常使用 `flowchart TD` 或 `flowchart LR`），清楚表达并行路径、分支和确认节点；不要只堆叠一条无法体现分支关系的长句。企业云文档同步后通常会落成代码块，需在文档侧手动开启流程图插件渲染。

### 动效强度档位

原型生成前根据用户选择的动效档位注入对应的 CSS/JS 约束：

| 档位 | MOTION_INTENSITY | VISUAL_DENSITY | DESIGN_VARIANCE | 适用 |
|------|:---:|:---:|:---:|------|
| 低·克制 | 2 | 3 | 4 | B 端、内部工具 |
| 中·平衡 | 6 | 5 | 7 | C 端、移动端 |
| 高·丰富 | 8 | 7 | 9 | 营销页、品牌展示 |

**CSS/JS 白名单约束**：
- **低档**：只允许 `transition`（duration <= 300ms）
- **中档**：允许 `@keyframes` + `transition`（duration <= 600ms）
- **高档**：允许 `gsap` / `framer-motion` / 自定义动画

**行业自动推荐**：finance/enterprise → 低·克制，tech/education → 中·平衡，ecommerce → 高·丰富

## 原型落盘后：写入成本记录

```bash
# 获取原型文件字节数
wc -c {project_dir}/06-prototype/index.html
```

将字节数 × 0.25 作为 `tokens_estimate`，追加写入 `_status.json` 的 `cost.phases`：

```json
"prototype": {
  "model": "claude-sonnet-4-6",
  "tokens_estimate": {file_bytes * 0.25},
  "completed_at": "{ISO8601 时间戳}"
}
```

并更新 `cost.total_estimate`（累加所有已有 phases 的 tokens_estimate）。

## 原型落盘后：设计师交接文件（HANDOFF.md，强制产出）

原型读者 = 用户（预览）+ 设计师（接手做"代码可复用"层 → 前端）。HTML 落盘后产出 `{project_dir}/06-prototype/HANDOFF.md`：

- 页面清单（每页目的）
- 状态清单（已实现 / 未实现）
- 组件策略（表格/卡片/对话流等 + 为什么）
- 视觉约束来源（锚点包 / 设计规范 / 代码仓指纹，供设计师追溯）
- 未实现交互（占位标注过的）
- 已知假数据边界（哪些数据是演示假数据，别照搬）
- 设计师接手注意点

**规格只进 HANDOFF.md**：不写进 HTML 屏幕（= bleed，用户会看到）、不写回 PRD 功能表格（像素/色号/动效毫秒铁律不变）。

## 原型落盘后：巡检画廊与定点标注（强制产出）

按 `ai-pm-prototype/references/collaboration-loop.md`：

1. 关键元素写入 `data-aipm-id`。
2. 若用户指定代码仓、源码目录或资料文件夹，先运行 `scan-source` 生成来源证据 manifest；如项目有 `visual-tokens.json`，后续页面统一传入 `--tokens`。
3. 读取当前规格对应的 `feedback/lowfi-approval.json` 并校验 hash；未通过低保真确认门不得生成精细原型巡检页。注入 `runtime/annotation-runtime.js`；标签表单只保留类型和内容，支持功能说明、评审评论、问题、修改意见、回复、解决与重开；文档关联信息直接写入内容。
4. 生成 `review/index.html`，按流程展示精细原型全部关键帧，允许逐帧记录通过、有问题、待复核和评论。
5. 巡检页左侧关键帧导航和右侧记录区可独立收起；中间 iframe 有加载中/超时提示；原型和运行时资源引用带内容版本参数，避免白屏和旧缓存。
6. 页面定点标注表单只保留“类型”和“内容”；已有标签支持“删除标签”并在删除前二次确认，历史 JSON 字段继续兼容但不再展示。用户说“意见已提交”时，读取 `feedback/` 下最新的 `review-feedback.json` 与 `annotations.json`。
7. feedback/annotation JSON 经校验后，先运行 `modification-preview`；用户确认后才执行修改，完成后用 `diff-prototype` 和 `accept` 留下复核证据。

## Phase 7.5: 原型完整性 + 设计质量审计（自动触发）

**前提条件**: Phase 5（PRD）和 Phase 7（原型）均已完成，即当前 PRD（`05-prd/<当前 PRD 文件>`）和 `06-prototype/index.html` 都存在。

**跳过条件**: 
- PRD 未生成（跳阶段场景）→ 跳过审计，提示"无 PRD 可比对"
- 用户明确要求跳过

**执行方式**: 技能侧（LLM）执行，不依赖外部工具。优先按 `.claude/agents/prototype-agent.md` 的 Mode B 审计；Agent 工具不可用时主对话按同一规则审计。

**步骤**:
1. 读取当前 PRD，提取所有功能模块和功能点（解析 ## 级标题和功能列表）
2. 读取 `06-prototype/index.html` 的 HTML 源码
3. 如果存在 `06-prototype/screenshots/manifest.json`，也读取以获取多页面信息
4. 运行 `python3 scripts/aipm_prototype_collab.py check-html --html "{project_dir}/06-prototype/index.html"`，检查重复 ID 和脚本、图片、iframe 本地资源路径；巡检页与低保真页也要分别检查
5. 逐个功能点检查是否在原型中有对应的页面/视图/交互元素体现
6. **6 表格截图覆盖检查**：扫描 PRD 中 `## 六` 或 `## 6` 级别下的所有详细设计表格，检查每个表格是否含 `原型示意` 行；若某表格无 `原型示意` 行且未注明"无界面交互（原因）"（四态协议标准写法，"纯后端"等旧措辞按此归一），记录为审计警告（⚠️）
7. **Agent 原型对话流检查（仅 agent / hybrid 产品）**：读取 `_memory/L1-decisions.md` 中的 `product_type`，若为 agent / hybrid，则原型必须包含以下要素，缺一项记录为审计警告（⚠️）：
   - **对话气泡**：至少 1 处用户输入气泡 + 至少 1 处 AI 回复气泡（用户↔AI 双方）
   - **AI 状态卡片 / 摘要预确认 / 卷面预览类组件**：呈现 AI 决策结果的可视化（不只是纯文本对话）
   - **错误兜底界面**：至少 1 处展示"AI 答错 / 工具失败 / 数据不足"的兜底文案与替代方案
   - **AI 自主决策的修改入口**：默认值附近有用户可改的按钮 / 拖拽 / 自然语言输入框（对应 A4 决策清单的"修改路径"）
7. **同场景组多工具整合检查（仅 agent / hybrid 产品）**：若 PRD 6.1.0 场景分组下定义了多个工具（如题库场景组下的"搜题"+"组卷"），原型应**整合到同一份 HTML 文件**通过 mode 切换（DOM 内 cap-card active + welcome 内容刷新），**不应**做成多份独立 HTML 用 `window.open` 跳转。
   - **理由**：研发评审会把"页面跳转"误读为产品要做"页面重建"，但本质是同一对话栏内的工具切换；多份 HTML 还会导致 panel-open 状态丢失、对话上下文消失等次生问题
   - **实施约定**：用 `currentMode` 状态变量 + `switchMode(mode)` 函数；切换时清空当前对话（同组切换工具相当于"新对话"，符合 6.1.0 对话上下文规则）
   - **审计判定**：若发现 `06-prototype-{xxx}/` 多目录且 onclick 含 `window.open`，记为 ⚠️ 警告，建议合并
7bis. **可见文案防 bleed 审计（forced-artifact，先机械后判断）**：红旗词 grep——`grep -nE "原型示意|用于说明|可读不可点|标了来自|不进学生端|评审|PRD|规则如下" {project_dir}/06-prototype/*.html`；命中逐条填四列表「可见文案 / 用户真会看到吗 / 是否 PRD meta / 处理动作」，落 `06-prototype/visible-copy-audit.md`。**命中不自动删，逐条判**——AI 对用户的真话术/思维链/状态文案留，对评审解释的 meta（溯源括号注解、权限说明 caption）挪 HANDOFF.md 或留 PRD。原则：PRD 陈述规则，原型表演规则（规则做出来本身就是演示，不用注解）。
8. 按 `prototype-judgment-card.md` 进行 12 分制质量评分：
   - **PRD 覆盖**（0-4）：页面、功能、关键状态是否覆盖
   - **交互体验**（0-4）：核心任务是否能走通，点击/输入/切换是否有反馈
   - **视觉设计**（0-4）：信息层级、页面密度、组件一致性、业务假数据是否可信
9. 任一维度 < 3 或总分 < 9 时，输出必修 punch list，并提示"修完再评审"；视觉设计低分同样阻断，不允许"功能齐但很丑"直接通过。
10. 生成审计报告

**输出格式** — 保存到 `07-audit-report.md`：

```markdown
## 原型完整性与设计质量审计

审计时间: {日期}
PRD 版本: v1.0

### 质量评分

| 维度 | 分数 | 结论 |
|------|------|------|
| PRD 覆盖 | {0-4} | {一句话} |
| 交互体验 | {0-4} | {一句话} |
| 视觉设计 | {0-4} | {一句话} |

**总分**: {N}/12
**结论**: {可进评审 / 修完再评审}

### PRD 覆盖明细

| PRD 功能点 | 原型状态 | 说明 |
|-----------|---------|------|
| {功能名} | ✅ 已覆盖 | 对应 {页面/视图名} |
| {功能名} | ❌ 未覆盖 | 原型中无对应页面或按钮 |
| {功能名} | ⚠️ 部分覆盖 | {具体说明} |

**覆盖率**: {已覆盖数}/{总数}（{百分比}%）

### 必修 punch list
1. {功能名} — 建议补充 {页面/视图描述}
2. ...

**建议**: {根据覆盖率与质量评分给出下一步}
```

**审计比对原则**:
- 只比对页面/视图级别，不要求交互细节完全对齐
- 纯静态展示的原型也能审计
- "部分覆盖"指有入口但缺少完整流程
- 对功能点的命名做语义匹配，不要求字面完全一致

**视觉/布局验证（可操作级必做）**:
- 上面的 LLM 侧审计验的是覆盖与设计判断；**布局/视觉是否真的渲染正确，必须经用户允许后用浏览器逐状态截图肉眼核对**——每道闸、每个异常态、每个产出件页面，在目标视口看真实渲染（详见判断卡 §11）。
- **DOM 断言（存在/计数/可见/类名）只验逻辑，验不出溢出、折行、竖排、错位**；没截图核对的状态在审计报告里如实标"仅 DOM 验证，未视觉核对"，不谎报"全过"。
- 注入式原型尤其注意复用现网容器类带来的继承布局问题（判断卡 §10 末）；用户确认的三栏职责必须逐栏核对，不能用“有三个 panel”代替真实信息架构核对。

**审计完成后**:
- 向用户展示审计结果
- 如果覆盖率 < 100%、任一评分 < 3 或总分 < 9，提示可选操作："是否要按 punch list 修复原型？"
- 用户选择修复 → 将未覆盖功能点与质量问题追加到现有原型中（优先局部补齐，不重建已有页面），从 `layout_structure` 步骤继续
- 用户选择跳过 → 进入 Phase 7.6（截图插入 PRD）
- 若 `06-prototype/screenshots/manifest.json` 存在 → 自动提示进入 Phase 7.6；否则提示用户先截图，或跳过直接进入 Phase 8

## Phase 7.6: 截图插入 PRD 6 表格

**触发时机**：Phase 7.5 审计完成后，若 `06-prototype/screenshots/manifest.json` 存在则自动提示；或用户说"把截图插入 PRD / DOCX"时手动触发。只有用户明确授权浏览器核验后，才允许把截图标记为视觉复核通过。

### Step 1：扫描 6 所有表格，输出插入计划（执行前必须等待用户确认）

读取 PRD MD，扫描 `6` 级别下所有详细设计表格，**按原型示意 cell 四态协议判**（唯一源：判断卡 §七「原型图」行）：
- `![xxx原型](path)<br>描述` → 已有图，核对文件存在即可（更新截图时替换路径）
- `[待补原型：xxx] 描述` → **本流程的插入点**，对应 manifest.json 中的 label
- `无界面交互（原因）` / 复用语（`同V1.1原型图，仅X变化`）→ 跳过
- 旧 `[xxx原型]` 占位 → 历史兼容态，本次插入时**顺手升级为 `![](相对路径)<br>描述` 新写法**
- 无 `原型示意` 行 → 标记为"未覆盖"，必须在此步骤确认是无界面交互（跳过）还是遗漏（补充）

输出计划表后**停下来等待用户确认，不提前执行**：

```
截图插入计划（共 N 处）
────────────────────────────────────────────────────────────
| 章节    | 占位符           | manifest 对应截图         | 状态    |
|--------|----------------|------------------------|-------|
| 6.1.1 | [欢迎界面原型]    | 01-welcome.png          | ✅ 对齐 |
| 6.2.7 | [无结果原型]     | 04-no-results.png       | ✅ 对齐 |
| 6.3.1 | [xxx原型]        | (manifest 中无对应 label) | ❌ 缺失 |
| 6.1.4 | —               | —                       | ⏭ 无界面，跳过 |

确认执行？[Y/n]
```

存在 ❌ 缺失项时必须先补充截图和 manifest，不允许带缺口执行。

### Step 2：Manifest 预检（DOCX 导出前自动执行）

用户确认后，正式导出前再次验证：
- 跑源侧机械校验：`python3 .claude/skills/ai-pm/scripts/validate_prd_source_prototype_cells.py <PRD> --quiet`——error（表外图 / 指向语）必须先修；`[待补原型：…]` 与旧 `[xxx原型]` 逐条对 manifest.json 的 label 列表
- 若有 MD 中存在、manifest 中缺失的 label → 停止导出，逐条列出缺失项，提示补充截图后重试
- 若 manifest 中有多余 label（MD 无对应） → ⚠️ 仅提示，不阻断

### Step 3：执行插入与导出

预检通过后：**把截图写进原型示意 cell**——`[待补原型：xxx] 描述` / 旧 `[xxx原型]` 整段替换为 `![xxx原型](相对路径)<br>描述`（相对 PRD md 所在目录），然后调用 `md2docx.py` 导出 DOCX。若存在企业云文档正本，按项目登记云文档 skill 的“先读最新版 → 按 heading 定点替换 → 读回结构校验”流程同步，禁止 `clear_first=True` 整篇覆盖。

**注意**：`![](path)` cell 内图片语法是四态协议默认写法，**本地 DOCX 与云文档渲染器都直接消费**（md2docx 的 fill_cell 图片分支 2026-07-02 已支持）；旧 `[xxx原型]` 占位仅作历史兼容读取、不再往 MD 里新写。

---

## Checkpoint 子步骤定义

原型生成过程按以下子步骤推进，每步开始前更新 `_status.json` 中的 `checkpoints.prototype`：

| 步骤 ID | 步骤名称 | 说明 |
|---------|---------|------|
| `preflight_confirm` | 原型生成前确认 | 用户确认 token 消耗 |
| `prototype_blueprint` | 原型蓝图 + 视觉方向 | prototype-agent 输出页面/交互/视觉约束 |
| `prototype_spec_done` | 关键帧规格完成 | 页面、状态、流程、稳定元素 ID 已登记并通过校验 |
| `lowfi_done` | 低保真画廊完成 | 全部关键帧同屏展示且可评论 |
| `lowfi_waiting_confirmation` | 等待低保真确认 | 不进入精细原型生成 |
| `lowfi_confirmed` | 低保真已确认 | approval hash 与当前 spec 一致 |
| `motion_select` | 动效档位选择 | 用户选择动效强度 |
| `layout_structure` | 页面框架搭建 | 生成 HTML 骨架 + 导航 |
| `page_generation` | 各页面生成 | 逐页生成交互内容 |
| `style_polish` | 样式精修 | CSS 整体调整 |
| `prototype_done` | 原型落盘 | 写入 06-prototype/index.html |
| `review_gallery_done` | 巡检画廊完成 | review/index.html 与标注运行时已生成 |
| `audit_running` | 完整性审计 | Phase 7.5 自动执行 |
| `audit_done` | 审计完成 | 写入 07-audit-report.md |
| `screenshot_plan` | 截图插入计划确认 | 输出计划表，等待用户确认 |
| `screenshot_insert` | 截图插入执行 | 预检通过后调用 md2docx.py 导出 |

### layout_structure 步骤执行规范

**layout_structure 执行时**：
- 若 `{project_dir}/_memory/layout-shell.md` 存在：读取全文，在构建 HTML 骨架时：
  - 用 layout-shell 中的「主布局结构」决定 HTML 的顶层 div 嵌套
  - 用「SCSS 色值变量」替换原型中的 CSS 颜色（`:root { --primary: #05C1AE; ... }` 注入到 `<style>` 顶部）
  - 用「路由页面列表」决定导航菜单项（不捏造不存在的页面）
  - 用「核心 UI 组件模式」作为卡片/表格样式的参考基础
- 若无 layout-shell：按现有逻辑 AI 自行设计

checkpoint 更新规则同 `phase-5-prd.md`，字段为 `checkpoints.prototype`。

## 原型/审计完成后：写入 L2 原型记忆

`07-audit-report.md` 落盘后（`audit_done` 步骤完成），执行：

1. 执行 `mkdir -p {project_dir}/_memory/` 确保目录存在

2. 写入 `{project_dir}/_memory/L2-prototype.md`，内容包括：
   - **设计选择**：
     - UI Shell：`套用了 layout-shell.md（来自 {codebase_path}）` 或 `AI 自行生成`
     - 色值来源：`layout-shell.md 中的 CSS 变量` / `preset 预设色值` / `AI 推断`
     - 主要交互模式：列出原型中使用的主要交互（弹窗/侧边栏/标签页等）
   - **关键页面说明**：列出原型包含的主要页面及其设计意图（来自 PRD 功能模块）
   - **待验证假设**：来自 `07-audit-report.md` 中「未覆盖功能」或「部分覆盖」条目，标记为需后续验证

格式参考 `references/project-memory.md` 的 L2-prototype.md 格式（该文件已存在于技能目录中）。

---

## 输出收尾：patch 根 README「当前阶段」（强制步骤）

原型生成 + 审计落盘 + L2-prototype 全部完成后，**最后**一步是 patch `{项目}/README.md` 的「**当前阶段**」字段（详见 `ai-pm-prototype/SKILL.md` 步骤 5.9 的完整约束）。

**核心约束**：

- 格式：`{场景} 原型已完成（{质量自检总分}/12），{下一步 phase 描述}`
- 只更新「当前阶段」这一行（位于根 README 第 5-6 行附近）
- 不动其他字段（当前版本 / 关键时间点 等由 ai-pm 或 PM 维护）
- 模板见 `templates/project-index/root-readme.template.md`

不 patch 根 README 不算 phase-7-prototype 完成。
