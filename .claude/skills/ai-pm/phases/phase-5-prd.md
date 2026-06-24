# Phase 5: PRD 生成

**输入**: `01-requirement-draft.md` + `02-analysis-report.md` + `03-competitor-report/V{版本}.md` + `04-user-stories.md` + `_memory/L2-prd-versions.md`（若存在）
**输出**: `05-prd/<当前 PRD 文件>`（首次新建默认 `05-PRD-v1.0.md`，**建议改描述名** `[YYYYM][域]<标题>-V1.0.md` 经 PM 确认；域候选从历史 PRD 文件名抽高频域、PM 可改/自填；落盘后写 `_status.json.active_prd`=该文件名）

> 🔑 **「当前 PRD 文件」约定（Phase 0 去承重）**：本文档下方出现的 `05-prd/05-PRD-v1.0.md` / `05-PRD-v1.0.md` **一律指「当前 PRD 文件」这个变量**，由 `scripts/resolve_current_prd.py`（`_status.json.active_prd` 权威 → 唯一顶层 md → prd_versions.ts 最新）解析，**不是写死的名字**。迭代项目读/写的都是当前 PRD；README 当前活跃表只人读、机读只认 active_prd。

## ⚠️ PM 风格判断卡（强制前置，所有 PRD 生成前必读）

**写一行字之前，必读** `.claude/skills/ai-pm/references/pm-judgment-card.md`。

判断卡是 PM Agent 的内核，决定每段内容写不写、怎么写、谁来补。**模板（feishu-template / agent-supplement）只是脚手架**——按判断卡决策灵活组织，**不照本宣科**。

核心判断（详见判断卡）：
- **角色**：你是 PM，不是架构师/算法 PM/设计师 → 用业务语言写产品决策
- **6 条直觉**：复用 / 详略 / 责任 / 影响 / 风险 / 评审
- **越界红线**：技术栈 / 接口字段 / 视觉毫秒 / 算法实现 / 给用户透版本号
- **责任分工**：技术细节 → 附录"待 X 对齐"；视觉 → 设计；算法 → "由算法侧定义"
- **篇幅警戒线**：500+ 行 → 大概率膨胀，瘦身或拆附录

每章节写完都要回过头问自己：**这是 PM 该决策的吗？**

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

`05-prd/` 下的历史 PRD PDF **同时抽文本版**（给扎根注入的术语/骨架 grep 用，渲染图不可 grep）：
```bash
python3 .claude/skills/ai-pm/scripts/pdf_to_md.py "{pdf_path}"
# CONVERTED:<ai-md/同名.md>；SKIP:<文件>:<原因>（已有原生 md / 单件失败，exit 0 不中断批量）
# ERROR 仅参数 / 环境依赖错误（如缺 pypdf：pip install pypdf 后重跑）——缺依赖明着阻断，
# 不做静默 SKIP（否则"没建语料"会伪装成"没有 PDF"）
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

**注意**：单件渲染/转换失败不中断主流程（输出 `SKIP:{文件名}:{原因}` 后继续）；参数 / 环境依赖错误（如缺 pypdf）属阻断，`ERROR` + exit 1，装好依赖再继续。

## 迭代项目基线 delta 强制检查（门禁）

**核心原则**：迭代项目的需求 = delta，不是新功能。没有 delta 工作表就写 PRD，会漏掉「老系统能做但新流程缺」这类系统性的坑。

### 检查逻辑

```bash
# 1. 判断是否为迭代项目（任一满足）
test -d {project_dir}/07-references && [ "$(ls -A {project_dir}/07-references 2>/dev/null)" ]
grep -E "V[0-9]|迭代|历史版本|老版本|上一版|V[0-9]\.[0-9]" {project_dir}/_memory/L1-decisions.md 2>/dev/null

