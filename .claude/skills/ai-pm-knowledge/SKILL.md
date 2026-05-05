---
name: ai-pm-knowledge
description: >-
  产品知识库管理技能。沉淀方法论、决策记录、踩坑经验，下次遇到类似问题时自动推荐。
  当用户说「保存经验」「记录决策」「沉淀知识」「踩坑记录」「搜索知识库」
  「之前有没有遇过类似问题」「知识管理」「经验总结」「记下来」时，立即使用此技能。
argument-hint: "[命令: add/search/list/sync/suggest] [关键词]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(grep)
---

# ai-pm-knowledge — 产品知识库管理

## 知识库根目录

`templates/knowledge-base/`

## 命令路由

| 命令 | 执行 |
|------|------|
| `add` | 添加知识卡片 |
| `search {词}` | 搜索知识库 |
| `list` | 列出所有分类统计 |
| `sync` | 从当前项目提取可沉淀知识 |
| `suggest {词}` | 推荐相关知识（Phase 5 自动调用 / 用户直接调用，详见文末规范） |
| `review-low` | 批量管理 auto-generated 卡片 |
| `cleanup-auto` | 清理 / 归档 auto 卡片（紧急回滚 + 日常维护）|
| 无参数 | 执行 list |

---

## 知识分类

| 目录 | 类型 | 说明 |
|------|------|------|
| `patterns/` | 设计模式 | 可复用方案 |
| `decisions/` | 决策记录 | 为什么选 A 不选 B |
| `pitfalls/` | 踩坑记录 | 坑在哪，怎么躲 |
| `metrics/` | 度量指标 | 指标模板 |
| `playbooks/` | 场景手册 | 特定场景怎么做 |
| `insights/` | 洞察报告 | 用户/市场发现 |

---

## add — 添加知识

逐步引导，每次只问一个问题：

**Step 1** — 分类（数字选择）:
```
1  设计模式    2  决策记录    3  踩坑记录
4  度量指标    5  场景手册    6  洞察报告
```
映射：1→patterns，2→decisions，3→pitfalls，4→metrics，5→playbooks，6→insights

**Step 2** — 标题（一句话）

**Step 3** — 问题场景（什么情况下遇到的）

**Step 4** — 解决方案

**Step 5** — 验证数据（没有就写"待验证"）

**Step 6** — 适用范围（什么产品/阶段）

六步完成后生成文件：

**ID 生成**: 扫描 `templates/knowledge-base/{分类}/` 下所有 .md（排除 README.md），提取 `{CATEGORY_UPPER}-{NNN}` 格式最大序号 +1；无已有文件则从 001 开始。格式：`{CATEGORY_UPPER}-{三位序号}`（如 PATTERN-001）

**slug 生成**: 英文 → 转小写 + 连字符；中文 → 保留汉字字母数字，去除 `/ \ : * ? " < > |`，空格换连字符

**写入**: `templates/knowledge-base/{分类}/{id}-{slug}.md`

知识卡片模板：
```markdown
---
id: {ID}
category: {category}
tags: []
source-project:
source-session:                    # auto 模式必填，前 8 位 session_id
created: {YYYY-MM-DD}
confidence: low
auto-generated: false              # auto 模式必填 true
auto-dedup-key:                    # auto 模式必填，核心概念-动词
---

# {标题}

## 问题场景
{场景}

## 解决方案
{方案}

## 验证数据
{数据或"待验证"}

## 适用场景
{范围}
```

完成后确认：
```
已保存 {ID}  {标题}
→ templates/knowledge-base/{分类}/{文件名}
```

### auto 模式（hook 触发时使用）

当 hook 触发让 AI 自动写卡片时，AI 必须传以下额外字段：

