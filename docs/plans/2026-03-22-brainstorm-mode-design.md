# 头脑风暴模式设计

> 日期：2026-03-22
> 状态：已确认（经多视角审视修订）

---

## 一、目标

为客户端阶段页面增加「先聊聊」模式，用户可在 AI 生成产出物之前与 AI 多轮对话讨论需求，讨论充分后带着对话上下文生成产出物。

## 二、交互模型

### 模式切换

- 形态：Segmented Control（两段式切换器），放在布局层（PhaseShell 组件），一处实现
- 名称：**「直接生成」** | **「先聊聊」**
- 位置：阶段页面标题右侧
- 样式：圆角胶囊形、滑块动画、高度 32px

### 开放阶段

仅以下 3 个阶段显示切换器：
- 需求分析（analysis）
- 用户故事（stories）
- PRD 撰写（prd）

其余阶段不显示（不适合头脑风暴或无常规生成模式）。

### 首次使用引导

第一次切换到「先聊聊」时，Onboarding Tooltip 指向生成按钮，说明：
1. 和 AI 讨论你的想法
2. 讨论成熟后点生成
3. 对话会保留，随时可回来继续

localStorage 标记不再显示。

## 三、对话 UI

### 布局

切换到「先聊聊」后，当前阶段的内容区替换为聊天界面（非侧边栏、非叠加）。

### 聊天界面结构

```
┌─ Segmented Control: [直接生成] [先聊聊] ────┐
│                                              │
│  ┌─ 消息列表 (role="log" aria-live) ────┐   │
│  │ AI: 你希望这个功能解决什么核心问题？   │   │
│  │ 用户: 老师阅卷效率太低...             │   │
│  │ AI: 明白，那有两个方向...             │   │
│  │ [卡片] 讨论充分了，可以开始生成 PRD   │   │
│  │         [开始生成] [继续讨论]          │   │
│  └────────────────────────────────────────┘   │
│                                              │
│  [AI 回复中...] [停止生成]                   │
│  ┌──────────────────────────── [发送] ┐      │
│  │ 输入你的想法...                     │      │
│  └─────────────────────────────────────┘      │
│                                              │
│  ──────────── [生成 PRD] ─────────────       │
└──────────────────────────────────────────────┘
```

### 消息渲染

- AI 回复：`font-serif`（Lora），流式输出，末尾 `|` 闪烁光标（blink 动画）
- 用户消息：`font-sans`（GeistSans）
- AI 回复前：thinkingPulse 动画

### AI 回复中状态

- 输入框可用但发送按钮禁用
- 显示「AI 回复中...」+ 「停止生成」按钮（ghost 样式）
- 消息区域 `aria-busy="true"`

### 生成衔接

- 底部固定「生成 {产出物名}」按钮，始终可见（primary 样式）
- AI 适时提议生成，渲染为结构化卡片（「开始生成」+「继续讨论」两个按钮）
- AI 提议由 system prompt 中的规则触发（至少 3 轮 + 核心需求已明确）
- 固定按钮和卡片按钮触发同一逻辑
- AI 回复中「生成」按钮禁用

### 滚动策略

- 底部附近（< 100px）：新消息自动滚到底部
- 回看历史（> 100px）：不自动滚，浮现「新消息 ↓」pill 按钮
- 滚动条隐藏（Apple 风格）

### 空状态

居中图标（对话气泡）+ 引导语「和 AI 聊聊你对这个阶段的想法」+ 2-3 个快速提示词 chip（按阶段动态）：
- 需求分析：「产品要解决什么问题？」「目标用户是谁？」
- 用户故事：「有哪些核心场景？」「用户最关心什么？」
- PRD：「核心功能有哪些？」「有什么技术约束？」

### 错误态

- AI 回复失败：消息位置显示错误卡片（红色左条 + 重试按钮）
- 对话过长（超 50 轮）：AI 提示「对话较长，建议生成产出物后开启新对话」

### 对话保留标记

- 切换到「直接生成」模式时，对话保留不丢失
- 「先聊聊」按钮旁显示蓝色小圆点 + 数字（如有历史对话）
- 侧边栏对应阶段显示「进行中对话」标记

## 四、技术架构

### 流式调用

复用现有 `AiProvider::stream`，不新建非流式路径。头脑风暴和常规生成只靠 system prompt 差异区分。

### 事件通道隔离

`stream_chunk` payload 从纯文本改为：
```json
{ "streamKey": "brainstorm:projectId:phase", "text": "..." }
```
前端按 streamKey 过滤。`stream_done` 和 `stream_error` 同样携带 streamKey。

### 对话存储

```sql
CREATE TABLE IF NOT EXISTS brainstorm_messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    seq INTEGER NOT NULL
);
CREATE INDEX idx_bs_proj_phase ON brainstorm_messages(project_id, phase, seq);
```

### 后端新增命令

- `brainstorm_chat` — 接收 projectId + phase + messages，构建 system prompt（含前序产出物 + 知识库 + 头脑风暴引导规则），调用 AiProvider::stream
- `load_brainstorm_messages` — 按 projectId + phase 加载历史对话
- `save_brainstorm_message` — 保存单条消息
- `clear_brainstorm` — 按 projectId + phase 清除对话

### 对话生命周期

- 实时写入 SQLite，刷新/切换后自动恢复
- 提供「清空对话」按钮
- 重新生成时提示是否同时清除对话
- 超 50 轮引导生成或清除

### 对话衔接生成

- 短对话（≤10 轮）：完整对话拼为 `### 头脑风暴讨论记录` 注入 `build_system_prompt`
- 长对话（>10 轮）：先用一次轻量 AI 调用生成结构化摘要，再注入

### Context Window 管理

- token 预算：system prompt ≤30K，对话历史 ≤100K，输出预留 16K
- 粗估：中文 1 字 ≈ 1.5 token
- 超限时滑动窗口：保留首轮 + 最近 N 轮，中间轮次截断

### 前端架构

- 布局层新增 `<PhaseShell>` 组件：统一处理模式切换 + 聊天 UI 渲染
- 新建 `useBrainstorm(projectId, phase)` hook：对话历史加载/保存 + 流式响应
- 新建 `BrainstormChat` 组件：消息列表 + 输入框 + 生成按钮
- 与 `InlineChat` 明确区分（InlineChat 继续服务阶段内 AI 澄清问答）
- 消息列表惰性加载，超长时虚拟滚动

### 可访问性

- 消息列表 `role="log"` + `aria-live="polite"`
- Segmented Control 用 `role="radiogroup"` + `aria-checked`
- 切换到「先聊聊」后自动 focus 输入框
- AI 回复中 `aria-busy="true"`

## 五、实施优先级

| 优先级 | 任务 |
|--------|------|
| P0 | 事件通道隔离（streamKey）— 基础设施改造 |
| P1 | 对话存储（SQLite 表 + CRUD 命令） |
| P2 | brainstorm_chat 命令（流式 + system prompt） |
| P3 | PhaseShell + BrainstormChat 前端组件 |
| P4 | 对话衔接生成（摘要注入） |
| P5 | 首次引导 + 空状态 + 错误态 |
