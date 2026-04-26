# Phase 7: 原型生成 + 完整性审计

**输入**: `05-prd/` 下最新版本 PRD MD + `_memory/L2-prd-versions.md`（若存在）
**输出**: `06-prototype/index.html` + `07-audit-report.md`

## 参考文档读取（各阶段前置，自动执行）

在执行本阶段任何操作前，扫描 `{project_dir}/05-prd/` 和 `{project_dir}/07-references/` 下的参考文档并载入上下文：

### 1. PDF 文件（视觉读取，保留截图/流程图/原型）

```bash
ls "{project_dir}/05-prd/"*.pdf "{project_dir}/07-references/"*.pdf 2>/dev/null
```

对每个 PDF，渲染为 PNG 图像（已渲染则跳过）：
```bash
python3 .claude/skills/ai-pm/scripts/pdf_to_images.py "{pdf_path}"
# 输出 IMAGES:<dir>:<count> 表示渲染完成，CACHED:<dir>:<count> 表示已有缓存
```

渲染后使用 Read 工具逐页读取 PNG（每次读 2 页），完整浏览全部页面，提取版本摘要追加到 `_memory/L2-prd-versions.md`（不存在则创建）：
- 版本标识：从文件名提取（如 `V1`、`V2`，无法提取则用文件名前 20 字符）
- 摘要：≤30 字描述功能范围
- 关键变化：与上一版相比新增/删除了什么（首版写"初版"）

### 2. DOCX 文件（文本提取，无图片/流程图信息）

```bash
ls "{project_dir}/05-prd/"*.docx 2>/dev/null
```

对每个 DOCX，检查是否存在同名 `.md`（仅替换扩展名）：
- **不存在** → `python3 .claude/skills/ai-pm/scripts/docx_to_md.py "{docx_path}"`
- **已存在** → 跳过

有新转换 MD 时，读取前 200 行提取摘要，追加到 `_memory/L2-prd-versions.md`（格式同上）。

**优先级**：同一文件同时存在 PDF 和 DOCX，以 PDF 为准（视觉信息更完整）。

若两个目录下均无 PDF/DOCX → 静默跳过，继续正常流程。

**注意**：渲染/转换失败不中断主流程，输出 `SKIP:{文件名}:{原因}` 后继续执行。

## Phase 7: 原型生成

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
执行步骤（共 8 步）：
  1. 原型生成前确认（含 token 消耗提示）
  2. 动效档位选择
  3. 页面框架搭建
  4. 各页面生成
  5. 样式精修
  6. 原型落盘 + 成本记录
  7. 完整性审计（自动）
  8. 审计报告落盘

读取文件：_summaries/prd-summary.md（或 05-prd/05-PRD-v1.0.md）
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

## Phase 7.5: 原型完整性审计（自动触发）

**前提条件**: Phase 5（PRD）和 Phase 7（原型）均已完成，即 `05-prd/05-PRD-v1.0.md` 和 `06-prototype/index.html` 都存在。

**跳过条件**: 
- PRD 未生成（跳阶段场景）→ 跳过审计，提示"无 PRD 可比对"
- 用户明确要求跳过

**执行方式**: 技能侧（LLM）执行，不依赖外部工具。

**步骤**:
1. 读取 `05-prd/05-PRD-v1.0.md`，提取所有功能模块和功能点（解析 ## 级标题和功能列表）
2. 读取 `06-prototype/index.html` 的 HTML 源码
3. 如果存在 `06-prototype/screenshots/manifest.json`，也读取以获取多页面信息
4. 逐个功能点检查是否在原型中有对应的页面/视图/交互元素体现
5. **6 表格截图覆盖检查**：扫描 PRD 中 `## 六` 或 `## 6` 级别下的所有详细设计表格，检查每个表格是否含 `原型示意` 行；若某表格无 `原型示意` 行且未注明"无界面交互"或"纯后端"，记录为审计警告（⚠️）
6. **Agent 原型对话流检查（仅 agent / hybrid 产品）**：读取 `_memory/L1-decisions.md` 中的 `product_type`，若为 agent / hybrid，则原型必须包含以下要素，缺一项记录为审计警告（⚠️）：
   - **对话气泡**：至少 1 处用户输入气泡 + 至少 1 处 AI 回复气泡（用户↔AI 双方）
   - **AI 状态卡片 / 摘要预确认 / 卷面预览类组件**：呈现 AI 决策结果的可视化（不只是纯文本对话）
   - **错误兜底界面**：至少 1 处展示"AI 答错 / 工具失败 / 数据不足"的兜底文案与替代方案
   - **AI 自主决策的修改入口**：默认值附近有用户可改的按钮 / 拖拽 / 自然语言输入框（对应 A4 决策清单的"修改路径"）