# 2. 若为迭代项目，检查 01-baseline-delta.md
test -f {project_dir}/01-baseline-delta.md
```

### 阻断规则

| 情况 | 动作 |
|------|------|
| 0→1 项目 | 跳过本检查，进入下一步 |
| 迭代项目 + 无 `01-baseline-delta.md` | **阻断**，回退到 Phase 1 补：「检测到迭代型项目（07-references 非空），但缺少基线 delta 工作表。请先运行 `/ai-pm continue` 回到 Phase 1 补出 `01-baseline-delta.md`，方法论见 `references/baseline-delta-worksheet.md`。」 |
| 迭代项目 + 有 `01-baseline-delta.md` 但有未填写行 | **阻断**，列出未填写的行号让用户补全 |
| 迭代项目 + delta 工作表完整 | 通过，进入下一步；**写 PRD 过程中持续对照 mitigation 列**，确保每条 delta 都有 PRD 章节承接 |

### 与 PRD 写作的衔接

写功能章节时，对每条 delta 工作表中标注「PRD 干预」的行：
- 写完对应章节后，回查工作表，标记「已落实」
- 全部落实后才能进入 `prd_done` 子步骤

## 知识库推荐触发（Plan Mode 前执行）

在展示 Plan Mode 前，先检查是否有相关知识可推荐：

1. 从 `01-requirement-draft.md` 提取业务关键词（3–6 个）
2. 调用 `ai-pm-knowledge suggest {关键词}` 搜索相关踩坑/模式
3. **有匹配结果** → 展示推荐，等待用户「查看详情」或「跳过」
4. **无匹配结果** → 静默跳过，直接进入需求模糊点对齐

## 需求模糊点主动对齐（Plan Mode 前，必须执行）

在展示 Plan Mode 之前，扫描所有已读入的输入文档与记忆，**主动识别**以下 5 类模糊点：

| 类型 | 识别方式 |
|------|------|
| 功能边界不清 | 两个功能描述重叠，无明确区分标准 |
| 决策与文档矛盾 | L1-decisions 里的决策与需求文档内容不一致（如"砍掉 X"但文档仍写了 X）|
| 范围截断/缺失 | 路标/规划文档内容被截断，关键参数未出现 |
| 技术实现方式未确认 | PRD 写了某实现方案，但存在多种可能或决策未落地 |
| 外部依赖 Gate | 功能是否做取决于法务/商务/技术前置条件，当前状态未知 |

识别后：

- **有模糊点（≤5 条）** → 汇总为一次对齐清单展示给用户，按重要性排序，每条写清楚"我的猜测是 A，如果不对请纠正"，等待用户回复后再进入 Plan Mode。
- **模糊点 >5 条** → 只取最影响 PRD 主干的前 5 条，其余降级为假设写入 PRD 待后续确认。
- **无模糊点** → 静默跳过，直接进入 Plan Mode。

> **目标**：不要在写了一半 PRD 后才发现方向错了。有不清楚的，写之前就对齐。

## Plan Mode 前置展示（执行前必须展示）

用户触发 PRD 生成后，**先展示执行计划**并等待确认：

```
即将开始：PRD 生成
─────────────────────────────
执行步骤（共 9 步）：
  1. PRD 生成前确认
  2. 写作风格选择
  3. 产品概述
  4. 用户角色
  5. 功能规格   ← 最耗时，约占 50%
  6. 数据结构
  7. 交互流程
  8. 非功能需求
  9. 落盘 + 摘要 + 成本记录

读取文件：01-requirement-draft.md, 02-analysis-report.md,
         03-competitor-report/V{版本}.md, 04-user-stories.md
写入文件：05-prd/<当前 PRD 文件>（首次默认 05-PRD-v1.0.md、建议描述名；落盘后写 active_prd）（及摘要，若 ≥20KB）

