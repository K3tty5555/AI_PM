# 剩余修复项完整实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成审计中识别的全部 16 项未修复问题。

**Architecture:** 按优先级分 4 个 Phase：安全加固 → 知识库验证 → 前端质量 → 重构清理。每个 Phase 内部可并行的任务标注。

**Tech Stack:** Rust (Tauri v2), React/TypeScript, Tailwind CSS

---

## Phase 1：后端安全与代码质量（6 项）

### Task 1: delete_project 外键级联防护

**Files:**
- Modify: `app/src-tauri/src/commands/projects.rs` — `delete_project` 函数

**Step 1:** 找到 `delete_project` 函数中的 `DELETE FROM projects WHERE id = ?1`。在它之前加一行显式删除关联记录：

```rust
db.execute("DELETE FROM project_phases WHERE project_id = ?1", params![id])?;
db.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
```

**Step 2:** 验证 `cargo check`

**Step 3:** 提交 `git commit -m "fix: explicit cascade delete for project_phases"`

---

### Task 2: read_project_file / save_project_file 路径遍历防护

**Files:**
- Modify: `app/src-tauri/src/commands/files.rs` — `read_project_file` 和 `save_project_file`

**Step 1:** 读取 files.rs，找到现有的 `file_name.contains("..")` 检查。

**Step 2:** 替换为规范化路径验证：

```rust
// 替换现有的 contains("..") 检查
let full_path = std::path::Path::new(&output_dir).join(&file_name);
let canonical_base = std::fs::canonicalize(&output_dir)
    .map_err(|e| format!("无法解析项目目录: {e}"))?;
let canonical_path = if full_path.exists() {
    std::fs::canonicalize(&full_path)
        .map_err(|e| format!("无法解析文件路径: {e}"))?
} else {
    // 文件不存在时，规范化父目录 + 文件名
    let parent = full_path.parent()
        .ok_or("无效的文件路径".to_string())?;
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("无法解析父目录: {e}"))?;
    canonical_parent.join(full_path.file_name().unwrap_or_default())
};

if !canonical_path.starts_with(&canonical_base) {
    return Err("文件路径超出项目目录范围".to_string());
}
```

注意：`read_project_file` 需要允许子路径（如 `05-prd/05-PRD-v1.0.md`），所以不能简单拒绝 `/`。关键是验证最终路径仍在 output_dir 下。

**Step 3:** 对 `save_project_file` 做同样的修改。

**Step 4:** 验证 `cargo check`

**Step 5:** 提交 `git commit -m "security: canonicalize path validation for file read/write"`

---

### Task 3: open_file / reveal_file 路径校验

**Files:**
- Modify: `app/src-tauri/src/commands/files.rs` — `open_file` 和 `reveal_file`

**Step 1:** 找到这两个函数。添加路径校验——限制只能打开 projects_dir 或用户主目录下的文件：

```rust
let home = dirs::home_dir().unwrap_or_default();
let path = std::path::Path::new(&file_path);
if !path.starts_with(&home) {
    return Err("只能打开用户目录下的文件".to_string());
}
```

**Step 2:** 验证 `cargo check`

**Step 3:** 提交 `git commit -m "security: restrict open_file/reveal_file to user home directory"`

---

### Task 4: truncate_to_chars 优化

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs` — `truncate_to_chars` 函数

**Step 1:** 找到 `truncate_to_chars` 函数，替换为更简洁的实现：

```rust
fn truncate_to_chars(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}
```

**Step 2:** 验证 `cargo check`

**Step 3:** 提交 `git commit -m "refactor: simplify truncate_to_chars to single-pass"`

---

### Task 5: --dangerously-skip-permissions 评估与限制

**Files:**
- Modify: `app/src-tauri/src/providers/claude_cli.rs` — `ClaudeCliProvider::stream()`

**Step 1:** 读取 claude_cli.rs 的 stream 函数，理解各阶段的工具需求。

**Step 2:** 将 `--dangerously-skip-permissions` 改为按阶段白名单：

```rust
// 所有阶段都需要读文件，但不需要写文件或执行命令
.arg("--allowedTools")
.arg("Read,Grep,Glob")
```

注意：如果某些阶段（如原型生成）确实需要写文件能力，需要在 stream 函数中根据 phase 参数区分。先检查 stream 函数是否能获取到当前 phase 信息。如果拿不到 phase，就保持一个通用的安全白名单。

**Step 3:** 验证 `cargo check`，然后手动测试一个 PRD 生成流程确认不影响功能。

**Step 4:** 提交 `git commit -m "security: replace --dangerously-skip-permissions with allowedTools whitelist"`

---

### Task 6: 知识库搜索性能注释

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs` — `search_knowledge` 和 `list_knowledge_internal`

**Step 1:** 目前知识条目少，不需要改架构。在函数上方添加性能注释：

```rust
/// 全量扫描文件系统搜索知识条目。
/// 当前适用于 <500 条的小规模知识库。
/// 如果知识库增长到千级规模，应迁移到 SQLite 索引。
```