7. **同场景组多工具整合检查（仅 agent / hybrid 产品）**：若 PRD 6.1.0 场景分组下定义了多个工具（如题库场景组下的"搜题"+"组卷"），原型应**整合到同一份 HTML 文件**通过 mode 切换（DOM 内 cap-card active + welcome 内容刷新），**不应**做成多份独立 HTML 用 `window.open` 跳转。
   - **理由**：研发评审会把"页面跳转"误读为产品要做"页面重建"，但本质是同一对话栏内的工具切换；多份 HTML 还会导致 panel-open 状态丢失、对话上下文消失等次生问题
   - **实施约定**：用 `currentMode` 状态变量 + `switchMode(mode)` 函数；切换时清空当前对话（同组切换工具相当于"新对话"，符合 6.1.0 对话上下文规则）
   - **审计判定**：若发现 `06-prototype-{xxx}/` 多目录且 onclick 含 `window.open`，记为 ⚠️ 警告，建议合并
8. 生成审计报告

**输出格式** — 保存到 `07-audit-report.md`：

```markdown
## 原型完整性审计

审计时间: {日期}
PRD 版本: v1.0

| PRD 功能点 | 原型状态 | 说明 |
|-----------|---------|------|
| {功能名} | ✅ 已覆盖 | 对应 {页面/视图名} |
| {功能名} | ❌ 未覆盖 | 原型中无对应页面或按钮 |
| {功能名} | ⚠️ 部分覆盖 | {具体说明} |

**覆盖率**: {已覆盖数}/{总数}（{百分比}%）

**未覆盖功能清单**:
1. {功能名} — 建议补充 {页面/视图描述}
2. ...

**建议**: {根据覆盖率给出建议}
```

**审计比对原则**:
- 只比对页面/视图级别，不要求交互细节完全对齐
- 纯静态展示的原型也能审计
- "部分覆盖"指有入口但缺少完整流程
- 对功能点的命名做语义匹配，不要求字面完全一致

**审计完成后**:
- 向用户展示审计结果
- 如果覆盖率 < 100%，提示可选操作："是否要补充未覆盖的功能到原型中？"
- 用户选择补充 → 将未覆盖功能点追加到现有原型中（在对应导航区新增视图节点，不重建已有页面），从 `layout_structure` 步骤继续
- 用户选择跳过 → 进入 Phase 7.6（截图插入 PRD）
- 若 `06-prototype/screenshots/manifest.json` 存在 → 自动提示进入 Phase 7.6；否则提示用户先截图，或跳过直接进入 Phase 8

## Phase 7.6: 截图插入 PRD 6 表格

**触发时机**：Phase 7.5 审计完成后，若 `06-prototype/screenshots/manifest.json` 存在则自动提示；或用户说"把截图插入 PRD / DOCX"时手动触发。

### Step 1：扫描 6 所有表格，输出插入计划（执行前必须等待用户确认）

读取 PRD MD，扫描 `6` 级别下所有详细设计表格：
- 已有 `原型示意` 行 → 读取其 `[xxx原型]` 占位符，对应 manifest.json 中的 label
- 无 `原型示意` 行 → 标记为"未覆盖"，必须在此步骤确认是无 UI（跳过）还是遗漏（补充）

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
- 扫描 PRD MD 中所有 `[xxx原型]` 标签（正则 `\[([^\]]+)原型\]`）
- 对比 manifest.json 的 label 列表
- 若有 MD 中存在、manifest 中缺失的标签 → 停止导出，逐条列出缺失项，提示补充截图后重试
- 若 manifest 中有多余 label（MD 无占位符） → ⚠️ 仅提示，不阻断

### Step 3：执行导出

预检通过后，调用 `md2docx.py` 执行 DOCX 导出，脚本会自动将 `[xxx原型]` 占位符替换为对应截图。

**注意**：不在 MD 文件中直接嵌入图片链接，保持 `[xxx原型]` 占位符语法，确保 md2docx.py 能正确匹配。

---

## Checkpoint 子步骤定义

原型生成过程按以下子步骤推进，每步开始前更新 `_status.json` 中的 `checkpoints.prototype`：

| 步骤 ID | 步骤名称 | 说明 |
|---------|---------|------|
| `preflight_confirm` | 原型生成前确认 | 用户确认 token 消耗 |
| `motion_select` | 动效档位选择 | 用户选择动效强度 |
| `layout_structure` | 页面框架搭建 | 生成 HTML 骨架 + 导航 |
| `page_generation` | 各页面生成 | 逐页生成交互内容 |
| `style_polish` | 样式精修 | CSS 整体调整 |
| `prototype_done` | 原型落盘 | 写入 06-prototype/index.html |
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
