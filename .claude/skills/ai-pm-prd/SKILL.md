---
name: ai-pm-prd
description: >-
  PRD 生成技能。整合需求分析、竞品研究、用户故事，输出完整的产品需求文档。支持产品分身写作风格和设计规范。
  当用户说「生成PRD」「写PRD」「产品需求文档」「需求文档」「功能规格书」「输出PRD」
  「帮我写需求」「把需求整理成文档」时，立即使用此技能。
argument-hint: "[项目目录路径 | --style=风格名]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cat) Bash(node) Bash(rm) Bash(python3) Bash(grep) Agent
---

# PRD 生成

## 输入

- `{项目目录}/02-analysis-report.md`（需求分析，必需）
- `{项目目录}/03-competitor-report/V{版本}.md`（竞品研究，如有）
- `{项目目录}/04-user-stories.md`（用户故事，如有）
- `templates/prd-styles/{风格名}/style-config.json`（写作风格，可选）

## 输出

`{项目目录}/05-prd/<当前 PRD 文件>`（首次新建默认 `05-PRD-v1.0.md`，建议改描述名 `[YYYYM][域]<标题>-V1.0.md` 经 PM 确认；落盘后写 `_status.json.active_prd`）

> 🔑 **「当前 PRD 文件」约定**：本文档（及 export-guide）下方出现的 `05-PRD-v1.0.md` 及其同名导出 `.pdf/.docx/-illustrated.pdf` **一律指「当前 PRD 文件」变量**，由 `ai-pm/scripts/resolve_current_prd.py`（`_status.json.active_prd` 权威）解析，**非写死名字**。

目录结构：
```
{项目目录}/05-prd/
├── README.md
└── <当前 PRD 文件>.md   # 默认 05-PRD-v1.0.md，建议描述名
```

## 执行步骤

### 步骤 0：AI 配图模式确认

在开始生成 PRD 之前，询问用户：

```
是否开启 AI 配图模式？
开启后，PRD 生成完毕时会自动扫描所有 Mermaid 流程图，调用 AI 配图服务（baoyu-imagine）渲染成高清插图并嵌入 PRD。

⚠️ 会产生 API 费用，每张图约 0.1–0.3 元。

1. 开启（推荐，PRD 更直观）
2. 跳过（保持 Mermaid 代码）
```

- 用户选 1 → 设置内部标志 `ai_illustration_mode = true`，继续步骤 1
- 用户选 2 → `ai_illustration_mode = false`，继续步骤 1

### 步骤1：询问导出格式（生成前确认）

**先检测** `06-prototype/screenshots/manifest.json` 是否存在，决定是否展示含截图选项。

使用 **AskUserQuestion 工具**（交互式单选），不要用纯文字输出让用户手动输入字母。

**有 manifest.json 时**，提供5个选项：
- A. 仅 Markdown — 最快，无额外等待，适合版本管理和后续编辑
- B. Markdown + 纯文字 PDF（+5秒） — 干净PDF，适合快速存档或邮件发送
- C. Markdown + DOCX 含截图（+20秒） — Word格式+截图，适合上传飞书
- D. Markdown + PDF 含截图（+30秒） — 自包含PDF，适合正式评审会议分发
- E. 全套 DOCX + PDF 均含截图（+40秒） — 一次生成所有格式

**无 manifest.json 时**：只展示 A/B 两个选项，并在问题描述中提示"如需含截图版，请先运行 /ai-pm prototype"。

用户选择后记录 `$EXPORT_MODE`，继续执行步骤2。

### 步骤2：读取风格配置（可选）

检查是否有 `--style` 参数或 `$PM_STYLE` 环境变量，若有则读取对应的 `style-config.json` 并应用：
- 章节顺序（`structure.chapterOrder`）
- 优先级术语（P0/P1/P2 或 高/中/低）
- 表格字段（`formatting.tableFields`）
- 内容侧重（`contentFocus`：用户故事篇幅、指标详细程度等）

### 步骤3：读取所有输入文档，整合信息

**⚠️ 强制规则：先判 doctype 选模板，再读模板动笔**

