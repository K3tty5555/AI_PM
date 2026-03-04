---
name: ai-pm-knowledge
description: >-
  产品知识库管理技能。沉淀产品方法论、设计模式、决策记录，
  支持跨项目经验复用。自动提取项目中的关键决策、设计模式、
  踩坑记录，构建可检索的产品知识图谱。
argument-hint: "[search|add|list|sync|suggest] [关键词或内容]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(find) Bash(grep) Bash(cat)
---

# 产品知识库管理

## 知识库根目录

`templates/knowledge-base/`

## 命令路由

根据 $ARGUMENTS 第一个词路由：

| 命令 | 执行逻辑 |
|------|---------|
| `add` | → 执行「添加知识」流程 |
| `search {词}` | → 执行「搜索知识」流程 |
| `list` | → 执行「列出知识」流程 |
| `sync` | → 执行「同步项目知识」流程 |
| `suggest {词}` | → 执行「推荐相关知识」流程 |
| 无参数 | → 显示知识库概况 |

---

## 无参数：显示概况

运行 `list` 流程，展示知识库整体统计。

---

## 添加知识（add）

逐步问，每次只问一个：

**Step 1** — 分类：
```
类型？
  1  设计模式  — 可复用方案
  2  决策记录  — 为什么选 A 不选 B
  3  踩坑记录  — 坑在哪，怎么躲
  4  度量指标  — 指标模板
  5  场景手册  — 特定场景怎么做
  6  洞察报告  — 用户/市场发现
```
映射：1→patterns，2→decisions，3→pitfalls，4→metrics，5→playbooks，6→insights

**Step 2** — 标题（一句话）

**Step 3** — 问题场景（什么情况下遇到的）

**Step 4** — 解决方案

**Step 5** — 验证数据（没有就写"待验证"）

**Step 6** — 适用范围（什么产品/阶段）

收集完毕后：
1. 生成唯一 ID：统计目标分类目录下现有文件数 +1，格式 `{CATEGORY_UPPER}-{序号三位}`（如 PATTERN-001）
2. 生成 slug：标题转小写，空格换连字符
3. 写入文件：`templates/knowledge-base/{分类}/{id}-{slug}.md`

知识卡片模板：
```markdown
---
id: {ID}
category: {category}
tags: []
source-project:
created: {今天日期 YYYY-MM-DD}
confidence: low
---

# {标题}

## 问题场景
{场景描述}

## 解决方案
{解决方案}

## 验证数据
{数据或"待验证"}

## 适用场景
{适用范围}
```

完成后确认：
```
已保存 {ID}  {标题}
→ templates/knowledge-base/{分类}/{文件名}
```

---

## 搜索知识（search {关键词}）

1. 在 `templates/knowledge-base/` 下递归搜索包含关键词的 .md 文件（排除 README.md）
2. 匹配范围：文件名、frontmatter tags/id、标题行、问题场景段落
3. 有匹配时展示（最多5条）：
```
{N} 条相关知识：

  1  [PATTERN-001]  渐进式功能引导
     patterns  |  mobile, onboarding
     场景：用户首次使用复杂功能...

  2  ...

数字查看详情，回车跳过
```
4. 用户输入数字 → 输出完整知识卡片内容
5. 无匹配 → 静默

---

## 列出知识（list）

遍历 6 个子目录，统计 .md 文件（排除 README.md）数量：

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

某分类为空时显示 `（暂无）`。

---

## 同步项目知识（sync）

1. 从 `output/projects/` 获取当前项目名（读取最近修改的项目目录）
2. 读取以下文件（如存在）：
   - `02-analysis-report.md` → 提取目标用户/痛点描述段落
   - `04-user-stories.md` → 提取典型用户故事场景
   - `05-prd/05-PRD-v1.0.md` → 提取技术决策/设计原则段落
   - `08-review-report-v*.md` → 提取评审中发现的问题
3. 基于读取内容，生成候选知识点列表（每项标注来源文件和推荐分类）
4. 展示给用户选择：
```
「{项目名}」发现 {N} 个可沉淀知识点：

  1  渐进式引导设计  → patterns/  （用户故事）
  2  REST vs GraphQL 决策  → decisions/  （PRD）
  3  数据权限性能问题  → pitfalls/  （评审报告）

序号选择，all 全选，回车跳过
```
5. 用户确认后，对每条选中内容执行 `add` 流程（已知字段自动填入，只问缺失项）

---

## 推荐相关知识（suggest {关键词列表}）

由 Phase 5/8 内部调用，也支持直接命令调用。

1. 接收关键词列表（逗号分隔或空格分隔）
2. 在所有知识文件中匹配（文件名 + tags + 标题 + 问题场景）
3. 有匹配时展示（最多3条）：
```
{N} 条相关经验：

  1  [PATTERN-001]  渐进式功能引导  ← {关键词}
  2  ...

数字查看，回车跳过
```
4. 无匹配 → 静默

---

## Anti-Pattern

- 不存储含敏感信息的内容（账号、内部数据、客户隐私）
- 不存储项目特定的业务逻辑，只存可复用的通用经验
- search/suggest 无匹配时不展示「没有找到」，静默即可
- add 流程不要一次问完所有问题，逐步引导