继续？[Y/n]
```

- 用户回复 Y / 回车 / 「继续」 → 执行 Checkpoint 子步骤（从 preflight_confirm 开始）
- 用户回复 n / 「取消」 → 返回主菜单，不写入任何文件

## Checkpoint 子步骤定义

> **注**：传统产品共 10 步；agent / hybrid 产品共 11 步（多 `agent_design`）。验收标准已整合至「功能规格」步骤内，不单独列为子步骤。

PRD 生成过程按以下子步骤推进，每步开始前更新 `_status.json` 中的 `checkpoints.prd`：

| 步骤 ID | 步骤名称 | 说明 | 适用产品类型 |
|---------|---------|------|------------|
| `preflight_confirm` | PRD 生成前确认 | 用户确认内容无误 + 确认 product_type | 全部 |
| `style_select` | 写作风格选择 | 用户选择风格 | 全部 |
| `product_overview` | 产品概述 | 写产品背景/定位/目标（hybrid/agent 含 2.3 Agent 边界声明）| 全部 |
| `user_roles` | 用户角色 | 写用户画像/角色定义 | 全部 |
| `functional_spec` | 功能规格 | 写详细功能设计（最耗时）；先读 04-user-stories.md 三件套作骨架；**优先调用 pm-agent 写每个 6.x 子节** | 全部 |
| `data_schema` | 数据结构 | 写核心数据字段/流转 | 全部 |
| `ui_flows` | 交互流程 | 写页面流程/状态机（hybrid 含 5.6 AI 入口与权限边界）| 全部 |
| `non_functional` | 非功能需求 | 写性能/安全/兼容性 | 全部 |
| `agent_design` | Agent 专项设计 | 写第九章（A1–A8 完整 / 最小集 A2/A4/A5/A7）；**优先调用 pm-agent 写每个 9.x 子节** | **仅 agent / hybrid** |
| `prd_done` | PRD 完成 | 文件落盘，写摘要，写成本记录 | 全部 |
| `memory_write` | 决策记忆写入 | 写入 L1-decisions.md（3–5 条关键取舍）| 全部 |

**checkpoint 更新时机**：

每步开始前：
```
checkpoints.prd.step = "{当前步骤 ID}"
checkpoints.prd.pending_step = "{当前步骤 ID}"
checkpoints.prd.last_updated = "{ISO8601}"
```

步骤完成后：
```
checkpoints.prd.completed_steps.append("{当前步骤 ID}")
checkpoints.prd.pending_step = "{下一步骤 ID}"
```

**恢复逻辑**（`/ai-pm continue` 时）：
- 读 `checkpoints.prd.pending_step`
- 跳过 `completed_steps` 中的步骤，从 `pending_step` 继续

## PRD 生成前确认节点

**步骤 A：内容确认**

汇总展示前 4 阶段核心结论：
- 目标用户 / 核心痛点 / 主要功能范围 / 成功指标

询问："以上内容有需要调整的吗？没问题回复「没问题」或「生成」，有调整直接说。"

等用户确认内容无误后，执行步骤 A.1。

**步骤 A.0：PRD 用途类型（决策评审型 vs 完整功能 PRD）**

先判断这份 PRD 的用途，再决定走哪套模板：

- **决策评审型**——目标是拿方向 / go-no-go / 在几个方案间拍板（触发词：用户说"决策评审""定方向""先把方案定下来""go/no-go""几个方案选哪个"，或关键节点依赖未定需先决策）。
  → 用 `templates/prd-styles/default/decision-review-template.md` 的 4 节骨架（一·为什么要做 / 二·打算怎么做 / 三·需要决策的内容 / 四·主要风险）。
  → **不走下方 feishu-template 功能拼装**，不写详细功能设计（§六那种）。
  → 四条范式铁律必守：①§一数据/原话驱动 ②"需要决策的内容"是主体（决策点展开成"选项×多维对比×推荐+理由"）③多维度决策点用多列横向对比 ④版本目标分"技术可达（本期验收·可量化）+ 激活目标（运营·上线 N 个月）"两档。
  → **八条必答项逐条对模板填（唯一事实源在模板头部注释，此处只留名目）**：路线必含维持现状 / "为什么做"三件套（用户感受列+量化三层+具体落点）/ 黑箱概念白话示例 / 影响边界 / "图啥"预答 / 当场要拍的最小集合 / 编号防混 / §二绑定推荐路线（禁共性框架）。
  → 方向拍板后，再按完整功能 PRD 流程（步骤 A.1 起）补 §六详细设计。
  → 仍守 PM 边界（pm-judgment-card 越界红线照旧适用；正文用词过判断卡 §9.0ter 技术行话对照表，引用原话一字不改）。

- **完整功能 PRD**——目标是定细节、可研发落地 → 继续步骤 A.1，走 product_type 模板拼装。

> ⚠️ **迭代 / 小补丁也走完整模板，没有 bullet 版路径**：全员评审 PRD（不论 0→1 还是迭代）必有承重骨架 §一 文档概述(修订日志表) / §二 需求分析 / §三 功能清单表 / §六 详细功能设计(每功能一表)；lean 靠"每格 terse + 跳 §四 产品流程/§五 全局说明 + 省可选子节"实现，**不是靠丢骨架塌成 bullet**（详见判断卡 §6 二分）。决策评审型例外，走 4 节模板、不强加 §六。

**步骤 A.0.1：doctype 落机读字段（三源权威 + 冲突规则）⭐ doctype 契约单一事实源**

A.0 判完 doctype（`decision_review` / `full`）后**立即写三处**（比照 A.1 product_type 落字段方式）：

1. `_status.json` 的 `checkpoints.prd.doctype`：**独立稳定枚举键**（`decision_review` / `full`），与可能是长文本的 `pending_step` 并列、互不覆盖 —— **流程 / 恢复权威**（phase-5 resume 认它）。
2. `_memory/L1-decisions.md` 顶部 `doctype:` 行 —— **upsert·非 append**：最多一行，已存在则替换；读回若发现多行 → 报 warning 并以**首行**为准。**人读 / 跨阶段记忆**。
3. PRD 文件正文最顶（H1 之上）标记 `<!-- doctype: full -->` / `<!-- doctype: decision_review -->` —— **单文件 lint 权威**（driver 扫单文件直接 grep 它、不依赖项目上下文）。

**三源冲突 / 缺失规则**：文件头 = 单文件 lint 权威 / `_status` = 流程权威 / L1 = 人读。
- **文件头与 `_status` 冲突** → driver 报 `DOCTYPE_WARNING: conflict`（不静默、不擅改）；phase-5 以 `_status` 为准重写文件头标记。
- **文件头缺失但 `_status` 可判定**（历史稿常态）→ driver 报 `DOCTYPE_WARNING: missing_header`、提示补回文件头（已以 `_status` 判定，别让单文件 lint 权威静默缺失）。

**本块是 doctype 契约单一事实源**，driver（pm-agent Mode C）/ ai-pm-prd / agent-team 引用此处、不复制逻辑。

**步骤 A.1：产品类型确认（决定模板拼装）**

读取 `_memory/L1-decisions.md` 中的 `product_type` 字段：

```bash
grep -E "^product_type:" {project_dir}/_memory/L1-decisions.md 2>/dev/null
```

- **已有值**（traditional / agent / hybrid）→ 展示给用户："本项目识别为 **{product_type}** 产品。继续？[Y/n]" → Y/回车确认；n 进入手动选择
- **无值**（旧项目 / 未识别）→ 进入手动选择：

```
本项目的产品类型？这决定了 PRD 模板的章节结构。

  1. 传统产品 — 用户主动操作走流程（CRUD、后台、运营工具）
  2. Agent 产品 — 用户表达意图，AI 替他决策执行（独立 Copilot、智能体）
  3. 混合产品 — 传统功能 + AI 助手嵌入（带 AI 入口的现有业务系统）

