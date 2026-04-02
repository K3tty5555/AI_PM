# 用户交互与项目管理参考

## 多代理调度逻辑

### 自动触发条件

满足以下任一条件时，建议用户使用 `--team` 模式：
- 用户显式输入 `/ai-pm --team [需求]`
- 需求描述超过 200 字且包含多个独立功能模块

### 调用方式

```
使用 Agent 工具，分配角色：
  - 产品分析师：需求拆解、用户故事
  - 竞品研究员：竞品分析、市场定位
  - 主控 PM：整合产出、生成 PRD
并行执行，主线程汇总后生成 PRD。
```

### --team 模式流程提示语

```
检测到复杂需求，启用多代理协作：
  - 产品分析师 → 需求拆解 + 用户故事
  - 竞品研究员 → 市场分析 + 差异化策略
  - 主控 PM    → 整合产出，生成 PRD

预计比标准模式快 40%，继续？
  启动 / 标准模式
```

---

## 项目路径解析（~/.ai-pm-config）

**所有操作使用 `{projects_dir}` 而非硬编码 `output/projects`。每次启动时必须先解析此变量。**

### config 文件格式

`~/.ai-pm-config`（JSON）：

```json
{
  "projects_dir": "/Users/foo/somewhere/output/projects",
  "created": "YYYY-MM-DD"
}
```

### 解析流程（每次启动必须执行）

```
步骤1: cat ~/.ai-pm-config
  ├── 成功且路径存在 → 使用 projects_dir，进入正常启动
  ├── 成功但路径不存在 → 跳到「路径失效处理」
  └── 失败（文件不存在）→ 跳到「首次运行检测」

首次运行检测:
  ├── output/projects/ 存在且有内容
  │     → 静默写入 ~/.ai-pm-config（projects_dir = 当前绝对路径/output/projects）
  │     → 使用该路径，用户无感知
  └── output/projects/ 为空或不存在
        → 进入「新用户引导」

新用户引导:
  你的项目存在哪个文件夹？
    1. 当前目录（默认）→ {当前绝对路径}/output/projects
    2. 自定义路径      → 输入路径
  → 写入 ~/.ai-pm-config → mkdir 确保目录存在 → 继续

路径失效处理:
  找不到项目数据（{旧路径} 不存在）
    1. 重新选择路径
    2. 全新开始（当前目录）
  → 更新 ~/.ai-pm-config
```

### 写入 config 的时机

- 新用户引导完成后
- 老用户首次运行检测成功后（静默写入）
- 路径失效后用户重新选择后
- `/ai-pm config path` 命令手动修改时

---

## 记忆迁移与备份（α + β）

Claude 记忆存储路径由安装目录决定（`~/.claude/projects/{路径哈希}/memory/`），换路径后记忆会丢失。以下两个机制解决此问题。

### 方案 α：启动时自动扫描旧记忆（历史债务修复）

**触发时机**：`projects_dir` 解析完成后，检测到当前 claude 记忆目录为空时执行。

```
当前记忆目录 = ~/.claude/projects/{当前路径哈希}/memory/

检测：当前记忆目录为空或不存在
  → 扫描 ~/.claude/projects/*/memory/MEMORY.md
  → 过滤：内容包含 "AI_PM" 或 "ai-pm" 关键词
  → 找到候选项：
      ├── 唯一匹配 → 静默复制到当前记忆目录，用户无感知
      ├── 多个匹配 → 展示列表，让用户选择（显示目录名 + 最近修改时间）
      └── 无匹配   → 跳过，按新用户处理
```

扫描命令：
```bash
ls ~/.claude/projects/*/memory/MEMORY.md 2>/dev/null
```

内容特征检测：
```bash
grep -l "AI_PM\|ai-pm" ~/.claude/projects/*/memory/MEMORY.md 2>/dev/null
```

### 方案 β：记忆实时备份到 projects_dir（防止将来再丢）

**触发时机**：每次记忆文件写入后（Write 工具写入 memory/ 目录时）。

备份目标：`{projects_dir}/.ai-pm-memory/`（随项目数据走，受方案 L 保护）

```
写入记忆后，立即同步：
  cp -r ~/.claude/projects/{当前路径哈希}/memory/ {projects_dir}/.ai-pm-memory/
```

**启动时恢复逻辑**（配合 α）：

```
当前记忆目录为空
  → 先检查 {projects_dir}/.ai-pm-memory/ 是否存在
      ├── 存在 → 优先从此恢复（比 α 扫描更精准）
      └── 不存在 → 执行 α 扫描
```

### 执行优先级