**Step 2:** 提交 `git commit -m "docs: add performance notes to knowledge search functions"`

---

## Phase 2：知识库功能验证（1 项）

### Task 7: 知识库三大功能端到端验证

**Files:** 无代码修改，纯验证

**Step 1:** 启动开发环境：`cd app && npx tauri dev`

**Step 2: 验证知识库路径修复**
1. 在知识库页面添加一条测试知识
2. 进入任意项目的 PRD 阶段，触发 AI 生成
3. 观察 console 日志，确认 AI prompt 中包含刚添加的知识条目

**Step 3: 验证推荐功能**
1. 确保知识库中有几条知识
2. 创建或进入一个已完成需求分析的项目
3. 进入 PRD 页面（未生成状态），检查「相关知识」面板是否出现
4. 进入评审页面（未生成状态），检查「历史踩坑提醒」面板是否出现
5. 验证可折叠、折叠状态刷新后保持

**Step 4: 验证自动沉淀**
1. 进入一个已完成 PRD + 评审 + 复盘的项目
2. 在复盘页面点完成
3. 检查沉淀弹窗是否弹出
4. 验证候选列表展示、默认全选、可取消、可编辑
5. 保存后检查知识库页面是否有新增条目

**Step 5:** 记录发现的问题，创建修复 commit（如有）。

---

## Phase 3：前端质量（5 项）

### Task 8: aria-label 补充（剩余 29 文件）

**Files:**
- 所有包含纯图标 `<button>` 的 .tsx 文件（排除已修复的 Dashboard/Sidebar/AppLayout/ActivityBar）

**Step 1:** 生成待补充文件列表：

```bash
grep -rn '<button' app/src/ --include="*.tsx" -l | sort
```

对比已修复的 4 个文件，逐文件检查：
- 按钮内部只有图标（SVG/lucide 组件），无文字
- 没有 `aria-label` 或 `title`

**Step 2:** 逐文件补充 aria-label。命名规则：用简短中文描述功能（"关闭"、"删除"、"展开"、"收起"等）。

**Step 3:** 验证 `tsc --noEmit`

**Step 4:** 提交 `git commit -m "a11y: add aria-labels to remaining icon buttons"`

---

### Task 9: 边界状态审计

**Files:**
- 审查所有页面级组件（`app/src/pages/` 和 `app/src/pages/project/`）

**Step 1:** 逐页面检查以下三种状态是否有对应的 UI 处理：

| 状态 | 检查方法 | 缺失时的修复 |
|------|----------|-------------|
| Empty state | 搜索 `length === 0` 或空数组条件渲染 | 添加引导文案 + 图标 |
| Loading state | 搜索 `loading` / `Loader2` / `Skeleton` | 添加 Skeleton 或 spinner |
| Error state | 搜索 `error` / `catch` 后的 UI 反馈 | 添加 Toast 或内联错误提示 |

**Step 2:** 整理问题清单，标注哪些页面缺少哪种状态处理。

**Step 3:** 逐页补充缺失的状态处理。优先使用项目已有的组件：
- Loading: `Skeleton` 组件（`components/ui/skeleton.tsx`）
- Empty: 参考 `PhaseEmptyState` 组件的模式
- Error: 使用 `useToast` hook

**Step 4:** 验证 `tsc --noEmit`

**Step 5:** 提交 `git commit -m "ux: add missing empty/loading/error states across pages"`

---

### Task 10: 文案一致性审计

**Step 1:** 提取所有按钮和操作文案：

```bash
grep -rn '>\(确定\|确认\|取消\|关闭\|保存\|删除\|返回\|完成\|提交\|跳过\|重试\)' app/src/ --include="*.tsx" | sort
```

**Step 2:** 统一为以下标准用词：

| 场景 | 统一用词 |
|------|----------|
| 确认操作 | 确认 |
| 取消/关闭弹窗 | 取消（弹窗内）、关闭（独立面板） |
| 保存数据 | 保存 |
| 危险操作确认 | 删除（红色） |
| 返回上一级 | 返回 |
| 完成阶段 | 完成 |

**Step 3:** 逐文件修正不一致的文案。

**Step 4:** 提交 `git commit -m "copy: unify button labels and microcopy"`

---

### Task 11: 响应式布局 + 暗色模式验证

**Step 1:** 启动 `npx tauri dev`

**Step 2: 响应式验证**
- 将窗口缩小到最小尺寸（900x600，tauri.conf.json 中配置的 minWidth/minHeight）
- 逐页检查：
  - 侧边栏是否正确折叠
  - 内容区是否溢出
  - 表格/列表是否有横向滚动条
  - 文字是否截断（truncate 而非溢出）
- 记录问题，修复布局溢出

**Step 3: 暗色模式验证**
- 切换到 dark theme（⌘D）
- 逐页检查：
  - 文字是否可读（对比度）
  - 卡片/面板是否有正确的暗色背景
  - 边框是否可见
  - 图标颜色是否适配