请选择 [1/2/3]：
```

用户选择后：
- 写入 `_memory/L1-decisions.md`：在文件顶部添加 `product_type: {traditional|agent|hybrid}`
- 写入 `_status.json` 的 `checkpoints.prd.product_type` 字段（供恢复使用）
- 展示选择结果：例如 "已记录为 hybrid 产品，本次 PRD 将注入 Agent 增量包（A2/A4/A5/A7/A9 必填，A3/A10 推荐）"

**步骤 B：写作风格选择**

单独询问写作风格：
- 标准风格（default）
- 自定义风格（若已配置 persona，列出可用风格名）

用户选择后执行 PRD 写入。

## 模板拼装逻辑（步骤 B 之后，执行写入前）

根据 `product_type` 决定章节注入：

### 传统产品（traditional）

- 直接使用 `templates/prd-styles/default/feishu-template.md`
- 跳过所有 `<!-- agent-supplement: AX -->` 标记位置（什么都不注入）
- **不执行** `agent_design` 子步骤
- 检查点列表 = 10 步

### Agent 产品（agent）

- 使用 `feishu-template.md` 作为骨架
- 注入位置：
  - 2.3 后注入 A10「Agent 边界声明」（推荐写）
  - 5.6 **跳过**（独立 agent 产品无嵌入式入口问题）
  - 文末追加完整第九章 A1–A8（必填）
- **执行** `agent_design` 子步骤，写完整 8 节
- 检查点列表 = 11 步

### 混合产品（hybrid）

- 使用 `feishu-template.md` 作为骨架
- 注入位置：
  - 2.3 后注入 A10「Agent 边界声明」（推荐写）
  - 5.5 后注入 5.6「AI 入口与权限边界」（必填）⭐
  - 文末追加最小集第九章 A2/A4/A5/A7（必填）+ A3 推荐
- **执行** `agent_design` 子步骤，写最小集
- 检查点列表 = 11 步

### 注入实现规范

写 PRD 时按以下顺序处理 `feishu-template.md` 中的注释标记：

```
1. 扫描模板里的 <!-- agent-supplement: AX --> 标记
2. 对每个标记，检查当前 product_type 是否需要注入
3. 需要 → 读 templates/prd-styles/default/agent-supplement.md 中对应 AX 的内容，替换标记
4. 不需要 → 删除标记（连同注释一起），不留空行
```

**写完后验证**：grep PRD 文件，不应该残留任何 `<!-- agent-supplement` 字样。

```bash
PRD="{project_dir}/05-prd/$(python3 .claude/skills/ai-pm/scripts/resolve_current_prd.py file {project_dir})"   # 走 resolver 拿当前 PRD（命令块都这么起头）
grep -n "agent-supplement" "$PRD" && echo "❌ 残留挂接位标记" || echo "✅ 标记清理干净"
```

**源注清理（落盘前最后一道，兜写时反射的网）**：pm-agent 写作时的就地引源（「现网X（源：Y『原句』）」）要求定稿前删——落盘前机械扫一遍残留：

```bash
PRD="{project_dir}/05-prd/$(python3 .claude/skills/ai-pm/scripts/resolve_current_prd.py file {project_dir})"
grep -nE "源：|『|』|待对齐|本需求新词" "$PRD"
```

命中**逐条判断、不自动删**：①内部源注 → 删（信息已核完，过程痕迹不进定稿）②确属正文引用原文的 → 保留 ③「待对齐」「本需求新词」标记只允许出现在待对齐章节/附录 B，散落在功能正文里的挪过去。

### 双层组织（默认视角，按规模分级，不是默认加长）

PRD 读者 = 评审的人 + 要据此构建的 AI/研发，默认按「一份文档两层」组织：**评审主体**（人·决策·紧）+ **AI 对齐附录**（机·构建·够用即止）。按档分级，**小的别硬撑出附录壳**：

| 档 | AI 对齐附录力度 |
|---|---|
| 复杂 Agent / 多模板（300+ 行档）| 完整附录：执行契约 / 边界异常 / 数据来源边界 / 全量验收（判断卡 §7 闸 4 同构）|
| 中等功能（200-300 行档）| 只补关键边界 + 验收，挂正文末 |
| 单功能补丁（80-150 行档）| 压成几条行内：「构建差异 / 异常边界 / 待对齐」|
| 决策评审稿 | **不强制双层**，沿用专属 4 节模板（decision-review-template）|

> ⚠️ **双层 ≠ 砍骨架**：双层是把实现细则搬附录、正文留决策层（搬不删），**不是砍 §一/二/三/六 承重骨架**。再小的迭代也保留骨架，靠每格 terse + 跳 §四/§五 瘦身（详见判断卡 §6 二分）。

AI 对齐层写到「开发 + AI 据此能正确建」**即止**——够用、不穷举为美；**运营指标 / 协同细节点到为止 + 标「待 PM / 业务评审拍板」**（点名存在、交人决策；不省略、也不假装穷尽）。

---

## 🌱 扎根注入（起草前强制，确定性抽取 → 注入）

**原则：项目有约定的地方别发明**（单位 = 词 / 章节名 / 结构约定）。前作 PRD 是**查约定的地方**，不是浇整篇的模子（别过度克隆，补丁仍是补丁）；真正新的内容仍自由。

1. **查约定包**：`ls {project_dir}/05-prd/ai-md/_conventions.md`
   - **存在** → 读取，把「章节骨架」「术语与动作名（含黑名单）」两节内容注入 pm-agent 写作 prompt 的「项目约定」块（模板见下节）。⚠️ 草稿级条目（未评审版本来源）注入时保留 ⚠️ 标记，不当硬约定。
   - **不存在，但 `05-prd/` 有历史 PRD（pdf/md ≥1 份）** → 先建约定包，三段式：
     ```bash
     # ① 抽文本（逐个 PDF；SKIP 不中断）
     python3 .claude/skills/ai-pm/scripts/pdf_to_md.py "{pdf_path}"
     # ② 机械抽取草稿（文件清单 + 定稿信号证据 + 骨架 + 加粗词/「」动作名频次 + 待人工核 stub）
     python3 .claude/skills/ai-pm/scripts/build_conventions.py "{project_dir}/05-prd"
     # 输出 BUILT:<ai-md/_conventions-draft.md>
     ```
     ③ 模型把草稿按 `references/conventions-template.md` 整理成 `_conventions.md`：做**定稿分级判断**（信号按序：README 版本表状态列 > 修订日志「评审通过」行 > PDF 分发推定；**拿不准一律降草稿级**）、挑权威词表/黑名单、填结构约定；「待人工核」区留给用户。脚本出事实、模型做判断、人挑残差。
   - **0→1 项目（无历史）** → 静默跳过，不注入。
2. **forced-artifact（验收对象）**：每次起草前落 `{project_dir}/05-prd/_logs/grounding-input.md`：

   | 项 | 内容 |
   |---|---|
   | 本次沿用章节 | 来自 `_conventions.md` 的章节名 |
   | 本次沿用术语 | 术语 + 证据来源 |
   | 本次新增术语/章节 | 新词 + 为什么必须新增 |
   | 待 PM 对齐 | 历史冲突 / 抽取不可靠 / 新机制不确定 |

   这张表是验收对象（fresh t=0 验证查它），**不塞进 PRD 正文当脚注**。pm-agent 输出末尾的「新增术语」声明由主对话写回此表。

---

## 🤖 优先调用 pm-agent（推荐路径）

**写每个章节前**，主对话应**优先调用 `pm-agent` sub-agent** 写关键章节（特别是 functional_spec 和 agent_design）。pm-agent 内化了 KettyWu 灵魂 + 越界红线 + 填空模板 + 自检，输出比主对话直接写更"PM"。

> **🔒 调用前置闸（不可跳过 · 含迭代 / 轻量 / ad-hoc 单章节）**：调 pm-agent 起草或重写任何 PRD 章节前，先确认本次 `{project_dir}/05-prd/_logs/grounding-input.md` 已**为本次起草刷新**（「本次沿用章节」取自 `_conventions §2`；**旧版本日期的 artifact 不算数**，要为本次刷新）。未刷新 = 没扎根 → 先回上面「🌱 扎根注入」跑完再调。
> **orchestrator 绝不自拟章节结构塞进 prompt** —— 章节骨架是项目约定（`_conventions §2`），从那里取、填进下方「项目约定」块，不是主对话随手指定的；**轻量迭代只调每章内容厚薄（可塌成一句 / 可选章可省），骨架照旧、不另起**。（本次 V3.5 翻车实证：跳过本闸 + 手拟结构 = 偏离约定骨架被打回重写。）

调用模式：

```
Agent({
  description: "PM 写 X 章节",
  subagent_type: "pm-agent",
  prompt: "..."
})
```

**Prompt 模板**（写新章节）：

```
任务：以 KettyWu 视角写 PRD 的「§6.x {功能名}」章节。