**① 先判 doctype（阶段 + 形态），别让 feishu-template 抢先**（指回 phase-5-prd 步骤 A.0/A.0.1，不复制逻辑）：
- **决策评审型**（拿方向 / go-no-go / 选路线）→ 读 `templates/prd-styles/default/decision-review-template.md` 的 4 节骨架，**不套 feishu、不写详细功能设计**。
- **全员评审（完整功能）** → 才读 `templates/prd-styles/default/feishu-template.md`（按 product_type 注入 agent-supplement）。
- **触发词不明确时**：本独立入口**问一次 PM**（决策评审还是全员评审？）；非交互的 ad-hoc 调用**默认 `full`、并在 PRD 文件头注明判断依据**。
- 判完**接 phase-5 步骤 A.0.1 写 doctype 三处**（`_status` / L1 upsert / 文件头 `<!-- doctype: -->`）。

**② 读到所选模板后**：PRD 的所有章节结构、字段名称、字段顺序必须**严格与所选模板一致**，不得凭印象自行调整。
- 模板不存在时：按本文件「PRD 8 章结构」兜底（兜底结构 `references/prd-structure.md` 已是完整骨架版、非 bullet）。

> 用户上传模板就是为了让输出严格对齐，任何"我觉得这样更合理"的自行调整都是错的。

**职责边界**：
- **模板文件**是内容规则的唯一来源：章节名、字段名、字段顺序、表格结构，一律以模板为准
- **本 SKILL.md** 只定义行为规则：何时读模板、用 Mermaid、不降级、版本策略等
- 本文件中出现的任何字段示例（包括「PRD 8 章结构」里的样例）仅作无模板时的兜底，**不构成对模板内容的约束**；用户修改模板后，示例自动失效，以模板为准

### 步骤3.5：PM 质量机制（强制，与 /ai-pm 全流程同源）

本技能是独立入口，但 PRD 质量机制**与 phase-5 共用一套，不旁路**（单一事实源在 `.claude/skills/ai-pm/phases/phase-5-prd.md` 和 `.claude/agents/pm-agent.md`，此处只接线不复制）：

1. **判断卡前置**：动笔前读 `.claude/skills/ai-pm/references/pm-judgment-card.md`（角色/越界红线/责任分工）
2. **扎根注入**：按 phase-5 的「🌱 扎根注入」执行——查 `{项目目录}/05-prd/ai-md/_conventions.md`（有→注入骨架+词表+黑名单；无但有历史 PRD→先建约定包；0→1 项目→静默跳过）+ 落 `grounding-input.md`
3. **章节优先调 pm-agent**：functional_spec / agent_design 类章节按 phase-5 的「🤖 优先调用 pm-agent」模板调用（prompt 含「项目约定」块）；简单章节主对话直写
4. **双层组织**：按 phase-5「双层组织」分级表定档（复杂全附录 / 中等关键 / 小补丁行内 / 决策稿不强制）

### 步骤4：按 8 章结构生成 PRD

```
mkdir -p {项目目录}/05-prd/
```

生成 `05-PRD-v1.0.md` 并创建 `README.md`（说明目录用途）。

### 步骤4.5a：流程图生成方式

PRD 中包含 Mermaid 代码块时，生成方式取决于执行环境：

- **Claude Code 环境（`ai_illustration_mode=true`）**：步骤6 负责调用 baoyu-imagine 批量生成 AI 图片，不走 md2docx.py 内部渲染
- **Claude Code 环境（`ai_illustration_mode=false`）**：Mermaid 代码块保留原样写入 DOCX/PDF，不触发任何渲染
- **用户手动在终端执行 md2docx.py（TTY 模式）**：脚本逐个询问 A（AI高清/Seedream）或 B（本地Chrome），按用户选择执行；选 A 生成失败后不自动重试（避免重复扣费），需用户手动确认后再试

### 步骤4.5b：导出前敏感信息扫描

**在执行导出前**，对 PRD Markdown 源文件做正则扫描，检测以下敏感信息：

- 高危：API Key（`sk-`/`key-`/`token-` 开头）、数据库连接串、密码明文、私钥片段
- 中危：内部 IP（`192.168.*`/`10.*`）、内部域名（`.internal`/`.local`/`.corp`）、手机号、身份证号、邮箱

**如果发现敏感信息**，提示用户：

