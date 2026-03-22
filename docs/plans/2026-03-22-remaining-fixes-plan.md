# 剩余修复项完整实施计划（v2 — 经多视角审视修订）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成审计中识别的全部未修复问题。

**Architecture:** 按优先级分 4 个 Phase。Phase 3 执行顺序经审视调整为 T14→T11→T10→T9（先替换 CSS 变量名再验证暗色模式，避免重复工作）。

**Tech Stack:** Rust (Tauri v2), React/TypeScript, Tailwind CSS

---

## Phase 1：后端安全与代码质量

### Task 1: ~~delete_project 外键级联防护~~ → 已移除

ON DELETE CASCADE + PRAGMA foreign_keys=ON 已正确配置（db.rs 第 20/29 行），手动 DELETE 冗余。无需修改。

---

### Task 2: 路径遍历防护（统一方案）

**Files:**
- Modify: `app/src-tauri/src/commands/files.rs`

**Step 1: 提取公共路径校验函数**

在 files.rs 中新增公共函数，供 `read_project_file`、`save_project_file`、`write_file` 复用：

```rust
/// 校验文件路径在指定基础目录内，防止路径遍历
fn validate_path_within(file_name: &str, base_dir: &str) -> Result<std::path::PathBuf, String> {
    // 1. 拦截绝对路径
    if file_name.starts_with('/') || file_name.starts_with('\\') {
        return Err("文件名不能是绝对路径".to_string());
    }

    let base = std::path::Path::new(base_dir);
    let full_path = base.join(file_name);

    // 2. canonicalize 基础目录
    let canonical_base = std::fs::canonicalize(base)
        .map_err(|e| format!("无法解析基础目录: {e}"))?;

    // 3. 对目标路径 canonicalize（处理不存在的文件/目录）
    let canonical_path = if full_path.exists() {
        std::fs::canonicalize(&full_path)
            .map_err(|e| format!("无法解析文件路径: {e}"))?
    } else {
        // 向上找到第一个已存在的祖先目录
        let mut ancestor = full_path.parent();
        while let Some(a) = ancestor {
            if a.exists() { break; }
            ancestor = a.parent();
        }
        let canonical_ancestor = std::fs::canonicalize(
            ancestor.unwrap_or(base)
        ).map_err(|e| format!("无法解析父目录: {e}"))?;

        // 拼接剩余的相对路径部分
        let remaining = full_path.strip_prefix(ancestor.unwrap_or(base)).unwrap_or(full_path.as_path());
        canonical_ancestor.join(remaining)
    };

    // 4. 验证在基础目录内
    if !canonical_path.starts_with(&canonical_base) {
        return Err("文件路径超出允许范围".to_string());
    }

    Ok(canonical_path)
}
```

**Step 2:** 替换 `read_project_file` 和 `save_project_file` 中的 `contains("..")` 检查为调用 `validate_path_within(file_name, output_dir)`。

**Step 3:** `write_file` 也改用 `validate_path_within(file_name, home_dir)`，保持一致。

**Step 4:** 验证 `cargo check`

**Step 5:** 提交 `git commit -m "security: unified path traversal validation with canonicalize"`

---

### Task 3: open_file / reveal_file 路径校验

**Files:**
- Modify: `app/src-tauri/src/commands/files.rs`

**Step 1:** 添加 canonicalize + starts_with 校验 + 文件类型限制：

```rust
let canonical = std::fs::canonicalize(&file_path)
    .map_err(|e| format!("路径无效: {e}"))?;
let home = dirs::home_dir()
    .ok_or("无法获取用户主目录".to_string())?;
if !canonical.starts_with(&home) {
    return Err("只能打开用户目录下的文件".to_string());
}

// 限制可打开的文件类型（防止执行 .app/.command 等）
let allowed_exts = ["md", "pdf", "docx", "html", "txt", "json", "csv", "xlsx", "png", "jpg"];
if let Some(ext) = canonical.extension().and_then(|e| e.to_str()) {
    if !allowed_exts.contains(&ext.to_lowercase().as_str()) {
        return Err(format!("不支持打开 .{ext} 类型的文件"));
    }
}
```

注意：`reveal_file`（在 Finder 中显示）只需要 canonicalize + starts_with 校验，不需要限制扩展名（显示目录是安全的）。

**Step 2:** 验证 `cargo check`