- 记录问题，修复样式缺失

**Step 4:** 提交修复 `git commit -m "fix: responsive layout and dark mode issues"`

---

### Task 12: DesignSpec.tsx fallback 默认值优化

**Files:**
- Modify: `app/src/pages/tools/DesignSpec.tsx` — `extractPlaygroundTokens` 函数（约行 56-69）

**Step 1:** 将 fallback 硬编码色值改为从 CSS 变量读取：

```typescript
const getVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const primary   = ... ?? getVar('--accent-color') || '#1D4ED8'
const success   = ... ?? getVar('--success') || '#16a34a'
const warning   = ... ?? getVar('--warning') || '#d97706'
const error     = ... ?? getVar('--destructive') || '#dc2626'
```

保留硬编码值作为最终 fallback（getComputedStyle 可能在 SSR 或测试中不可用），但优先使用 CSS 变量。

Playground 渲染区（行 385-453）的 `#fff`、`#374151` 等保持不变（用户规范预览，不受客户端规范约束）。

**Step 2:** 验证 `tsc --noEmit`

**Step 3:** 提交 `git commit -m "refactor: DesignSpec fallback defaults prefer CSS variables"`

---

## Phase 4：重构清理（3 项）

### Task 13: rarity-stripe-card 重命名

**Files:**
- Rename: `app/src/components/rarity-stripe-card.tsx` → `app/src/components/accent-stripe-card.tsx`
- Modify: 所有 import 该组件的文件

**Step 1:** 搜索所有引用：
```bash
grep -rn "rarity-stripe-card\|RarityStripeCard" app/src/ --include="*.tsx" --include="*.ts"
```

**Step 2:** 重命名文件，组件名 `RarityStripeCard` → `AccentStripeCard`，prop `rarity` → `variant`。

**Step 3:** 更新所有 import 和使用处。

**Step 4:** 验证 `tsc --noEmit`

**Step 5:** 提交 `git commit -m "refactor: rename RarityStripeCard to AccentStripeCard"`

---

### Task 14: CSS 变量语义优化（--green/--dark/--text-muted）

**Files:**
- Modify: `app/src/index.css`
- Modify: 所有引用这三个变量的 .tsx 文件

**Step 1:** 评估替换映射：

```bash
grep -c 'var(--green)' app/src/ -r --include="*.tsx" --include="*.css"
grep -c 'var(--dark)' app/src/ -r --include="*.tsx" --include="*.css"
grep -c 'var(--text-muted)' app/src/ -r --include="*.tsx" --include="*.css"
```

替换映射：
- `--green` → `--success`（如果语义一致）
- `--dark` → `--text-primary`（如果语义一致）
- `--text-muted` → `--text-secondary`（design-system.md 中的标准名）

**Step 2:** 确认语义一致后全量替换。如果 `--green` 和 `--success` 的值完全相同，可以直接替换并删除 `--green` 定义。

**Step 3:** 验证 `tsc --noEmit`

**Step 4:** 提交 `git commit -m "refactor: rename --green/--dark/--text-muted to semantic CSS variable names"`

---

### Task 15: 大组件拆分

**Files:**
- Refactor: `app/src/pages/project/Review.tsx` (639 行)
- Refactor: `app/src/pages/project/Prd.tsx` (671 行)
- Refactor: `app/src/pages/Dashboard.tsx` (594 行)

**Step 1:** 对每个大组件，识别可提取的子组件：

Review.tsx 候选：
- `ReviewContent` — 评审结果渲染区
- `KnowledgeRecordModal` — 记录经验弹窗

Prd.tsx 候选：
- `PrdToolbar` — 顶部操作栏（生成/重新生成/导出按钮）
- `PrdTocSidebar` — 目录侧边栏（已有 prd-toc.tsx，确认是否已提取）

Dashboard.tsx 候选：
- `ProjectCard` — 项目卡片（含重命名、收藏、右键菜单逻辑）
- `DashboardToolbar` — 顶部筛选/排序栏

**Step 2:** 逐个提取，每个子组件一个 commit。提取原则：
- 子组件放在同目录或 `components/` 下
- Props 接口清晰，不传整个 parent state
- 保持功能不变，纯结构重构

**Step 3:** 每次提取后验证 `tsc --noEmit`

**Step 4:** 每个子组件单独提交

---

### Task 16: 未发版功能汇总发版

**Step 1:** 确认所有修复已提交且编译通过

**Step 2:** 版本号 bump 到 v0.1.5：
- `app/src-tauri/tauri.conf.json`
- `app/package.json`
- `app/src-tauri/Cargo.toml`

**Step 3:** 提交并打 tag：
```bash
git commit -m "chore: bump version to 0.1.5"
git tag v0.1.5
git push origin main && git push origin v0.1.5
```

等用户确认要发版时再执行此 Task。
