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
| `review-low` | 批量管理 auto-generated 卡片（质量门：升级/合并/删）|
| `review-stale` | 超龄 state 卡 AI 分诊（安全网，只显式调用；AI 自动核实，只把残差升给你）|
| `cleanup-auto` | 清理 / 归档 auto 卡片（紧急回滚 + 日常维护）|
| 无参数 | 执行 list |

---

## 运行原则（静默护栏）

知识库的治理（保鲜、退役、复核）必须**自动化优先、用户只兜残差**，且**绝不打断进行中的对话**。三条铁律压在所有命令之上：

1. **静默护栏**：任何自动 / 治理动作都不得打断或刷屏用户正在进行的操作。耗时的执行（复核分诊、批量核实）**只在用户显式调用知识命令时**发生；自动路径（stop-hook 排队、写入时退役）必须**静默、亚秒级、零额外输出**——做不到就不做。
   - ⛔ 反面教材：对话进行中突然长时间跑沉淀、把对话刷上去——这是抢用户话筒，禁止（2026-07-13 前的 stop-hook block 模式即此病，已改排队制）。
   - **pending 队列消费**：`sync` / `add` 开工前先读 `~/.ai-pm/knowledge/pending.jsonl`（stop hook 静默排队的候选区间），逐条按 transcript+消息水位读增量对话做沉淀（判断标准与 auto 模式一致），处理完把已消费行清出队列——协议单源 = CLAUDE.md §知识沉淀Hook。
2. **退役自动、保鲜随手**：知识过期不该是用户专门做的事，而是两件本就发生的事的副产品——写新知识时顺手让旧的退役（见 add/sync）、显式核实过源时顺手刷 `last-verified`。用户专门去"复核一批卡"应是**极少触发的安全网**，不是例行苦差。
3. **signal 可信 > 堆机制**：`last-verified` 只代表"确认仍成立"，**绝不能因为被检索 / 展示就刷新**（那会让陈旧卡冒充新鲜，污染整个系统赖以存在的信号）。只有 AI 真的对着当前代码 / PRD / 文件核实过，才允许刷。

---

## 知识分类

| 目录 | 类型 | 说明 |
|------|------|------|
| `chains/` | 牵动链 | 某场景改动牵到下游哪些功能（重关联、轻数值，给没经验的 PM 主动提醒）。老手深挖后顺手收、有自己的格式，**不走标准 add 模板**；suggest 里优先级最高 |
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
last-verified: {YYYY-MM-DD}        # 最后一次确认仍成立；新建时 = created。复核时刷新
confidence: low
auto-generated: false              # auto 模式必填 true
auto-dedup-key:                    # auto 模式必填，核心概念-动词
superseded-by:                     # 被新卡取代时填新卡 ID（如 INSIGHT-030）；默认空
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

### 写入时退役检查（add / sync 通用，静默）

有意识写卡时（用户调 `add` 或确认 `sync` 候选），AI 在已有的同 category 去重扫描里**顺带**判断：本卡是否**明确取代**某一张**可指认的**旧卡（不是补充、不是相邻话题，是"同一问题的结论被本卡推翻"）。

- **明确取代单张旧卡** → 静默把那张旧卡的 `superseded-by` set 为本卡 ID（旧卡自此 search/suggest 默认不出，`--include-superseded` 可追溯）；在「已保存」确认里**折叠一行**告知，不另起流程、不弹清单。
- **模糊 / 拿不准 / 像是取代多张** → **两张并存，不动**。退役是可逆软隐藏，但仍按"宁可并存"处理，误判交给 review-stale 安全网。
- ⚠️ 此步必须是**亚秒级的轻量 grep 判断**，做不到就跳过——不得为找取代关系拖慢用户正在做的 add/sync（静默护栏）。

完成后确认（有退役时多折叠一行）：
```
已保存 {ID}  {标题}
→ templates/knowledge-base/{分类}/{文件名}
{若有退役：↳ 已标记 {旧ID}「{旧标题}」被本卡取代（--include-superseded 可追溯）}
```