输入文件：
- 项目目录：{project_dir}
- 需求草稿：01-requirement-draft.md
- 用户故事：04-user-stories.md
- L1 决策：_memory/L1-decisions.md（含 product_type）
- 当前 PRD 草稿：05-prd/05-PRD-v1.0.md（如已写到此章节）

项目约定（扎根不发明，来自 05-prd/ai-md/_conventions.md；无约定包时删除本块）：
- 章节骨架：{粘贴约定包「章节骨架」节}
- 权威词表 + 生造词黑名单：{粘贴约定包「术语与动作名」节核心行，⚠️ 草稿级词保留标记}
- 规则：章节名/术语照约定用；确需发明新词/新章节，在输出末尾显式声明「新增术语：{词} — 为什么必须新增」

要写的章节：§6.{编号} {功能名}

要求：
- 按 phase-5-prd.md 的「写作脚手架」两栏表格模板填
- 跑完 自检再返回
- 不写 prologue / 不写解释，直接给章节内容（markdown 表格）

特殊要求：{ 如 "复用 V1.1 §6.x，本期唯一差异是 Y" 等}
```

**Prompt 模板**（审视已有章节）：

```
任务：以 KettyWu 视角审视 PRD 的「§X.Y {章节名}」章节并重写。

输入：{现有章节内容}

要求：
1. 按 自检过一遍，列出哪些项不通过
2. 重写为 PM 风格（按填空模板，去越界、加影响范围、补复用对照）
3. 输出格式：先列「问题清单」（≤5 条），再给「重写结果」
```

**调用时机**：
- ✅ 写 functional_spec 各 6.x 子节（核心场景）
- ✅ 写 agent_design 各 9.x 子节（Agent 章节）
- ✅ 用户提"以 PM 视角重写这段"
- ⚠️ 简单章节（产品概述、用户角色、性能需求）主对话直接写也可以，无需 pm-agent

**回退**：如果 pm-agent 不可用（sub-agent 调用失败），主对话用下面的「写作脚手架」+「反例库」自己写，效果次优但能 work。

---

## ⚠️ 写作脚手架（pm-agent 不可用时主对话使用）

> 写「六、详细功能设计」每个 5.x / 6.x 子节时，**按下面的填空模板写**。不允许自由发挥成"长段叙述"——这是 PM 越界最严重的位置。

### 标准两栏表格模板（每个功能必有）

```markdown
### 6.x {功能名}