**Step 3:** 提交 `git commit -m "security: canonicalize + extension whitelist for open_file/reveal_file"`

---

### Task 4: truncate_to_chars 优化

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs`

**Step 1:** 替换为简洁实现：

```rust
fn truncate_to_chars(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_ascii() {
        assert_eq!(truncate_to_chars("hello world", 5), "hello");
    }
    #[test]
    fn test_truncate_cjk() {
        assert_eq!(truncate_to_chars("你好世界测试", 4), "你好世界");
    }
    #[test]
    fn test_truncate_shorter_than_max() {
        assert_eq!(truncate_to_chars("hi", 10), "hi");
    }
    #[test]
    fn test_truncate_zero() {
        assert_eq!(truncate_to_chars("hello", 0), "");
    }
    #[test]
    fn test_truncate_empty() {
        assert_eq!(truncate_to_chars("", 5), "");
    }
}
```

**Step 2:** 验证 `cargo test --manifest-path app/src-tauri/Cargo.toml`

**Step 3:** 提交 `git commit -m "refactor: simplify truncate_to_chars with unit tests"`

---

### Task 5: ~~--dangerously-skip-permissions 白名单~~ → 暂缓

审视发现以下风险，需先做 spike 验证：
1. `--print` 模式下 `--allowedTools` 是否生效待确认
2. `ClaudeCliProvider::stream()` 无法获取当前 phase，无法按阶段区分白名单
3. prototype 阶段需要 Write 工具，全局限只读会断裂

**暂缓执行**，后续单独做 spike 验证后再决定方案。

---

### Task 6: 知识库搜索性能注释

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs`

在 `search_knowledge` 和 `list_knowledge_internal` 上方添加：

```rust
/// 全量遍历文件系统 + 内存子串匹配。
/// 适用规模：<500 条（冷启动 <100ms）。
/// 迁移方案：500+ 条时，将 title/content 索引到 SQLite FTS5 虚拟表，
/// 复用现有 db.rs 的 Connection。参考：https://www.sqlite.org/fts5.html
```

提交 `git commit -m "docs: add performance notes and migration plan to knowledge search"`

---

## Phase 2：知识库功能验证

### Task 7: 知识库三大功能端到端验证

与原计划相同，启动 `npx tauri dev` 手动验证：
1. 知识库路径修复（UI 添加知识后 AI prompt 中是否包含）
2. 推荐功能（PRD 页面相关知识面板 + 评审页面踩坑提醒面板）
3. 自动沉淀弹窗（复盘完成后弹窗 → 候选列表 → 保存）

记录发现的问题，创建修复 commit。

---

## Phase 3：前端质量（执行顺序：T14→T11→T10→T9→T8→T12）

> 顺序调整原因：先替换 CSS 变量名（T14），再验证暗色模式（T11），避免重复工作。

### Task 14: CSS 变量语义优化（原 Phase 4，前移）

**Files:**
- Modify: `app/src/index.css`
- Modify: 所有引用 `--green`/`--dark`/`--text-muted` 的文件

**分三个独立 commit，逐变量替换：**

**Commit 1: --green → --success**
```bash
# 预览影响
grep -rn 'var(--green)' app/src/ --include="*.tsx" --include="*.css"
# 批量替换
find app/src -name "*.tsx" -o -name "*.css" | xargs sed -i '' 's/var(--green)/var(--success)/g'
# 删除 index.css 中 --green 定义（light + dark 两处）
# 验证
cd app && npx tsc --noEmit
git commit -am "refactor: rename --green to --success"
```

**Commit 2: --dark → --text-primary**
```bash
grep -rn 'var(--dark)' app/src/ --include="*.tsx" --include="*.css"
find app/src -name "*.tsx" -o -name "*.css" | xargs sed -i '' 's/var(--dark)/var(--text-primary)/g'
# 注意：index.css 中 --dark 与 --text-primary 已有同值定义，删除 --dark 定义即可
cd app && npx tsc --noEmit
git commit -am "refactor: rename --dark to --text-primary"
```

**Commit 3: --text-muted → --text-secondary**
```bash
grep -rn 'var(--text-muted)' app/src/ --include="*.tsx" --include="*.css"
find app/src -name "*.tsx" -o -name "*.css" | xargs sed -i '' 's/var(--text-muted)/var(--text-secondary)/g'
cd app && npx tsc --noEmit
git commit -am "refactor: rename --text-muted to --text-secondary"
```

