# AI PM Desktop — Context Integration & Dashboard Design

**Date:** 2026-03-17
**Status:** Confirmed

---

## Goal

两个功能一次迭代：

1. **Context Integration（上下文贯通）**：工具运行结果（访谈、数据分析）自动注入阶段生成，可见 context pills 支持临时排除。工具页可绑定项目。

2. **Dashboard 强化**：搜索 + 阶段迷你图。

---

## Architecture

### A — Context Integration

**工具→项目绑定流程：**
- Interview / Data 工具页顶部加「绑定项目」选择器
- 读取 `?projectId=` URL 参数（从侧边栏点击带入）或用户手动选择
- 绑定状态持久化到 localStorage（`tool-binding:<tool-name>`）
- 运行后输出保存到 `<output_dir>/context/<tool_name>-YYYY-MM-DD.md`
- 侧边栏 TOOLS 链接在项目页时携带 `?projectId=<id>`

**生成时 context 注入：**
- `build_system_prompt` 扫描 `<output_dir>/context/*.md`，注入所有未被排除的文件
- `StartStreamArgs` 新增 `excluded_context: Option<Vec<String>>`（文件名列表）
- context 文件作为 `### 工具上下文` 块注入，位置在知识库之后、项目上下文之前

**Context Pills UI：**
- 显示在阶段页 Badge header 下方（常驻，无 context 文件时整行隐藏）
- 每个 context 文件一个 pill：`[ INTERVIEW 03-17 × ]`
- 知识库条目单独一个 pill：`[ 知识库 · 3条 ]`（无 ×，知识库不支持单条排除）
- × 临时排除（组件 state，不持久化）
- hover 显示文件前 ~200 字预览 tooltip
- ContextPills 组件向上传递 `excludedContext: string[]`，phase 页面传给 `start()`

### B — Dashboard

**搜索：** 项目列表上方输入框，纯前端 filter 项目名。

**阶段迷你图：** 每张卡片底部 7 个小六边形，filled = 已完成，outline = 待完成。
需要 `list_projects` 响应新增 `completedPhases: string[]`（已完成阶段名数组）。

---

## New Tauri Commands / Updates

| 变更 | 说明 |
|------|------|
| 新增 `list_project_context` | 扫描 `<output_dir>/context/*.md`，返回 `Vec<{ name, preview }>` |
| `run_tool` 新增 `project_id` | 可选；有值时保存到项目 context 目录 |
| `start_stream` 新增 `excluded_context` | 传给 `build_system_prompt` 跳过对应文件 |
| `list_projects` 新增 `completed_phases` | 已完成阶段名数组，供迷你图使用 |

---

## Components Touched

**Created:**
- `app/src/components/context-pills.tsx` — pills 行组件
- `app/src/components/project-selector.tsx` — 工具页项目绑定选择器

**Modified:**
- `app/src-tauri/src/commands/files.rs` — 新增 `list_project_context`
- `app/src-tauri/src/commands/tools.rs` — `RunToolArgs` 新增 `project_id`
- `app/src-tauri/src/commands/stream.rs` — context 文件注入逻辑
- `app/src-tauri/src/commands/projects.rs` — `list_projects` 返回 `completedPhases`
- `app/src-tauri/src/lib.rs` — 注册新命令
- `app/src/lib/tauri-api.ts` — 类型更新
- `app/src/hooks/use-ai-stream.ts` — `start()` 接受 `excludedContext`
- `app/src/hooks/use-tool-stream.ts` — 新增 `projectId` 参数
- `app/src/pages/tools/Interview.tsx` — 加 ProjectSelector
- `app/src/pages/tools/Data.tsx` — 加 ProjectSelector
- `app/src/components/layout/Sidebar.tsx` — TOOLS 链接带 projectId
- `app/src/pages/project/*.tsx`（6 个阶段页） — 加 ContextPills
- `app/src/pages/Dashboard.tsx` — 搜索 + 迷你图

---

## Out of Scope

- context pills × 排除持久化到后端
- 知识库条目在注入时的搜索/筛选
- Priority / Weekly / Persona 工具的项目绑定
- 从 UI 删除 context 文件