| 字段 | 说明 |
|------|------|
| `confidence: low` | 自动生成默认低置信度 |
| `auto-generated: true` | 标记为 hook 触发产生 |
| `source-session: {前8位}` | 哪次会话产生的（来自 hook stdin 的 session_id） |
| `auto-dedup-key` | 跨次去重 key，由 AI 生成（核心概念-动词，如 `filter-repo-untracked`、`force-with-lease-stale`） |

**新建前必须做的去重检查**：

1. 提取候选卡片的 title + 前 200 字描述
2. 在 `templates/knowledge-base/{同 category}/` 下用 `grep -ri` 查相似 title
3. 如果 `auto-dedup-key` 已存在 → **不新建**，把当前对话的"验证数据"段追加到旧卡末尾
4. 否则正常新建

**source-project 双重校验**：

1. 取 cwd（当前目录）从路径中识别项目名
2. 扫最近 N 条对话提及的项目名
3. 两者一致 → 用该项目名
4. 不一致或都拿不准 → 标 `source-project: unknown`，绝不猜

frontmatter 示例（auto 模式实际写入）：

```yaml
---
id: PITFALL-016
category: pitfalls
tags: [git, filter-repo]
source-project: _meta              # 或具体项目 / unknown
source-session: 95603cf1
created: 2026-05-05
confidence: low                    # auto 模式默认 low
auto-generated: true               # auto 模式必填
auto-dedup-key: filter-repo-untracked  # auto 模式必填，核心概念-动词
---
```

---

## search — 搜索知识

1. 在 `templates/knowledge-base/` 递归搜索包含关键词的 .md（排除 README.md）
2. 匹配范围：文件名、frontmatter tags/id、标题行、问题场景段落
3. 有匹配时展示（最多 5 条）：
```
{N} 条相关知识：

  1  [PATTERN-001]  渐进式功能引导
     patterns  |  mobile, onboarding
     场景：用户首次使用复杂功能...

数字查看详情，回车跳过
```
4. 用户输入数字 → 输出完整知识卡片
5. 无匹配 → 静默

### 搜索行为（默认过滤）

默认过滤 `confidence: low` + `auto-generated: true` 的卡片，避免低质量结果污染。

**实现伪代码**：

```bash
# 默认（隐藏 auto+low）
grep -r "{关键词}" templates/knowledge-base/ --include='*.md' -l | while read f; do
  AUTO=$(awk '/^auto-generated:/{print $2; exit}' "$f")
  CONF=$(awk '/^confidence:/{print $2; exit}' "$f")
  if [[ "$AUTO" == "true" && "$CONF" == "low" ]]; then
    continue   # 默认过滤
  fi
  echo "$f"
done
```

**显式包含 auto 卡片**：`/ai-pm knowledge search {词} --include-auto`

suggest 同样默认过滤，理由相同（PRD 前推荐时不希望低质量噪音）。

---

## list — 列出知识库

遍历 6 个子目录，统计 .md 文件（排除 README.md）：

```
产品知识库

  patterns/    {N}  设计模式
  decisions/   {N}  决策记录
  pitfalls/    {N}  踩坑记录
  metrics/     {N}  度量指标
  playbooks/   {N}  场景手册
  insights/    {N}  洞察报告

共 {总计} 条
```

空分类显示 `（暂无）`。

---

## sync — 从项目提取知识

1. 从 `output/projects/` 读取最近修改的项目目录
2. 读取以下文件（如存在）：
   - `02-analysis-report.md` → 提取用户画像/痛点描述
   - `04-user-stories.md` → 提取典型用户故事场景
   - `05-prd/05-PRD-v1.0.md` → 提取技术决策/设计原则
   - `08-review-report-v*.md` → 提取评审发现的问题
3. 生成候选知识点列表：
```
「{项目名}」发现 {N} 个可沉淀知识点：

  1  渐进式引导设计      → patterns/   （用户故事）
  2  REST vs GraphQL 决策 → decisions/  （PRD）
  3  数据权限性能问题    → pitfalls/   （评审报告）

序号选择，all 全选，回车跳过
```
4. 用户确认后对每条执行 add 流程（已知字段自动填入，只问缺失项）

