# Rename Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hover-to-reveal pencil + click-to-edit inline rename for 产品分身、设计规范、项目名称，保持文件关联不中断。

**Architecture:** 3 new Rust commands (rename_prd_style, rename_ui_spec, rename_project) handle filesystem rename + side-effects (update `_active`, update DB + rollback on failure, update `_status.json`). 3 new TS API wrappers. Inline-edit UI pattern applied uniformly to Persona.tsx, DesignSpec.tsx, Dashboard.tsx — hover shows `✎` pencil, click converts name to `<input>`, Enter/blur confirms, Esc cancels.

**Tech Stack:** Rust (std::fs, rusqlite, serde_json), Tauri v2, React + TypeScript, Tailwind CSS, lucide-react

---

### Task 1: Rust — rename_prd_style + rename_ui_spec (templates.rs)

**Files:**
- Modify: `app/src-tauri/src/commands/templates.rs`

**Step 1: Add `rename_prd_style` after line 145 (after `get_prd_style_content`)**

```rust
#[tauri::command]
pub fn rename_prd_style(
    state: State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    if !is_safe_style_name(&old_name) {
        return Err(format!("无效的旧名称: {}", old_name));
    }
    if !is_safe_style_name(&new_name) {
        return Err(format!("无效的新名称: {}", new_name));
    }
    if old_name == new_name {
        return Ok(());
    }
    let styles_dir = state.templates_base().join("prd-styles");
    let old_dir = styles_dir.join(&old_name);
    let new_dir = styles_dir.join(&new_name);
    if !old_dir.exists() {
        return Err(format!("风格「{}」不存在", old_name));
    }
    if new_dir.exists() {
        return Err(format!("名称「{}」已存在", new_name));
    }
    fs::rename(&old_dir, &new_dir).map_err(|e| e.to_string())?;
    // Update _active if it referenced old_name
    let active_file = styles_dir.join("_active");
    if let Ok(current) = fs::read_to_string(&active_file) {
        if current.trim() == old_name {
            let _ = fs::write(&active_file, &new_name);
        }
    }
    Ok(())
}
```

**Step 2: Add `rename_ui_spec` after line 214 (after `get_ui_spec_content`)**

```rust
#[tauri::command]
pub fn rename_ui_spec(
    state: State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    if new_name.is_empty()
        || new_name.starts_with('.')
        || new_name.contains('/')
        || new_name.contains('\\')
        || new_name.contains('\0')
    {
        return Err(format!("无效的新名称: {}", new_name));
    }
    if old_name == new_name {
        return Ok(());
    }
    let specs_dir = state.templates_base().join("ui-specs");
    let old_dir = specs_dir.join(&old_name);
    let new_dir = specs_dir.join(&new_name);
    if !old_dir.exists() {
        return Err(format!("规范「{}」不存在", old_name));
    }
    if new_dir.exists() {
        return Err(format!("名称「{}」已存在", new_name));
    }
    fs::rename(&old_dir, &new_dir).map_err(|e| e.to_string())
}
```

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/commands/templates.rs
git commit -m "feat: add rename_prd_style and rename_ui_spec Rust commands"
```

---

### Task 2: Rust — rename_project (projects.rs)

**Files:**
- Modify: `app/src-tauri/src/commands/projects.rs`

**Step 1: Add `use serde_json;` at top** — imports are at lines 1-9, add after line 8:

```rust
use serde_json;
```

**Step 2: Add `rename_project` after `delete_project` (after line 245)**

```rust
#[tauri::command]
pub fn rename_project(
    state: State<AppState>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    // Validate name: non-empty, no path separators or traversal
    if new_name.is_empty()
        || new_name.contains('/')
        || new_name.contains('\\')
        || new_name.contains('\0')
        || new_name.contains("..")
    {
        return Err(format!("无效的项目名称: {}", new_name));
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // Get current project name and output_dir
    let (old_name, old_output_dir): (String, String) = db
        .query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "项目不存在".to_string())?;

    if old_name == new_name {
        return Ok(());
    }

    // Check new name not used by another project
    let count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE name = ?1 AND id != ?2",
            params![&new_name, &id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!("名称「{}」已存在", new_name));
    }

    // Build new output_dir by replacing the last path component
    let new_output_dir = Path::new(&old_output_dir)
        .parent()
        .ok_or("无法解析项目路径")?
        .join(&new_name)
        .to_string_lossy()
        .to_string();

    if Path::new(&new_output_dir).exists() {
        return Err(format!("目录「{}」已存在", new_name));
    }

    // Phase 1: rename filesystem directory
    fs::rename(&old_output_dir, &new_output_dir).map_err(|e| e.to_string())?;

    // Phase 2: update DB (rollback filesystem on failure)
    let db_result = db.execute(
        "UPDATE projects SET name = ?1, output_dir = ?2, updated_at = ?3 WHERE id = ?4",
        params![&new_name, &new_output_dir, &now, &id],
    );
    if let Err(e) = db_result {
        let _ = fs::rename(&new_output_dir, &old_output_dir); // rollback
        return Err(e.to_string());
    }

    // Phase 3: update _status.json project_name field (best-effort)
    let status_path = Path::new(&new_output_dir).join("_status.json");
    if let Ok(raw) = fs::read_to_string(&status_path) {
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&raw) {
            v["project_name"] = serde_json::Value::String(new_name.clone());
            if let Ok(updated) = serde_json::to_string_pretty(&v) {
                let _ = fs::write(&status_path, updated);
            }
        }
    }

    Ok(())
}
```

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/commands/projects.rs
git commit -m "feat: add rename_project Rust command with fs+DB atomic rollback"
```