```
启动时记忆恢复顺序：
  1. {projects_dir}/.ai-pm-memory/（β 备份，最新最准）
  2. α 扫描 ~/.claude/projects/（历史兜底）
  3. 全部找不到 → 新用户，无记忆
```

---

## _status.json 规范

每个项目目录下维护 `_status.json`，记录阶段完成状态。这是项目状态的唯一来源，启动时读此文件，不遍历 phase 文件。

```json
{
  "project": "项目名",
  "updated": "2026-04-02T10:30:00Z",
  "phases": {
    "requirement": false,
    "analysis": false,
    "competitor": false,
    "stories": false,
    "prd": false,
    "prototype": false,
    "audit": false,
    "review": false
  },
  "last_phase": "init",
  "checkpoints": {
    "prd": {
      "step": "product_overview",
      "completed_steps": [],
      "pending_step": "product_overview",
      "last_updated": "2026-04-02T10:30:00Z"
    }
  },
  "cost": {
    "phases": {},
    "total_estimate": 0
  },
  "agent_errors": {},
  "summaries": {}
}
```

### checkpoints 字段规范

记录进行中 phase 的子步骤状态，支持 Phase 内断点恢复。

- `step`：当前正在执行的子步骤名（英文 snake_case）
- `completed_steps`：已完成的子步骤数组
- `pending_step`：下次恢复时从此步骤继续
- 仅在 phase 执行过程中存在对应 checkpoint；phase 完成后可清除

**phase 恢复规则**：
- `/ai-pm continue` 时，读 `checkpoints[last_phase].pending_step`
- 直接跳到 pending_step，跳过 completed_steps 中的步骤

---

### cost 字段规范

按阶段记录 token 消耗估算，用于 `/ai-pm list` 展示。

```json
"cost": {
  "phases": {
    "prd": {
      "model": "claude-sonnet-4-6",
      "tokens_estimate": 45000,
      "completed_at": "2026-04-02T11:00:00Z"
    }
  },
  "total_estimate": 45000
}
```

**Token 估算方法**：读取阶段输出文件字节数 × 0.25（中文约 1.5 bytes/token，context 含输入输出约 4x 系数）。`/ai-pm list` 展示时格式：`~45K tokens`。

---

### agent_errors 字段规范

记录 agent-team Wave 中失败的 subagent 信息，支持 `--retry` 重跑。

```json
"agent_errors": {
  "wave1_analyst": {
    "error": "竞品数据获取超时",
    "timestamp": "2026-04-02T10:15:00Z",
    "retryable": true
  }
}
```

**清除规则**：对应 Wave 重跑成功后清除该条错误记录。

---

### phase 写入规则

**`updated` 字段写入格式**：ISO 8601（`YYYY-MM-DDTHH:MM:SSZ`），每次更新 `_status.json` 时同步刷新。

**每个阶段完成、文件落盘后，立即更新 `_status.json`：**

```
phases.requirement = true  → 写完 01-requirement-draft.md 后
phases.analysis    = true  → 写完 02-analysis-report.md 后
phases.competitor  = true  → 写完 03-competitor-report.md 后
phases.stories     = true  → 写完 04-user-stories.md 后
phases.prd         = true  → 写完 05-prd/05-PRD-v1.0.md 后
phases.prototype   = true  → 写完 06-prototype/index.html 后
phases.audit       = true  → 写完 07-audit-report.md 后
phases.review      = true  → 写完 08-review-report-v1.md 后
```

新项目创建时，在项目目录下生成初始 `_status.json`：phases 全部为 false，last_phase 为 "init"，checkpoints 为 `{}`，cost 为 `{ "phases": {}, "total_estimate": 0 }`，agent_errors 为 `{}`。

---

## 启动界面逻辑

### 启动读取方式（性能优化）

**`/ai-pm` 无参数启动时：**
1. 解析 `{projects_dir}`（按「项目路径解析」规范执行，必须先于一切操作）
2. `ls -t {projects_dir}/` 一次拿到项目列表和顺序
3. 只读最近项目的 `_status.json`（1 次文件读取）
4. 从 ls 结果统计总数
5. **不遍历其他项目**

**`/ai-pm list` 时：**
1. 解析 `{projects_dir}`
2. 遍历所有项目，逐个读 `_status.json`
3. 如某项目无 `_status.json`，降级为文件存在性检查

### /ai-pm list 展示格式

每个项目展示一行：

```
{项目名}        Phase {完成数}/8   ~{total}K tokens   {updated}
```

- `total` 来自 `_status.json.cost.total_estimate`，除以 1000 取整，格式 `~45K`
- 无 cost 记录的老项目显示 `无记录`
- `total_estimate` 超过 100000 时，在数字前添加 🔴 标注
- 按 `updated` 降序排列（最新在上）