每个 commit 后立即 `tsc --noEmit` 验证。三个全部完成后删除 index.css 中残留的别名定义。

---

### Task 11: 响应式布局 + 暗色模式验证（调到 T14 之后）

**结构化检查清单**（行=页面，列=检查项）：

| 页面 | 900x600 | 1200x800 | 1600x900 | Dark 文字 | Dark 背景 | Dark 边框 |
|------|---------|----------|----------|-----------|-----------|-----------|
| Dashboard | | | | | | |
| Settings | | | | | | |
| Prd | | | | | | |
| Review | | | | | | |
| ... | | | | | | |

**Step 1:** 启动 `npx tauri dev`
**Step 2:** 三个断点逐页检查响应式（Compact 900 / Default 1200 / Wide 1600）
**Step 3:** 暗色模式逐页检查。特别注意手写弹窗背景色应为 `var(--card)` 而非 `var(--background)`
**Step 4:** 记录问题并修复
**Step 5:** 提交 `git commit -m "fix: responsive layout and dark mode issues"`

---

### Task 10: 文案一致性审计

**统一规则（扩展版）：**

| 场景 | 统一用词 |
|------|----------|
| 确认操作 | 确认 |
| 取消弹窗 | 取消 |
| 关闭面板 | 关闭 |
| 保存数据 | 保存 |
| 危险操作 | 删除（红色） |
| 返回上级 | 返回 |
| 完成阶段 | 完成 |
| 进行态 | `{动作}中...`（保存中...、导出中...），不用"正在..." |
| 省略号 | 统一用 `...`（三个英文点） |
| 导航文案 | `前往设置` 而非 `去设置` |

**扫描范围：**
- 按钮文案：`grep -rn '>确定\|>确认\|>取消\|>关闭' ...`
- 进行态文案：`grep -rn '正在\|中\.\.\.\|中···' ...`
- Placeholder 文案：`grep -rn 'placeholder' ...`

**附加步骤：** 文案修改后通过 Humanizer-zh 审查，避免 AI 味。

提交 `git commit -m "copy: unify button labels, progress text, and microcopy"`

---

### Task 9: 边界状态审计

**审计范围：** `pages/` + `pages/project/` + `pages/tools/`（扩展）

**验收标准：** 每个页面级组件必须包含：
- 至少一个 Loading skeleton（用项目已有的 Skeleton 组件变体）
- 至少一个 Empty state 占位（区分首次空/搜索空/操作后空）
- Error 状态有用户可感知反馈

**错误反馈规则：**
- 流式/生成操作失败：内联错误条（红色左条 + 重试按钮）
- 非阻断异步操作失败（删除、保存）：Toast 提示
- 不允许静默 `console.error`（catch 块必须有用户反馈）

**Skeleton 变体指引：**
- 项目阶段页（Analysis/Research/Prd/Review 等）：`SkeletonText`
- Dashboard 项目列表：`SkeletonCard`
- 工具页列表（Knowledge/Persona）：`SkeletonList`

提交 `git commit -m "ux: add missing empty/loading/error states across all pages"`

---

### Task 8: aria-label + 模态框可访问性

**Files:**
- 所有含图标按钮的 .tsx 文件
- 所有手写模态框（Dashboard onboarding×2、DesignSpec 删除确认、Review 知识记录、Persona 删除确认）

**Part 1:** 补图标按钮 aria-label（剩余 29 文件中的纯图标按钮）

**Part 2:** 所有手写 `fixed inset-0` 弹窗统一添加：
- `role="dialog"`
- `aria-modal="true"`
- `aria-labelledby`（指向标题元素的 id）

**Part 3（可选）：** 评估是否提取通用 `<Modal>` 组件替代手写弹窗（含焦点陷阱）。如工作量过大可后续单独做。

提交 `git commit -m "a11y: aria-labels, dialog roles, and modal accessibility"`

---

### Task 12: ~~DesignSpec.tsx fallback 优化~~ → 已移除

审视结论：`extractPlaygroundTokens` 是纯解析函数，不应引入 DOM 依赖。Playground 色值不应跟随客户端主题。当前硬编码 fallback 与 design-system.md 一致，无需修改。

---

## Phase 4：重构清理

### Task 13: rarity-stripe-card 重命名