---

### Task 3: Register commands in lib.rs + cargo check

**Files:**
- Modify: `app/src-tauri/src/lib.rs`

**Step 1: In `tauri::generate_handler![]` (lines 150-200), add after `commands::templates::get_ui_spec_content` (line 199):**

```rust
            commands::templates::rename_prd_style,
            commands::templates::rename_ui_spec,
            commands::projects::rename_project,
```

**Step 2: cargo check**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && cargo check 2>&1 | tail -20
```

Expected: `warning: ...` only, no errors. Fix any errors before continuing.

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/lib.rs
git commit -m "chore: register rename_prd_style, rename_ui_spec, rename_project commands"
```

---

### Task 4: TypeScript API (tauri-api.ts)

**Files:**
- Modify: `app/src/lib/tauri-api.ts`

**Step 1: Find the PRD Styles and UI Specs sections in `api` object. Add `renamePrdStyle` after `getActivePrdStyle`, `renameUiSpec` after `getUiSpecContent`, `renameProject` after `setProjectStatus`.**

In the api object, search for `getActivePrdStyle` and add after it:
```typescript
  renamePrdStyle: (oldName: string, newName: string) =>
    invoke<void>("rename_prd_style", { oldName, newName }),
```

After `getUiSpecContent`:
```typescript
  renameUiSpec: (oldName: string, newName: string) =>
    invoke<void>("rename_ui_spec", { oldName, newName }),
```

After `setProjectStatus`:
```typescript
  renameProject: (id: string, newName: string) =>
    invoke<void>("rename_project", { id, newName }),
```

**Step 2: TypeScript check**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -10
```

Expected: no output (zero errors).

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/lib/tauri-api.ts
git commit -m "feat: add renamePrdStyle, renameUiSpec, renameProject to tauri-api"
```

---

### Task 5: Persona.tsx — inline rename (已保存风格 tab)

**Files:**
- Modify: `app/src/pages/tools/Persona.tsx`

**Step 1: Add `Pencil` and `Loader2` to lucide-react import (line 3)**

```typescript
import { Pencil, Loader2 } from "lucide-react"
// merge into the existing lucide-react import line
```

**Step 2: Add inline-edit state after existing state declarations (around line 18)**

```typescript
  const [editingStyle, setEditingStyle] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
```

**Step 3: Add rename handlers after `toggleExpand`**

```typescript
  const handleRenameStart = useCallback((name: string) => {
    setEditingStyle(name)
    setEditValue(name)
    setEditError(null)
  }, [])

  const handleRenameConfirm = useCallback(async (oldName: string) => {
    const newName = editValue.trim()
    if (!newName || newName === oldName) { setEditingStyle(null); return }
    setEditSaving(true)
    setEditError(null)
    try {
      await api.renamePrdStyle(oldName, newName)
      setStyles(prev => prev.map(s => s.name === oldName ? { ...s, name: newName } : s))
      setActiveStyle(prev => prev === oldName ? newName : prev)
      setExpandedStyles(prev => {
        const next = new Set(prev)
        if (next.has(oldName)) { next.delete(oldName); next.add(newName) }
        return next
      })
      setStyleContents(prev => {
        if (!prev[oldName]) return prev
        const { [oldName]: content, ...rest } = prev
        return { ...rest, [newName]: content }
      })
      setEditingStyle(null)
    } catch (err) {
      setEditError(typeof err === "string" ? err : String(err))
    } finally {
      setEditSaving(false)
    }
  }, [editValue])
```