```
⚠️ 敏感信息扫描发现 {N} 处：

  🔴 L42: sk-a****xxxx（API Key）
  🟡 L78: 192.***.***.100（内部 IP）
  🟡 L103: 138****8000（手机号）

选择：
  A. 自动脱敏后导出（替换为占位符）
  B. 忽略，直接导出
  C. 我先手动修改，稍后再导出
```

- 选 A → 在导出副本中替换（API Key → `[API_KEY_REDACTED]`，手机号 → `138****8000`），原文不动
- 选 B → 直接导出
- 选 C → 暂停导出，等用户修改后重新执行

**无发现则静默通过**，不打扰用户。

**邮箱排除白名单**：`example.com`、`example.org`、`test.com`、`localhost` 等占位域名自动跳过。

### 步骤5：完成提示 + 执行导出

输出 PRD 关键摘要：

```
✅ PRD 已生成：05-prd/05-PRD-v1.0.md
   功能模块：{N} 个 | P0：{N} 项 | 核心指标：{N} 条
```

### 步骤 5.5：patch 05-prd/README 索引（强制）

PRD 文件落盘后，**立即**做两件：

**① 写 `_status.json.active_prd`**（当前 PRD 权威源）= 刚落盘的 PRD 文件名——后续 skill / 客户端都靠它定位当前 PRD（见 `resolve_current_prd.py`）。

**② patch `{项目}/05-prd/README.md`**（当前活跃表只人读、不被机器解析）：

**新增 PRD 时**：
- 如果是当前活跃版本的新场景或新版本 → 插入「当前活跃版本」表格
- 如果是更老版本的修订 / 增量 → 插入「历史版本链」表格

**修改/重命名 PRD 时**：
- 同步更新表格里的文件名
- 状态字段从枚举里选：`A 级定稿 / B 级 / C 级 / 草稿 / 已废弃 / 已超出版本`，**不能自创**

**废弃 PRD 时**：
- 从「当前活跃版本」移到「历史版本链」并标 `已废弃` / `已超出版本`
- **不能 DELETE 旧条目**，只能 INSERT / MOVE

**版本号变化时**（如从 V1.2 升到 V1.3）：
- 把原 V1.x 条目从「当前活跃」移到「历史版本链」
- 在「当前活跃版本」加入新 V1.y
- 同步 patch 根 `README.md` 的「当前版本」字段

**跨版本关系**：从 PRD 正文「版本范围说明」抽取，**禁止自己推断**。

不 patch README 不算完成此步骤。详细模板见 `templates/project-index/prd-readme.template.md`。

然后按 `ai_illustration_mode` 分支处理：

- **`ai_illustration_mode=false`**：直接按步骤1所选 `$EXPORT_MODE` 执行导出（使用原始 PRD），输出完成提示后流程结束。
- **`ai_illustration_mode=true`**：跳过此处导出，继续执行步骤6（AI 配图），导出将在步骤6完成后进行。

### 步骤 6：批量 AI 配图（仅 ai_illustration_mode=true 时执行）

#### 6.1 扫描 PRD，提取所有 Mermaid 块

读取当前 PRD 文件（`{项目目录}/05-prd/<当前 PRD 文件>`，取 `_status.json.active_prd`；默认 `05-PRD-v1.0.md`），找到所有 ` ```mermaid ... ``` ` 代码块。

为每个代码块生成两部分标识：
- **ID**：`flow1`、`flow2`、… （序号前缀）
- **slug**：从 Mermaid 代码内容提炼的英文描述，如 `scene-routing`、`quiz-generation`

文件名格式：`{id}-{slug}`，如 `flow1-scene-routing`。

#### 6.2 为每个 Mermaid 块构建 prompt 文件

在 `/tmp/mermaid-prompts/` 目录（不存在则先 `mkdir -p`）下，为每个 Mermaid 块创建对应的 prompt 文件：

```
/tmp/mermaid-prompts/{编号}-prompt.md
```

prompt 内容格式（中文，清晰描述流程图）：

```
专业产品流程信息图，扁平矢量 corporate-memphis 风格，纯白色背景(#FFFFFF)，蓝色系配色(主色#1D4ED8)。中文标注，清晰可读，简洁专业，适合嵌入PRD文档。充足留白，节点间用带箭头连接线。布局类型：{根据流程形态选择 linear-progression 水平从左到右 / tree-branching 双分支并列 / diamond-decision 菱形决策 等}。

流程内容（基于以下 Mermaid 代码转化为可视化信息图）：
{Mermaid 代码内容，去掉 ```mermaid ... ``` 标记，只保留代码本体}

图表标题：{从 Mermaid 代码内容提炼一个简短标题}
```