### auto 模式（hook 触发时使用）

当 hook 触发让 AI 自动写卡片时，AI 必须传以下额外字段：

| 字段 | 说明 |
|------|------|
| `confidence: low` | 自动生成默认低置信度 |
| `auto-generated: true` | 标记为 hook 触发产生 |
| `source-session: {前8位}` | 哪次会话产生的（来自 hook stdin 的 session_id） |
| `last-verified: {created}` | auto 模式下 = created；后续复核（`review-stale`）时刷新 |
| `auto-dedup-key` | 跨次去重 key，由 AI 生成（核心概念-动词，如 `filter-repo-untracked`、`force-with-lease-stale`） |

**新建前必须做的去重检查**：

1. 提取候选卡片的 title + 前 200 字描述
2. 在 `templates/knowledge-base/{同 category}/` 下用 `grep -ri` 查相似 title
3. 如果 `auto-dedup-key` 已存在 → **不新建**，把当前对话的"验证数据"段追加到旧卡末尾
4. 否则正常新建

**hook 路径不做退役判断**（静默护栏）：30 秒无人监督、预算又紧的自动沉淀，**只做 dedup-key 去重、不做"取代旧卡"判断**——退役会软隐藏卡片，不能在没人看着时发生。真正的退役留给有意识的 `add` / `sync`（写入时退役检查）和 `review-stale` 安全网去抓。

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
last-verified: 2026-05-05          # auto 模式 = created
confidence: low                    # auto 模式默认 low
auto-generated: true               # auto 模式必填
auto-dedup-key: filter-repo-untracked  # auto 模式必填，核心概念-动词
superseded-by:                     # 默认空；被取代时填新卡 ID
---
```

---

## search — 搜索知识

1. 在 `templates/knowledge-base/` 递归搜索包含关键词的 .md（排除 README.md）
2. 匹配范围：文件名、frontmatter tags/id、标题行、问题场景段落
3. 有匹配时展示（最多 5 条），每条带**时效标记**（见下方「时效性标记」）：
```
{N} 条相关知识：

  1  [PATTERN-001]  渐进式功能引导
     patterns  |  mobile, onboarding  |  ⚠️ 94 天未复核（2026-03-01）
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

## 时效性标记（search / suggest 共用）

检索结果展示时，对每条命中卡片算 `age = today − last-verified`，按下表在该卡尾部追加标记：

| 条件 | 展示标记 |
|------|---------|
| `age ≤ 90 天` | 不标（视为新鲜） |
| `age > 90 天`，**state 类**（pitfalls/decisions/insights）| `⚠️ {age} 天未复核（{last-verified}）`——会烂的知识，催复核 |
| `age > 90 天`，**technique 类**（patterns/metrics/playbooks）| `· {age} 天前`——中性显龄，**不带 ⚠️、不催办**（方法管用就一直管用）|
| `last-verified` 缺失（改造前旧卡） | 回退用 `created` 算 age；`created` 也缺 → `· 龄未知` |

**`superseded-by` 非空的卡片**：search / suggest **默认不出**（已被取代）；仅在 `search {词} --include-superseded` 追溯时展示，并标 `⛔ 已被 {新卡ID} 取代`。

### last-verified 刷新纪律（signal 可信第一）

`last-verified` 只有一个含义：**最后一次确认仍成立**。

- ✅ **只在 AI 真的对着当前代码 / PRD / 文件核实过该卡结论时**才允许刷新（含 review-stale 档 1、edit 落盘、显式核源后）。
- ⛔ **绝不因为卡片被检索命中 / 被展示 / 被读取就刷新**——那会让陈旧卡冒充新鲜，污染整个信号。展示≠核实。

### 被动触发器（一行，可无视）

search / suggest 跑完后，若**本次结果里**超过 **3 张 state 卡（pitfalls/decisions/insights）超龄**，在结果末尾挂**一行**提示，不弹清单、不强制动作、不触发任何执行：