| 项目 | 说明 |
|------|------|
| **用户场景** | {一句话，谁在什么页面遇到什么问题。**不写 UI 细节**} |
| **功能描述** | {一句话，这个功能解决什么。**不写技术实现**} |
| **原型示意** | [{原型 label}] {布局简述，10-20 字} |
| **优先级** | P0 / P1 / P2 |
| **输入/前置条件** | {权限、数据、上游状态} |
| **需求描述（基本事件流+异常事件流）** | 改动点：<br>① {规则一}<br>② {规则二}<br>③ {规则三}<br>...（**编号分组，单条 ≤ 50 字，全节 ≤ 7 条**）<br>异常并入：{失败时怎么办，每条 1 行}<br>⚠️ **异常描述必须落到页面状态**：每条降级描述须回答「用户在哪个页面 + 看到了什么变化」，禁用「退回 XX 流程」等抽象路由语言 |
| **输出/后置条件** | {落到哪里、谁能看到、留多少天} |
| **影响范围** | **必填**：受影响的页面/接口/角色/已存量场景<br>例："考试制卡列表 + 设置模板→选择校内答题卡列表 + 下载 PDF 文件名" |
| **用户权限** | {单校：X、Y / 联考：X、Y、Z}（沿用项目固定写法）|
| **补充说明** | {复用规约、特殊约束、验收标准}<br>**验收标准格式按复杂度选**：多条件分支 → Mermaid 决策树/状态机；简单后置断言 → 一句中文；需要 QA 执行的测试清单 → 两列表格（操作/预期结果）；**禁用 Given/When/Then 作为默认格式**<br>**复用规约**：与 V1 X 唯一差异是 Y |