**Step 4: In the `已保存风格` list — replace the name `<span>` with inline-edit UI**

Find the section (inside `tab === "list"` → `styles.map` → card header → `<div className="flex items-center gap-2 min-w-0">`):

Current code looks like:
```tsx
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                      {s.hasPersona && ( ... badge ... )}
                      {activeStyle === s.name && ( ... badge ... )}
                    </div>
```

Replace with:
```tsx
                    <div className="flex items-center gap-2 min-w-0">
                      {editingStyle === s.name ? (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => { setEditValue(e.target.value); setEditError(null) }}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleRenameConfirm(s.name)
                              if (e.key === "Escape") setEditingStyle(null)
                            }}
                            onBlur={() => handleRenameConfirm(s.name)}
                            disabled={editSaving}
                            className={cn(
                              "h-7 w-40 px-2 text-sm border rounded outline-none bg-[var(--card)]",
                              editError
                                ? "border-[var(--destructive)] text-[var(--destructive)]"
                                : "border-[var(--accent-color)] text-[var(--text-primary)]"
                            )}
                          />
                          {editSaving && <Loader2 className="size-3.5 animate-spin text-[var(--text-tertiary)]" />}
                          {editError && <span className="text-[11px] text-[var(--destructive)]">{editError}</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/name">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleRenameStart(s.name) }}
                            className="opacity-0 group-hover/name:opacity-100 transition-opacity duration-150 flex size-5 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                          >
                            <Pencil className="size-3" strokeWidth={1.75} />
                          </button>
                        </div>
                      )}
                      {s.hasPersona && ( ... keep existing badge ... )}
                      {activeStyle === s.name && ( ... keep existing badge ... )}
                    </div>
```

**Step 5: TypeScript check**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -10
```

**Step 6: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/pages/tools/Persona.tsx
git commit -m "feat: inline rename for 产品分身 in Persona.tsx"
```

---

### Task 6: DesignSpec.tsx — inline rename

**Files:**
- Modify: `app/src/pages/tools/DesignSpec.tsx`

**Step 1: Add `Pencil` and `Loader2` to lucide-react import — DesignSpec.tsx currently has no lucide-react import, add:**

```typescript
import { Pencil, Loader2 } from "lucide-react"
```

**Step 2: Add state after existing state (around line 80)**

```typescript
  const [editingSpec, setEditingSpec] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
```

**Step 3: Add rename handlers after `toggleExpand`**

```typescript
  const handleRenameStart = useCallback((name: string) => {
    setEditingSpec(name)
    setEditValue(name)
    setEditError(null)
  }, [])

  const handleRenameConfirm = useCallback(async (oldName: string) => {
    const newName = editValue.trim()
    if (!newName || newName === oldName) { setEditingSpec(null); return }
    setEditSaving(true)
    setEditError(null)
    try {
      await api.renameUiSpec(oldName, newName)
      setSpecs(prev => prev.map(s => s.name === oldName ? { ...s, name: newName } : s))
      setExpandedSpecs(prev => {
        const next = new Set(prev)
        if (next.has(oldName)) { next.delete(oldName); next.add(newName) }
        return next
      })
      setSpecContents(prev => {
        if (!prev[oldName]) return prev
        const { [oldName]: content, ...rest } = prev
        return { ...rest, [newName]: content }
      })
      setEditingSpec(null)
    } catch (err) {
      setEditError(typeof err === "string" ? err : String(err))
    } finally {
      setEditSaving(false)
    }
  }, [editValue])
```

**Step 4: Replace spec card header name span**

Find (inside `specs.map` → card header → `<div className="flex cursor-pointer items-center justify-between px-4 py-3">`):

Current:
```tsx
                <span className="text-sm font-medium text-[var(--text-primary)]">{spec.name}</span>
```

Replace with:
```tsx
                {editingSpec === spec.name ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => { setEditValue(e.target.value); setEditError(null) }}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRenameConfirm(spec.name)
                        if (e.key === "Escape") setEditingSpec(null)
                      }}
                      onBlur={() => handleRenameConfirm(spec.name)}
                      disabled={editSaving}
                      className={cn(
                        "h-7 w-44 px-2 text-sm border rounded outline-none bg-[var(--card)]",
                        editError
                          ? "border-[var(--destructive)]"
                          : "border-[var(--accent-color)] text-[var(--text-primary)]"
                      )}
                    />
                    {editSaving && <Loader2 className="size-3.5 animate-spin text-[var(--text-tertiary)]" />}
                    {editError && <span className="text-[11px] text-[var(--destructive)]">{editError}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 group/name">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{spec.name}</span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleRenameStart(spec.name) }}
                      className="opacity-0 group-hover/name:opacity-100 transition-opacity duration-150 flex size-5 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                    >
                      <Pencil className="size-3" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
```