**示例**：
```
── 所有项目（3 个）──

教育超级智能体   Phase 5/8   🔴 ~130K tokens   2026-03-27
新版考试答题卡   Phase 4/8   ~98K tokens       2026-03-13
web端考试阅卷    Phase 7/8   ~92K tokens       2026-03-13
```

### 无项目时（欢迎界面）

```
── AI 产品经理 ──

说需求就能出 PRD + 原型，也做竞品分析和需求评审。

怎么开始：
  直接描述需求       → 例：做一个帮用户决定吃什么的 App
  加急 [需求]        → 跳过追问，自动跑完到原型，只停两次确认
  interview         → 带客户现场用，边聊边出方案
  data [文件]        → 从数据里找需求，支持 CSV/Excel/JSON
```

### 有项目时（只展示最近一个）

```
── AI 产品经理 ──  N 个项目

项目：{项目名}
需求✅ 分析✅ 竞品✅ 故事✅ PRD⏳ 原型░░ 评审░░

→ 建议：{推荐下一步}（{推荐理由}）

其他操作：{未完成阶段列表} / 看PRD
切换：list 看全部 / 直接描述新需求
```

进度条渲染规范见 `references/user-interaction.md` — `render_progress` 章节。

**推荐下一步推断规则**（根据 `last_phase` 和 `phases` 判断）：

| last_phase | 推荐下一步 | 推荐理由 |
|------------|-----------|---------|
| `init` / `requirement` | 需求分析 + 竞品研究（并行） | 需求草稿已就绪 |
| `analysis` / `competitor` / `stories` | 生成 PRD | 前置分析已完成 |
| `prd` | 生成原型 | PRD 已完成，可直接进入 |
| `prototype` | 原型完整性审计 | 原型已就绪，自动审计 PRD 覆盖率 |
| `audit` | 需求评审 | 审计完成，可提交评审 |
| `review` | 项目完成 ✓ | 全流程已走完 |

**「其他操作」列表规则**：仅列出 phases 为 false 的阶段（不包括推荐步骤本身），若全部完成则省略该行。

---

## 进度渲染规范（render_progress）

以下场景必须渲染进度条：
- `/ai-pm` 无参数启动、展示当前项目状态时
- 每个阶段完成后
- `/ai-pm continue` 断点恢复时

**渲染格式**（unicode 块字符）：

```
📋 {项目名} · 进度
需求{r} 分析{a} 竞品{c} 故事{s} PRD{p} 原型{t} 评审{v}
{当前状态行}
```

各状态符号：
- `✅` → 已完成
- `⏳` → 进行中（当前 phase）
- `░░` → 未开始

> **注**：Phase 7.5（完整性审计）作为原型阶段的内置子步骤（`audit_running`/`audit_done`）呈现，不在主进度条单独列出。

**当前状态行** 格式：
- 若有 checkpoint：`当前：{phase 中文名} · {步骤中文名}（{完成数}/{总步数}）`
- 若无 checkpoint 且有推荐下一步：`建议：{推荐下一步}`
- 若全部完成：`✅ 全流程已完成`

**示例**：
```
📋 新版考试答题卡 · 进度
需求✅ 分析✅ 竞品✅ 故事✅ PRD⏳ 原型░░ 评审░░
当前：PRD 生成 · 功能规格（3/9 步）
```

---

## 快捷指令

| 快捷指令 | 同义词 | 作用 |
|---------|-------|------|
| `继续` | go, 下一步, 开始 | 执行下一阶段 |
| `跳过` | skip | 跳过当前阶段 |
| `看PRD` | 查看PRD | 显示当前 PRD |
| `看原型` | 查看原型, 预览原型 | 显示/预览原型 |
| `状态` | status, 进度 | 显示项目仪表盘 |
| `加急` | yolo, 快速模式 | 自动执行到原型 |
| `直接PRD` | 快速PRD | 跳过中间阶段生成 PRD |

### Yolo 模式

Phase 1-4 全自动执行，仅在 PRD 生成前停一次确认，生成原型前再停一次。

---

## 有现成文档时的处理

用户提到「有现成需求文档 / PRD / 规格说明」时：

```
已有需求文档？把文件放到：
{projects_dir}/{项目名}/07-references/

支持格式：.md / .txt / .docx / .pdf
放好后告诉我文件名，我直接读取，跳过需求访谈。
```

读取后：
- 从文档中提取核心信息，生成 01-requirement-draft.md
- 跳过 Phase 1 交互式访谈，直接进入 Phase 2+3
- 若文档已含竞品/用户画像内容，相应阶段可标记为「基于已有文档」
