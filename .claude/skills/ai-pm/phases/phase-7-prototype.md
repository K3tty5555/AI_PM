# Phase 7: 原型生成 + 完整性审计

**输入**: `05-prd/05-PRD-v1.0.md`
**输出**: `06-prototype/index.html` + `07-audit-report.md`

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
5. 生成审计报告

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
- 用户选择跳过 → 继续进入 Phase 8 评审

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