```

### 填空硬约束（不可妥协）

- **改动点用 ① ② ③ 编号**：不写流水账。每条 ≤ 50 字，全节 ≤ 7 条；超 7 条 → 拆功能或移附录
- **影响范围必填**：写不出受影响范围 = 这个功能没想清楚 → 不进 PRD
- **异常事件流并入需求描述**：不单独立 AC 表，简短场景化即可；每条降级描述必须落到「用户在哪个页面 + 看到什么变化」，不能只写系统行为（PITFALL-030）
- **验收标准选格式**：多分支条件 → Mermaid；简单断言 → 中文一句话；禁用 Given/When/Then 作为默认（PITFALL-031）
- **复用对照**：默认**不写**复用对照表，用行内「同 V1 / 复用一期逻辑 / 同步影响：…」表达即可（制卡 V1.5–V1.8 实测都没有）。**仅"功能迁移 / 老系统接新引擎"类**才画 §4.x 复用对照表（4 列：复用对象 / 复用方式 / 本期改动点 / 不改动项，如批改 V3 旧版答题卡接新版AI批改）；普通迭代（修 bug / 调参 / 加开关）画了全是废话（PITFALL-045）
- **信息密度自检（每节写完过一遍，PATTERN-013）**：① 有更高密度格式？② 约束重复了几处，能收敛？③ 读者已知？④ 加了clarification是因为原句没写清楚？⑤「为什么」混进了「做什么」？⑥ 举例背后有统一规则，可以改写规则？

---

## ⚠️ 反例对比库（写每段前对照看一遍）

### 反例 1：视觉细节越界（V1.1 真实越界）

❌ **越界**（设计师/前端的事）：
> chip hover 轻微浮起 + 阴影加深；点击时 chip 左侧出现 3px 绿色强调条 + 短暂 fade-out 后切到对话区呈现用户消息；第 4 条「我自己说」点击后输入框外光环柔光闪烁 400ms 提示聚焦

**为什么不好**：PM 在写 CSS。设计师看到不知道哪些是硬约束、哪些可改。

✅ **正确**（业务行为，留设计空间）：
> chip 点击 → 直接以 chip 描述作为用户消息发送，触发 AI 端检索；第 4 条「我自己说」点击 → 聚焦底部输入框；具体视觉反馈（hover 态、点击态、过渡效果）由设计/前端实现

---

### 反例 2：响应式像素硬编码

❌ **越界**：
> ≥1440px：360px；1280-1439px：320px；1024-1279px：300px（折叠为图标）

**为什么不好**：像素断点和宽度是设计 token，PM 不该决策。

✅ **正确**：
> 响应式自适应，宽屏展开为完整面板，窄屏折叠为图标（具体断点和宽度由设计/前端定）

---

### 反例 3：技术栈选型越界

❌ **越界**：
> | 状态管理 | LangGraph checkpointer + 独立 Message History |
> | LLM Fallback链 | 模型A → 模型B → 模型C |
> | 对话框架 | AGENT_CHAT_UI 组件库 |

**为什么不好**：PM 不决定模型、状态管理库、组件库。

✅ **正确**（要么删，要么明示由谁决策）：
> 算法栈（LLM Fallback、状态管理、对话框架库）由 Agent 团队自决，不进 PRD

---

### 反例 4：接口字段名/枚举值越界

❌ **越界**：
> 搜题工具 edu-topic-query（输入需含 lib_scope 题库范围列表：[platform, district, school, personal]）

**为什么不好**：字段名 `lib_scope`、枚举值 `[platform, district, school, personal]` 是研发与对接团队对齐后定的。

✅ **正确**（业务能力描述）：
> 题目检索：按知识点+难度+题型筛题。输入语义含「4 类题库范围（平台库/区本/校本/个人）」，由研发与题库团队对齐字段后落到接口文档，本 PRD 不预设。

---

### 反例 5：给用户透露版本号 / 上线时间

❌ **越界**：
> AI 回应：「这个功能 V1.5 上线，你现在是要找几道单题练手吗？」

**为什么不好**：版本承诺 = SLA，给用户透了就是欠条。版本会延期会调整，承诺出去给自己挖坑。

✅ **正确**：
> AI 回应：「这个功能我暂时还做不了，你现在是要找几道单题练手吗？」

---

### 反例 6：AI 行为契约只列规则不带理由

❌ **越界**（缺 PM 决策）：
> 称呼用户：「您」/「老师」

**为什么不好**：评审会问"为什么是'您'不是'你'"，PM 答不上 = 没决策只是搬运。

✅ **正确**：
> 称呼老师用「你」不用「您」（B 端老师反馈"您"显疏离）

---

### 反例 7：Few-shot 硬凑

❌ **越界**（PM 自己写 prompt 文案）：
> Good Output: "好的，我来帮你分析二班最近的薄弱知识点..."

**为什么不好**：PM 不写具体 prompt 文案。

✅ **正确**（写判断标准）：
> Good Output:
>   听懂了：二班培优组（5 人）· 强化模式 · 分层按现有标签 ·
>   范围：导数大题 · 题量 12 道（每层 4 道）
>   对吗？没问题我就给你出预览。   [对，开始]
>   ↑ **为什么好**：4 行人话 + 默认值齐全 + 一键确认按钮
>
> Bad Output:
>   好的，我将根据您的需求进行分层练习的布置...
>   ↑ **为什么不好**：寒暄 + 没复述参数 + 没确认按钮
>
> [示例 2/3 算法补完]：写不出别硬凑

---

## 自检三连问（写完每个章节立即过）

1. **如果设计师拿到这份 PRD，他还能不能作为设计师做出独立判断？**（设计师只能照抄 → PM 越权）
2. **如果研发拿到这份 PRD，他知道哪些是硬约束、哪些可以自决吗？**（接口字段写死 → 越权）
3. **5 分钟内能不能让评审人抓到这版的核心改动点？**（流水账描述 → 拆改动点编号）

任何一问答不上 → 回去改。

---

## agent_design 子步骤详细执行（仅 agent / hybrid 产品）

`non_functional` 完成后、`prd_done` 之前执行此步。

**输入**：
- `_memory/L1-decisions.md` 中的 `product_type`
- `templates/prd-styles/default/agent-supplement.md` 完整内容
- **`04-user-stories.md` 三件套**——Agent 故事 → A1 意图 + A2 边界基础；Agent 工作流 → A1 触发 + 4.1 业务流程图（如未在第 4 章用过则在此引用）
- 已写好的 1-8 章节内容（用于上下文一致性）

**执行步骤**：

1. **读 agent-supplement.md**，根据 product_type 确定要写的章节：
   - agent → A1, A2, A3, A4, A5, A6, A7, A8
   - hybrid → A2, A4, A5, A7（最小集必填）+ A3, A6, A8（推荐，按需）

2. **依次写每节**：
   - 用 A1-A8 的模板结构作为骨架
   - 内容来源：从 1-8 已写章节中提取相关信息（如 A1 意图清单 → 从 6 详细功能里提取）
   - 不要硬塞模板示例，要用本项目实际场景填充
   - 拿不到的字段标 `> ⚠️ 待补充：{字段名} - {为什么待补充}`

3. **追加到 PRD 文件末尾**（在 8 非功能需求之后、文档元信息之前）：
   ```
   ---
   
   # 第九章 Agent 专项设计
   
   ## 9.1 意图分类与触发
   ...
   ```

4. **写完后自检**（对照 agent-supplement.md 末尾的"7 问自检卡"）：
   - 7 个问题逐条核对当前 PRD 能不能答上
   - 答不上的项写到 九 末尾的「⚠️ 待评审前补全清单」

5. **更新 checkpoint**：
   ```json
   "checkpoints.prd.completed_steps": [..., "agent_design"]
   ```

## FAB 功能描述

PRD「详细功能设计」中每个核心功能，自动生成 FAB 三行描述（Feature → Advantage → Benefit）。
- 读取 `templates/presets/copywriting-frameworks.md` 中 FAB 模板
- 为每个功能填充 FAB 结构，Benefit 部分用数字或场景说明
- 写入 PRD 对应功能描述段落中

## PRD 落盘前：判断卡 checklist 自检（强制）

写完 PRD 后、落盘前，按 `pm-judgment-card.md §9` 守门 checklist 过一遍——任意一条不过 → 回去改 → 改完再交付。

```
[ ] 角色定位：每段都是 PM 该决策的吗？（不是 → 移到附录"待 X 对齐"或删除）
[ ] 影响范围：每个改动列了受影响的页面/接口/角色/已存量场景（行内「同步影响」即可）
[ ] 复用对照表：仅功能迁移/接老存量类才写，普通迭代没有不算缺失（PITFALL-045）
[ ] 责任分工：技术字段 / 视觉细节 / 算法实现都明示由谁补
[ ] 用户感知失败：技术层失败（接口超时/Schema 校验/缓存未命中）没进 PRD
[ ] 行为契约带理由：每条规则后写"为什么这样"
[ ] Few-shot 标 [算法补完]：写不出 Good/Bad 的不硬凑
[ ] 评测用接受度信号：不强塞量化指标百分比
[ ] 用户话术不透版本号 / 上线时间
[ ] 篇幅 ≤ 500 行：超了先瘦身或拆附录再交付（多模板 Agent 600-800 不算超；承重内容砍不动又被嫌长 → 双层结构搬实现细则进附录，见判断卡 §7 闸 4）
[ ] 复用点操作集：带操作按钮的组件复用进新容器/视图，显式写了保留/禁用哪些操作（交叉点不留白；纯数据复用不算）
```

自检发现的问题，回去改 PRD 主体；改完再次过 checklist 直到全过。

**深度扫描（仅评审前体检 / 大改后回归）**：跑 `ai-pm-driver`。注意 driver 已降级为最后一道安全网——如果 PRD 是用 pm-agent 写的，checklist 已自检过，driver 大概率没什么可挑。**不要每次写完都跑 driver**，那是浪费成本。

## PRD 落盘后：生成摘要（自动执行）

PRD 文件写入后，立即执行以下步骤。

### 1. 检查是否需要生成摘要

用 Bash 检查 PRD 文件大小：
```bash
wc -c "{project_dir}/05-prd/$(python3 .claude/skills/ai-pm/scripts/resolve_current_prd.py file {project_dir})"
```

- 文件 < 20480 字节（20KB）→ 跳过摘要生成
- 文件 ≥ 20480 字节 → 执行摘要生成

### 2. 生成 PRD 摘要

读取 `05-prd/05-PRD-v1.0.md`，按以下结构生成摘要，**总字数控制在 1500–2000 字**：

```
## PRD 摘要 · {项目名} v{版本}
生成时间：{YYYY-MM-DD}