**改名方案（修订后）：**
- 文件：`rarity-stripe-card.tsx` → `accent-stripe-card.tsx`
- 组件：`RarityStripeCard` → `AccentStripeCard`
- Prop：`rarity` → `accent`（避免与 CVA 的 `variant` 概念冲突）
- CVA key：`variants.rarity` → `variants.accent`

**关联标识符全量搜索替换：**
- `classifyRarity` → `classifyAccent`
- `PRIORITY_RARITY` → `PRIORITY_ACCENT`
- `Section` 接口的 `rarity` 字段 → `accent`
- `data-slot="rarity-stripe-card"` → `data-slot="accent-stripe-card"`

**Step 1:** 搜索所有 `rarity` 在 `app/src/` 中的出现
**Step 2:** 全量重命名
**Step 3:** 验证 `tsc --noEmit`
**Step 4:** 提交 `git commit -m "refactor: rename RarityStripeCard to AccentStripeCard"`

---

### Task 15: 大组件拆分（修订后）

**前置工作：**
- Dashboard.tsx 先合并两处重复的 onboarding 弹窗代码

**拆分方案：**

**Dashboard.tsx:**
1. 提取 `useProjectActions` hook — 封装 rename/delete/toggleStatus 的 state 和 handler（约 8 个 state + 3 个 handler）
2. 提取 `ProjectCard` 组件 — 接收 `project` + `actions` props（props 不超过 8 个）
3. 提取 `OnboardingDialog` 组件 — 消除重复代码

**Review.tsx:**
1. 提取 `KnowledgeRecordModal` 组件 — 参考已有的 `KnowledgeExtractDialog` 模式，所有知识记录 state（9 个）下沉到子组件，只暴露 `open/onClose/projectName/sections` 4 个 props

**Prd.tsx:**
1. ~~PrdTocSidebar~~ 已存在（`prd-toc.tsx`），跳过
2. 提取 `PrdToolbar` — 顶部操作栏（生成/重新生成/导出按钮），如 props 过多可先不拆

**跨页面通用组件（高收益）：**
- 评估提取 `PhaseStreamingLayout` 通用壳组件 — 封装流式进度条 + 思考状态 + 错误展示 + 底部操作栏，6+ 个阶段页面可共用。如工作量大可列为后续任务。

**每个子组件：**
- 先设计 Props 接口（不超过 8 个 props）
- 单独 commit
- 每次 `tsc --noEmit` 验证

---

### Task 16: 汇总发版

**Step 1:** 确认所有修复已提交且编译通过：`tsc --noEmit` + `cargo clippy`
**Step 2:** 版本号 bump 到 v0.1.5（tauri.conf.json + package.json + Cargo.toml）
**Step 3:** 提交 `git commit -m "chore: bump version to 0.1.5"`
**Step 4:** 等用户确认后手动执行 `git tag v0.1.5 && git push origin main && git push origin v0.1.5`

---

## 变更摘要（v1 → v2）

| 原 Task | 变更 | 原因 |
|---------|------|------|
| T1 外键级联 | **移除** | ON DELETE CASCADE 已生效 |
| T2 路径遍历 | **重写**：提取公共函数 + 绝对路径拦截 + 祖先目录 canonicalize | canonicalize 对不存在目录会失败 |
| T3 open/reveal | **加强**：canonicalize + 扩展名白名单 | 符号链接绕过 + open 可执行文件 |
| T5 CLI 权限 | **暂缓** | 需 spike 验证，全局限只读会断裂 |
| T8 aria | **扩展**：增加模态框 role/aria-modal | 6 处手写弹窗缺可访问性 |
| T9 边界状态 | **扩展**：范围含 tools/，增加验收标准和错误反馈规则 | 原计划粒度不够 |
| T10 文案 | **扩展**：增加进行态文案 + Humanizer-zh | 省略号/动词格式不统一 |
| T11 响应式 | **加强**：3 断点 + 结构化清单 | 原只测最小尺寸 |
| T12 DesignSpec | **移除** | 纯函数不应引入 DOM 调用 |
| T13 重命名 | **修订**：prop 改名 accent，覆盖全部关联标识符 | 遗漏 classifyRarity 等 |
| T14 CSS 变量 | **前移到 Phase 3 首位**，分 3 commit | 应在暗色模式验证前完成 |
| T15 组件拆分 | **修订**：先设计 Props，合并重复代码，跳过已完成项 | 缺 Props 接口设计 |
| T16 发版 | **修订**：移除自动 push | 违反 CLAUDE.md |