#### 6.3 构建 batch.json 并调用 baoyu-imagine

在 `/tmp/mermaid-prompts/batch.json` 写入以下格式（所有路径均为绝对路径）：

```json
{
  "tasks": [
    {
      "id": "flow1",
      "promptFiles": ["/tmp/mermaid-prompts/flow1-prompt.md"],
      "image": "{项目目录绝对路径}/11-illustrations/flow1-scene-routing.png",
      "ar": "16:9"
    },
    {
      "id": "flow2",
      "promptFiles": ["/tmp/mermaid-prompts/flow2-prompt.md"],
      "image": "{项目目录绝对路径}/11-illustrations/flow2-quiz-generation.png",
      "ar": "16:9"
    }
  ]
}
```

> provider/model/quality 不要硬编码，由 baoyu-imagine 从用户 EXTEND.md 读取。

`11-illustrations` 目录路径：`{项目目录}/11-illustrations/`（不存在则先 `mkdir -p` 创建）。
image 字段格式：`{项目目录绝对路径}/11-illustrations/{id}-{slug}.png`，按实际 Mermaid 块数量生成对应条目。

然后执行以下命令，等待所有图片生成完毕（最多等待 10 分钟）：

```bash
~/.bun/bin/bun ~/.claude/skills/baoyu-imagine/scripts/main.ts --batchfile /tmp/mermaid-prompts/batch.json
```

若命令退出码非0或有 task 生成失败，对应 Mermaid 块在 `_export_tmp.md` 中**保留原始代码块**（不替换为图片引用），并在完成时告知用户哪几张图片生成失败。

#### 6.4 生成临时导出副本

在 PRD 文件同目录（`{项目目录}/05-prd/`）下创建 `_export_tmp.md`，内容为 PRD 文件的完整拷贝，但将**成功生成的**每个 Mermaid 代码块替换为对应的图片引用：

```
![{图表标题}](../11-illustrations/{id}-{slug}.png)
```

**注意：原始 PRD 文件（`05-PRD-v1.0.md`）保持不变，`_export_tmp.md` 仅作为导出临时文件。**

#### 6.5 执行导出

图片全部（或部分）生成后，按步骤1所选 `$EXPORT_MODE` 执行导出，导出工具使用 `_export_tmp.md` 而非原始 PRD：

- **DOCX 导出**：`md2docx.py` 传入 `_export_tmp.md` 路径
- **PDF 导出**：`build-pdf-html.js` 传入 `_export_tmp.md` 路径

导出完成后输出汇总：

```
✅ 已生成 {N} 张配图（{M} 张失败保留原始代码块）
✅ {格式A} → 05-prd/05-PRD-v1.0.{ext}
```

#### 6.6 清理

导出完成后（无论成功或失败均执行清理），删除临时文件：

```bash
rm -f "{项目目录}/05-prd/_export_tmp.md"
rm -rf /tmp/mermaid-prompts/
```

---

## PRD 8 章结构

无模板时的兜底结构见 `references/prd-structure.md`。

## 版本策略

- 首次生成：创建 v1.0，修订日志记录"初稿创建"
- 评审后修改：**不创建新文件**，在原文档直接修改，修订日志追加新记录（v1.1、v1.2...）
- 不生成 `.bak` 备份文件，Git 历史已足够

## 导出格式参考

| 选项 | 产物文件 | 命令（独立触发时） |
|------|---------|----------------|
| A 仅 Markdown | `05-PRD-v1.0.md` | 默认 |
| B 纯文字 PDF | `05-PRD-v1.0.pdf` | `--export=pdf` |
| C DOCX 含截图 | `05-PRD-v1.0.docx` | `--export=docx` |
| D PDF 含截图 | `05-PRD-v1.0-illustrated.pdf` | `--export=pdf-illustrated` |
| E 全套 | DOCX + 两个 PDF | `--export=all` |

PDF/DOCX 导出的完整实现（build-pdf-html.js 代码 + 三条导出路径命令）见 `references/export-guide.md`。