Note: The outer div that wraps the card header has `onClick={() => toggleExpand(spec.name)}`. When editing, clicking inside the input must NOT trigger toggleExpand — the `e.stopPropagation()` in the input wrapper handles this.

**Step 5: TypeScript check + commit**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -10
git add app/src/pages/tools/DesignSpec.tsx
git commit -m "feat: inline rename for 设计规范 in DesignSpec.tsx"
```

---

### Task 7: Dashboard.tsx — inline rename for project name

**Files:**
- Modify: `app/src/pages/Dashboard.tsx`

**Step 1: Add `Pencil` and `Loader2` to lucide-react import (check current imports first)**

**Step 2: Add state after existing state in `DashboardPage`**

```typescript
  const [editingProject, setEditingProject] = useState<string | null>(null) // project id
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
```

**Step 3: Add rename handlers after `handleDelete`**

```typescript
  const handleRenameStart = useCallback((e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation()
    setEditingProject(project.id)
    setEditValue(project.name)
    setEditError(null)
  }, [])

  const handleRenameConfirm = useCallback(async (id: string, oldName: string) => {
    const newName = editValue.trim()
    if (!newName || newName === oldName) { setEditingProject(null); return }
    setEditSaving(true)
    setEditError(null)
    try {
      await api.renameProject(id, newName)
      setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p))
      setEditingProject(null)
    } catch (err) {
      setEditError(typeof err === "string" ? err : String(err))
    } finally {
      setEditSaving(false)
    }
  }, [editValue])
```

**Step 4: Replace project name area (lines 319-329)**

Current:
```tsx
                {/* Project name */}
                <div className="flex items-start gap-2 pr-6 mb-3">
                  <span className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug truncate">
                    {project.name}
                  </span>
                  {project.status === 'completed' && (
                    <span className="ml-2 rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] text-[var(--success)] font-medium shrink-0">
                      已完成
                    </span>
                  )}
                </div>
```

Replace with:
```tsx
                {/* Project name */}
                <div className="flex items-start gap-2 pr-6 mb-3" onClick={e => e.stopPropagation()}>
                  {editingProject === project.id ? (
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => { setEditValue(e.target.value); setEditError(null) }}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleRenameConfirm(project.id, project.name)
                            if (e.key === "Escape") setEditingProject(null)
                          }}
                          onBlur={() => handleRenameConfirm(project.id, project.name)}
                          disabled={editSaving}
                          className={cn(
                            "h-8 flex-1 px-2 text-sm font-semibold border rounded outline-none bg-[var(--card)]",
                            editError
                              ? "border-[var(--destructive)]"
                              : "border-[var(--accent-color)] text-[var(--text-primary)]"
                          )}
                        />
                        {editSaving && <Loader2 className="size-3.5 animate-spin text-[var(--text-tertiary)] shrink-0" />}
                      </div>
                      {editError && <span className="text-[11px] text-[var(--destructive)]">{editError}</span>}
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5 group/name min-w-0 flex-1">
                      <span className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug truncate">
                        {project.name}
                      </span>
                      {project.status === 'completed' && (
                        <span className="ml-1 rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] text-[var(--success)] font-medium shrink-0 mt-0.5">
                          已完成
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={e => handleRenameStart(e, project)}
                        className="opacity-0 group-hover/name:opacity-100 transition-opacity duration-150 flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] mt-0.5"
                      >
                        <Pencil className="size-3" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
```

**Step 5: TypeScript check**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -10
```

**Step 6: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/pages/Dashboard.tsx
git commit -m "feat: inline rename for project name in Dashboard.tsx"
```

---

### Task 8: Build + smoke test

**Step 1: Full cargo build**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished dev [unoptimized + debuginfo]`

**Step 2: Manual smoke test checklist**

- [ ] 产品分身 `已保存风格` tab：hover 分身名称显示铅笔，点击进入编辑，改名保存后名称更新，`_active` 正确跟随
- [ ] 产品分身：改名后点击展开，内容正常加载
- [ ] 产品分身：改成已存在名称，显示"名称已存在"错误
- [ ] 设计规范：同上测试
- [ ] 项目总览：hover 项目名显示铅笔，点击编辑，改名后进入项目页面功能正常
- [ ] 项目内各阶段文件（PRD/原型等）在改名后仍可正常读取
- [ ] Esc 取消不保存
- [ ] 空名称不提交（input 无响应）