### 产品定位（100 字以内）
{目标用户} + {核心价值主张，一句话}

### 功能模块
- **{模块名}**：{核心逻辑，不超过 30 字}
（列出全部模块）

### 关键设计决策（3–5 条）
1. {决策内容} — {背景/原因}

### 数据与边界
- 核心数据字段：{字段1}、{字段2}、...
- 关键约束：{约束说明}
- 禁止项：{禁止行为}

### 遗留问题
🔴 P0（必须解决）：
- ...
🟡 P1（可推迟）：
- ...

### 下阶段输入
- **给 Phase 7（原型）**：重点验证 {交互点}
- **给 Phase 8（评审）**：重点审视 {设计决策}
```

### 3. 落盘

```bash
mkdir -p {project_dir}/_summaries/
```
写入：`{project_dir}/_summaries/prd-summary.md`

### 4. 更新 _status.json

在 `_status.json` 的**顶层**新增（或更新）`summaries` 字段：
```json
"summaries": {
  "prd": "{ISO8601 时间戳}"
}
```

### 5. 写入成本记录

```bash
# 获取 PRD 文件字节数
wc -c "{project_dir}/05-prd/$(python3 .claude/skills/ai-pm/scripts/resolve_current_prd.py file {project_dir})"
```

将字节数 × 0.25 作为 `tokens_estimate`，写入 `_status.json`：

```json
"cost": {
  "phases": {
    "prd": {
      "model": "claude-sonnet-4-6",
      "tokens_estimate": {file_bytes * 0.25},
      "completed_at": "{ISO8601 时间戳}"
    }
  },
  "total_estimate": {累加所有 phases 的 tokens_estimate}
}
```

## memory_write 步骤：写入 L1 决策记忆

`prd_done` 子步骤完成（含摘要 + 成本记录落盘）之后，执行 `memory_write` 步骤：

1. `mkdir -p {project_dir}/_memory/`（若不存在则创建）
2. 从 `05-prd/05-PRD-v1.0.md` 的「功能规格」章节提取关键取舍决策：
   - 选择了什么方案，以及原因（来自「背景」「设计说明」「注意」等段落）
   - 明确排除的功能及原因（来自「不在范围内」「禁止」等）
   - 典型场景：采用侧边栏而非弹窗、分步表单而非单页表单等

3. 以**追加**方式写入 `_memory/L1-decisions.md`（`test -f` 检查：不存在则创建，存在则在末尾追加）：
   每条决策格式：
   ```
   ## {YYYY-MM-DD}: {决策标题}
   **决策**：{内容}
   **原因**：{为什么}
   **范围**：{影响功能/页面}

   ---
   ```
   提取 3-5 条最关键的决策即可，不要穷举。

格式参考 `references/project-memory.md` 的 L1-decisions.md 格式。

---

## 输出收尾：patch 05-prd/README 索引（强制步骤）

PRD 文件落盘 + 摘要 + 成本记录 + L1-decisions 全部完成后，**最后**一步是 patch `{项目}/05-prd/README.md`（详见 `ai-pm-prd/SKILL.md` 步骤 5.5 的完整约束）。

**核心约束**（不重复 ai-pm-prd 主文档）：

- 状态字段只能从枚举选：`A 级定稿 / B 级 / C 级 / 草稿 / 已废弃 / 已超出版本`
- AI patch 只 INSERT 新条目，不 DELETE/REWRITE 历史链
- 跨版本关系从 PRD 正文「版本范围说明」抽取，不能自己推断
- 模板见 `templates/project-index/prd-readme.template.md`

不 patch 05-prd/README 不算 phase-5-prd 完成。