---

## Anti-Pattern

- 不存储敏感信息（账号、内部数据、客户隐私）
- 不存储项目特定业务逻辑，只存可复用通用经验
- search/suggest 无匹配时不显示"没有找到"，静默即可
- add 流程不一次性问完所有问题，逐步引导

---

## suggest — 主动推荐规范（ai-pm Phase 5 调用）

### 调用方式

**Phase 5 自动调用（主要场景）**：
```
suggest {需求关键词列表}
```
由 ai-pm Phase 5 在 PRD 生成前自动触发。

**用户直接调用**：
```
/ai-pm knowledge suggest {关键词}
```
手动查询知识库相关推荐。

---

关键词提取规则：从 `01-requirement-draft.md` 中提取：
- 业务领域名词（如：考试、权限、发布、成绩）
- 角色名词（如：教师、管理员、学生）
- 操作动词（如：发布、查看、导出、配置）

提取 3–6 个关键词，用空格分隔传入。

### 搜索逻辑

```bash
# 逐个关键词在知识库中搜索，合并去重结果
grep -r "{keyword}" templates/knowledge-base/ --include="*.md" -l 2>/dev/null
```

**默认过滤规则**（与 search 一致）：

排除 `auto-generated: true` AND `confidence: low` 的卡片。手写卡片或已被 PM promote 到 medium/high 的 auto 卡片仍会出现。

### 推荐展示（最多 3 条）

按以下优先级排序并截取：
1. `pitfalls/`（踩坑记录）— 优先级最高
2. `patterns/`（设计模式）— 次高
3. `decisions/`（决策记录）— 辅助参考

展示格式：

```
📚 知识库推荐（基于关键词：{词1}、{词2}）

① [{类型}] {标题}
  {问题/场景一句话}
  → {给 PRD 的提示，不超过 30 字}

② ...

[查看详情] [跳过，直接生成 PRD]
```

- 用户选「查看详情」→ 逐条展示完整知识卡片内容后，继续 Plan Mode
- 用户选「跳过」或无相关知识 → 静默进入 Plan Mode 前置展示

### 无匹配时

搜索结果为空 → 静默跳过，不输出任何提示（避免噪音）

---

## review-low — 批量审阅自动卡片

### 列出所有 auto-generated + low 卡片

```bash
find templates/knowledge-base -name '*.md' -exec grep -l 'auto-generated: true' {} \;
```

按 category 分组展示：

```
本月自动生成 14 张待 review 卡片：

[1] PITFALL: filter-repo 拒绝 untracked  源:95603cf1  pitfalls/
[2] PITFALL: force-with-lease stale       源:95603cf1  pitfalls/
[3] PATTERN: memory 索引拆分原则          源:abc12345  patterns/
...

可用操作：
  promote-high 1,2,5      # 升 confidence=high
  promote-medium 3,4      # 升 medium
  drop 6                  # 删除
  merge 5,6 → 6           # 合并：5 删除、其验证数据合并到 6
  skip                    # 暂不处理
  all-promote-medium      # 全部升 medium
  all-drop                # 全清
```

### 操作实现

| 操作 | 实现 |
|------|------|
| promote-high N | sed 改对应卡片的 `confidence: low` → `confidence: high` |
| promote-medium N | 同上，改为 medium |
| drop N | rm 对应卡片 |
| merge A,B → B | 把 A 的"验证数据"段 cat 到 B 末尾，rm A |

---

## cleanup-auto — 清理自动卡片

调用：`bash scripts/cleanup-auto-cards.sh [模式]`

| 模式 | 用途 |
|------|------|
| `--all-drop` | 紧急回滚——全删 auto-generated 卡片（含交互确认）|
| `--archive-stale [天数]` | 归档 N 天（默认 7）未修改的 auto+low 卡片到 `.archived/` |
