# 知识库自动沉淀与智能推荐设计

> 日期：2026-03-22
> 状态：已确认

---

## 一、目标

为客户端知识库新增三项能力：

1. 项目完成后自动沉淀知识（AI 提取候选 + 用户确认）
2. PRD 撰写前自动推荐相关知识
3. 评审前自动提醒踩坑经验

## 二、前置修复（P0）

### 知识库路径不一致 bug

- `stream.rs` 的 `load_knowledge` 读取 `{config_dir}/knowledge/`
- `knowledge.rs` 的 CRUD 读写 `{templates_base}/knowledge-base/`
- 两个不同目录，导致 UI 添加的知识未被注入 AI prompt

**修复**：统一到 `{templates_base}/knowledge-base/`，修改 `stream.rs` 中 `load_knowledge` 的路径。

## 三、后端新增命令

### 1. `recommend_knowledge`

推荐相关知识条目，PRD 前和评审前共用。

```
输入: { projectId: String, timing: "before_prd" | "before_review" }

逻辑:
  1. 读取 02-analysis-report.md，提取标题和各级 heading 文本作为关键词
  2. 遍历所有 KnowledgeEntry（复用 list_knowledge 逻辑）
  3. 对 title 和 content 做关键词匹配，计算简单相关度分数
  4. timing == "before_review" 时，pitfalls 和 decisions 分类分数 x2
  5. 按分数降序，返回前 10 条
  6. 若 02-analysis-report.md 不存在，返回空列表（优雅降级）

返回: Result<Vec<KnowledgeEntry>, String>
特点: 纯规则匹配，不调 AI，毫秒级响应
```

### 2. `extract_knowledge_candidates`

AI 从项目产出物中提取可沉淀的候选知识点。

```
输入: { projectId: String }

逻辑:
  1. 读取 3 份产出物：
     - 05-prd/05-PRD-v1.0.md（必须存在，否则返回错误）
     - 08-review-report.md（可选，有就注入）
     - 10-retrospective.md（可选，有就注入）
  2. 拼装 prompt，要求输出 JSON 数组（3-5 条候选）
  3. 用 reqwest 做非流式 API 调用（不走 AiProvider trait，不占 stream 通道）
  4. CLI 模式走 claude --print，取 stdout 解析
  5. 解析 JSON，容错处理（trim + 提取 [ ] 区间 + serde 反序列化）

返回: Result<Vec<KnowledgeCandidate>, String>
```

数据结构：

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCandidate {
    pub category: String,   // patterns | decisions | pitfalls | ...
    pub title: String,
    pub content: String,
    pub source: String,     // "PRD" | "评审报告" | "复盘总结"
}
```

### 3. `batch_add_knowledge`

不新增。前端循环调用现有 `add_knowledge` 即可。

## 四、前端交互

### 1. 自动沉淀弹窗

**触发时机**：复盘阶段（retrospective）标记 completed 后自动弹出。

**交互流程**：

```
复盘完成
  -> 弹窗 loading 态: spinner + "正在分析项目产出物..."
  -> 收到候选列表
  -> 渲染为可勾选卡片列表（默认全选，opt-out 模式）
  -> 用户可取消不想要的、可展开编辑 title/content
  -> 点「保存选中」-> 循环调 add_knowledge -> Toast 成功提示
  -> 点「跳过」-> 关闭弹窗，不再提醒
```

**视觉规范**：

- 弹窗：Dialog 组件（遮罩 + backdrop-blur + rounded-xl + shadow-xl）
- 每条候选：Card 样式，左侧 Badge 标分类（彩色区分）
  - pitfalls -> warning 色（橙）
  - decisions -> accent 色（蓝）
  - patterns -> success 色（绿）
  - 其他 -> default（灰）
- 来源标注：每条底部淡色文字，如「提取自评审报告 · Critical 问题」
- 勾选：左侧 checkbox，默认全选
- 展开编辑：点击条目展开，title 和 content 变为可编辑输入框
- 按钮区：右对齐，ghost「跳过」+ primary「保存选中」

### 2. PRD 前推荐卡片

**触发时机**：进入 PRD 页面且 PRD 未生成时。

**交互**：

- 调 `recommend_knowledge({ projectId, timing: "before_prd" })`
- 风格：info 变体（蓝色左条 3px），标题「相关知识」
- 每条显示 title + 分类 Badge + 可展开内容
- 可折叠，折叠状态按项目 ID 持久化到 localStorage
- 无匹配或需求分析未完成时不显示

### 3. 评审前提醒卡片

**触发时机**：进入评审页面且评审未生成时。

**交互**：

- 调 `recommend_knowledge({ projectId, timing: "before_review" })`
- 风格：warning 变体（橙色左条 3px），标题「历史踩坑提醒」
- pitfalls 和 decisions 条目排在前面
- 可折叠，折叠状态按项目 ID 持久化到 localStorage
- 无匹配或需求分析未完成时不显示

## 五、实施优先级

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 修复知识库路径不一致 | stream.rs load_knowledge 路径统一到 templates_base |
| P1 | extract_knowledge_candidates | 非流式 AI 调用，核心新功能 |
| P2 | recommend_knowledge | 纯规则实现，风险低 |
| P3 | 自动沉淀弹窗 UI | 依赖 P1 |
| P4 | PRD 前推荐 / 评审前提醒 UI | 依赖 P2，现有代码有基础 |

## 六、技术要点

- `extract_knowledge_candidates` 用 reqwest 非流式调用，不走 AiProvider trait，不占 stream 事件通道
- CLI 模式（ClaudeCliProvider）走 `claude --print`，取 stdout 解析 JSON
- AI 返回格式容错：trim -> 提取 `[` 到 `]` -> serde 反序列化 -> 失败返回有意义错误
- `recommend_knowledge` 纯规则匹配，不调 AI，毫秒级响应
- 知识库条目全量注入 AI prompt 的现有行为不变