```
（本次结果含 5 张超龄 state 卡，想集中清理可跑 /ai-pm knowledge review-stale）
```

- 只对 state 类计数；technique 类（patterns/metrics/playbooks）超龄只在该卡尾部显龄、**不计入触发、不催办**（方法管用就一直管用）。
- 这是安全网唯一的"提醒"入口——让偶尔触发的 review-stale 有人记得跑，但绝不升级成唠叨（静默护栏）。

> 90 天是动态衰老线，不是硬过期日——超龄只**暴露年龄、不删卡**。处置走 `review-stale`（AI 分诊、只升残差），日常退役靠写入时自动。判断类（pitfalls/decisions/insights）悄悄过期最危险，是催办的唯一对象。

---

## list — 列出知识库

遍历 7 个子目录，统计 .md 文件（排除 README.md）：

```
产品知识库

  chains/      {N}  牵动链
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
   - 当前 PRD（`05-prd/<当前 PRD 文件>`）→ 提取技术决策/设计原则
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

排除 `auto-generated: true` AND `confidence: low` 的卡片，以及 `superseded-by` 非空（已被取代）的卡片。手写卡片或已被 PM promote 到 medium/high 的 auto 卡片仍会出现。命中卡片按「时效性标记」section 算龄展示。

### 推荐展示（最多 3 条）

按以下优先级排序并截取：
1. `chains/`（牵动链）— **优先级最高**：当前改动会牵到哪些下游功能，没经验的 PM 最需要先看到（漏掉牵连＝事故）
2. `pitfalls/`（踩坑记录）
3. `patterns/`（设计模式）
4. `decisions/`（决策记录）

展示格式：

```
📚 知识库推荐（基于关键词：{词1}、{词2}）

① [{类型}] {标题}   {超龄时：⚠️ {age} 天未复核}
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

> review-low 管**质量**（auto+low 该不该留），review-stale 管**年龄**（旧卡还成不成立）。两者互补，不互相替代。

---

## review-stale — 超龄卡片 AI 分诊（安全网）

**永不自动跑**，只在用户显式 `/ai-pm knowledge review-stale` 时执行（静默护栏：耗时复核不抢进行中对话）。定位是**极少触发的安全网**——日常退役靠写入时自动、保鲜靠显式核源，这条只兜两者漏掉的残值。

### 只盯 state 类卡（不催 technique 类）

| 类别 | 卡 | 会不会烂 | review-stale |
|------|-----|---------|-------------|
| **state（状态类）** | pitfalls / decisions / insights | 会——随产品状态/版本变化失效 | **纳入分诊** |
| **technique（技法类）** | patterns / metrics / playbooks | 多半不会——方法管用就一直管用 | 只被动显龄，**不催办** |

### 第一步：脚本确定性出清单（不调模型）

算龄、过滤、排序、出清单是**纯确定性活，零判断、零 token**，由脚本做，**不靠模型逐张算龄**：

```bash
scripts/review-stale-list.sh [阈值天数=90]    # 出超龄 state 卡清单（按龄降序）
scripts/review-stale-list.sh 90 --all         # 附带 technique 类（中性显龄、不催办）
```

筛选规则（脚本已实现）：state 类（pitfalls/decisions/insights）+ `age > 阈值`（缺 `last-verified` 回退 `created`，都缺标"龄未知"）+ `superseded-by` 为空 + 排除 `auto-generated:true AND confidence:low`（未提升的 auto 卡归 `review-low` 质量门，不进年龄门）。这样清单 = review-stale 处理范围 = search/suggest 可见集，与被动触发器计数一致。

AI 拿到这份清单后，才进入下一步分诊。

### AI 先分诊，只把残差升给用户

不再列卡让用户逐条选。AI 对筛出的每张卡**自己先判一遍**，分三档处理：

1. **能核实 + 仍成立**（对着当前代码/PRD/文件核得动，结论没变）→ **AI 自动刷新 `last-verified` = today**，不打扰用户。
2. **能核实 + 已失效**（结论被现状推翻）→ AI 备好处置建议（指向取代它的新卡 / 该改成什么 / 该删），**列入待确认清单**。
3. **AI 核不动**（纯判断、依赖外部事实、需要用户拍板）→ **列入待确认清单**，标"需你判断"。

呈现给用户的只有一份**精简清单**（档 1 不出现，已自动处理）：

```
review-stale 跑完：14 张超龄 state 卡，AI 自动确认仍成立 11 张（已刷新）。
剩 3 张需你定：

[1] DECISION-004 PRD 目录统一            AI：现状已不符 → 建议改/或被 DECISION-009 取代
[2] PITFALL-016  filter-repo 拒绝 untracked  AI：仍复现 → 建议 ok（你确认即可）
[3] INSIGHT-007  某场景用户偏好            AI：核不动（依赖外部判断）→ 需你定

  ok N / super N→{ID} / edit N / drop N / skip
```

### 操作实现

| 操作 | 实现 |
|------|------|
| 档 1 自动刷新 | AI 核实后 sed 改 `last-verified:` 为 today（无该行的旧卡在 `created:` 后插一行）；汇总成一句"自动确认 N 张"，不逐条刷屏 |
| ok N | 用户确认仍成立 → sed 刷 `last-verified` = today |
| super N → {ID} | sed 改 N 的 `superseded-by:` 为 {ID}；N 自此 search/suggest 默认不出，仅 `--include-superseded` 追溯 |
| edit N | 走 add 的逐步引导改内容，落盘后刷 `last-verified` |
| drop N | rm 对应卡 |

> 关键：AI 能核的自己核掉（档 1），用户只面对"AI 拿不准 + 已失效"的少数残差。建议某项目状态大改后手动跑一次，平时不用管——被动触发器（见「时效性标记」）会在 state 卡堆积时提醒。

### 未来形态（书面意图，暂不实现）

当前「AI 分诊」由主 agent 串行做，够用。**待真实跑过几轮、确认规模与可核实比例后**，再考虑下面这套三层架构——别在没数据前投机实现（避免过度工程）：

| 层 | 干什么 | 触发 |
|----|--------|------|
| **脚本（已实现）** | 算龄/过滤/排序/出清单、写 `superseded-by`、刷时间戳——零判断的确定性活 | `review-stale-list.sh` |
| **subagent（暂不建）** | 不可省的仓库判断：「对当前源该结论还成立吗」「X 真取代 Y 吗」——隔离、并行、返回结构化裁决 | 仅清单很大（如 >30 张）时 fan-out；≤几张主 agent inline 即可 |
| **主 agent** | 对话判断（录入/萃取，subagent 缺上下文做不了）+ 不可逆处置（`drop` 最终拍板） | 始终 |

**可核实前提（卡住自动化上限）**：一张卡能被 subagent 自动核实，前提是它带**机器能跟着走的真值源指针**（如某 PRD/代码路径）。从某 PRD 长出的卡可核；"某工作流的坑"这类无源可对 → 永远只能升给用户判断。想扩大可自动核实集合，唯一办法是给卡加**可选** `verify-against:` 指针字段——新 schema，**标记在此、不强推**。

**安全纪律**：subagent 的任何自动退役都记一行可 grep 的日志，判错一遍批量回滚（同"删前 grep 互链"纪律）；可逆操作（supersede/刷新）可自治，不可逆（drop）必升用户。

---

## cleanup-auto — 清理自动卡片

调用：`bash scripts/cleanup-auto-cards.sh [模式]`

| 模式 | 用途 |
|------|------|
| `--all-drop` | 紧急回滚——全删 auto-generated 卡片（含交互确认）|
| `--archive-stale [天数]` | 归档 N 天（默认 7）未修改的 auto+low 卡片到 `.archived/` |
