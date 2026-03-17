# Context Integration & Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Tool outputs (interview/data) auto-inject into phase generation with visible removable pills; dashboard gets search + phase mini-map.

**Architecture:** (1) New `list_project_context` Tauri command scans `<output_dir>/context/`. (2) `run_tool` gains optional `project_id` to save output there. (3) `build_system_prompt` scans context dir, skips excluded files. (4) `ContextPills` component shows pills with ×. (5) Sidebar TOOLS links pass `?projectId=` when in project. (6) `list_projects` SQL adds GROUP_CONCAT for mini-map.

**Tech Stack:** Tauri 2 (Rust/rusqlite), React 19 + TypeScript, react-router-dom v7, Tailwind CSS v4

---

## Key Files Reference

- Rust commands: `app/src-tauri/src/commands/{files,tools,stream,projects}.rs`
- Register commands: `app/src-tauri/src/lib.rs`
- Frontend API: `app/src/lib/tauri-api.ts`
- Hooks: `app/src/hooks/{use-ai-stream,use-tool-stream}.ts`
- Sidebar: `app/src/components/layout/Sidebar.tsx`
- Phase pages: `app/src/pages/project/{Analysis,Research,Stories,Prd,Prototype,Review}.tsx`
- Tool pages: `app/src/pages/tools/{Interview,Data}.tsx`
- Dashboard: `app/src/pages/Dashboard.tsx`

Design doc: `docs/plans/2026-03-17-context-integration-design.md`

---

### Task 1: `list_project_context` Tauri command

**Files:**
- Modify: `app/src-tauri/src/commands/files.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/lib/tauri-api.ts`

**Context:** Tool outputs will be saved to `<output_dir>/context/<tool-name>-<date>.md`. This command scans that directory and returns file names + 200-char previews, so the frontend can render context pills with tooltips.

**Step 1: Add ContextFile struct + command to files.rs**

At the top of `files.rs`, after existing `use` statements, add:
```rust
use serde::Serialize;
```
(Check if already present — if so skip.)

Then add at the bottom of `files.rs`:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextFile {
    /// Filename only, e.g. "ai-pm-interview-2026-03-17.md"
    pub name: String,
    /// First ~200 chars of content for tooltip preview
    pub preview: String,
}

#[tauri::command]
pub fn list_project_context(
    state: State<AppState>,
    project_id: String,
) -> Result<Vec<ContextFile>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ) {
            Ok(dir) => dir,
            Err(_) => return Ok(vec![]),
        }
    };

    let context_dir = Path::new(&output_dir).join("context");
    if !context_dir.exists() {
        return Ok(vec![]);
    }

    let mut files: Vec<ContextFile> = fs::read_dir(&context_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().and_then(|x| x.to_str()) == Some("md")
        })
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let content = fs::read_to_string(e.path()).unwrap_or_default();
            let preview: String = content.chars().take(200).collect();
            if preview.is_empty() {
                None
            } else {
                Some(ContextFile { name, preview })
            }
        })
        .collect();

    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}
```

**Step 2: Register in lib.rs**

In `app/src-tauri/src/lib.rs`, inside `tauri::generate_handler![...]`, add after `commands::files::read_file,`:
```rust
commands::files::list_project_context,
```

**Step 3: Add TypeScript type + API call**

In `app/src/lib/tauri-api.ts`, add the type after `KnowledgeEntry`:
```typescript
export interface ContextFile {
  name: string
  preview: string
}
```

Add to the `api` object (after `deleteKnowledge`):
```typescript
// Context files
listProjectContext: (projectId: string) => invoke<ContextFile[]>("list_project_context", { projectId }),
```

**Step 4: Build to verify**

```bash
cd <AI_PM_ROOT>/app/src-tauri && cargo build 2>&1 | tail -20
```
Expected: compiles without errors.

**Step 5: Commit**

```bash
git add app/src-tauri/src/commands/files.rs app/src-tauri/src/lib.rs app/src/lib/tauri-api.ts
git commit -m "feat: list_project_context command + TypeScript type"
```

---

### Task 2: Context files injection in `build_system_prompt`

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs`
- Modify: `app/src/lib/tauri-api.ts`
- Modify: `app/src/hooks/use-ai-stream.ts`

**Context:** `build_system_prompt` currently injects knowledge base. It needs to also scan `<output_dir>/context/` and inject tool output files, supporting an exclude list. `StartStreamArgs` gets `excluded_context`. `useAiStream.start()` accepts `excludedContext`.

**Step 1: Add `load_context_files` function to stream.rs**

After the `load_knowledge` function, add:

```rust
fn load_context_files(output_dir: &str, excluded: &[String]) -> String {
    let context_dir = Path::new(output_dir).join("context");
    if !context_dir.exists() {
        return String::new();
    }

    let mut file_entries: Vec<_> = fs::read_dir(&context_dir)
        .map(|rd| rd.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    file_entries.sort_by_key(|e| e.file_name());

    let mut blocks: Vec<String> = Vec::new();
    for entry in file_entries {
        let fp = entry.path();
        if fp.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if excluded.contains(&name) {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&fp) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                blocks.push(format!("#### {}\n\n{}", name, trimmed));
            }
        }
    }

    if blocks.is_empty() {
        return String::new();
    }

    format!(
        "### 工具上下文\n\n{}\n",
        blocks.join("\n\n---\n\n")
    )
}
```

**Step 2: Update `build_system_prompt` signature**

Add `excluded_context: &[String]` as the last parameter:

```rust
fn build_system_prompt(
    skills_root: &str,
    output_dir: &str,
    project_name: &str,
    skill_name: &str,
    input_files: &[&str],
    user_input: Option<&str>,
    team_mode: bool,
    phase: &str,
    config_dir: &str,
    excluded_context: &[String],   // <-- new
) -> Result<String, String> {
```

**Step 3: Inject context files inside `build_system_prompt`**

After the knowledge injection block (the `if !knowledge.is_empty()` block), add:

```rust
// Context files injection (tool outputs bound to this project)
let context_block = load_context_files(output_dir, excluded_context);
if !context_block.is_empty() {
    parts[0].push_str("\n\n---\n\n");
    parts[0].push_str(&context_block);
}
```

**Step 4: Update `StartStreamArgs` struct**

Add `excluded_context` field:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartStreamArgs {
    pub project_id: String,
    pub phase: String,
    pub messages: Vec<ChatMessage>,
    pub excluded_context: Option<Vec<String>>,   // <-- new
}
```

**Step 5: Pass `excluded_context` in `start_stream` handler**

In the `start_stream` function, extract the excluded list:
```rust
let excluded_context = args.excluded_context.unwrap_or_default();
```

Then update the `build_system_prompt` call to pass it:
```rust
let system_prompt = build_system_prompt(
    &skills_root,
    &output_dir,
    &project_name,
    skill_name,
    input_files,
    last_user_msg,
    team_mode,
    &args.phase,
    &config_dir,
    &excluded_context,   // <-- add this
).map_err(...)?;
```

**Step 6: Update TypeScript API type**

In `tauri-api.ts`, change `startStream`:
```typescript
startStream: (args: { projectId: string; phase: string; messages: ChatMessage[]; excludedContext?: string[] }) =>
  invoke<void>("start_stream", { args }),
```

**Step 7: Update `useAiStream` hook**

In `use-ai-stream.ts`, change `start` signature:

```typescript
start: (messages: Array<{ role: string; content: string }>, options?: { excludedContext?: string[] }) => void
```

Inside the `start` implementation, change the `api.startStream` call:
```typescript
api.startStream({ projectId, phase, messages, excludedContext: options?.excludedContext }).catch(...)
```

The full `start` callback declaration in the hook (find the `useCallback` with `api.startStream` call) needs the `options` parameter added.

**Step 8: Build to verify**

```bash
cd <AI_PM_ROOT>/app/src-tauri && cargo build 2>&1 | tail -20
```
Expected: no errors.

**Step 9: Commit**

```bash
git add app/src-tauri/src/commands/stream.rs app/src/lib/tauri-api.ts app/src/hooks/use-ai-stream.ts
git commit -m "feat: inject tool context files into system prompt, support excluded_context"
```

---

### Task 3: `run_tool` project binding backend

**Files:**
- Modify: `app/src-tauri/src/commands/tools.rs`
- Modify: `app/src/lib/tauri-api.ts`
- Modify: `app/src/hooks/use-tool-stream.ts`

**Context:** When a tool runs with a bound project, output saves to `<output_dir>/context/<tool_name>-<date>.md`. Tool name in the filename uses the short form (strip `ai-pm-` prefix), e.g. `ai-pm-interview` → `interview`.

**Step 1: Add `project_id` to `RunToolArgs`**

In `tools.rs`, change the struct:
```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunToolArgs {
    pub tool_name: String,
    pub user_input: String,
    pub file_path: Option<String>,
    pub project_id: Option<String>,   // <-- new
}
```

**Step 2: Save to project context dir when `project_id` is set**

In `run_tool`, after `Ok(result) =>` in the match block, replace the current single-file save with:

```rust
Ok(result) => {
    let duration_ms = stream_start.elapsed().as_millis() as u64;

    // Always save to tools_dir (existing behavior)
    let out_path = tools_dir.join("output.md");
    let _ = fs::write(&out_path, &result.full_text);

    // Additionally save to project context dir if project_id was provided
    if let Some(ref pid) = args.project_id {
        let project_output_dir: Option<String> = {
            let db = state.db.lock().ok();
            db.and_then(|db| {
                db.query_row(
                    "SELECT output_dir FROM projects WHERE id = ?1",
                    rusqlite::params![pid],
                    |row| row.get(0),
                ).ok()
            })
        };
        if let Some(output_dir) = project_output_dir {
            let context_dir = Path::new(&output_dir).join("context");
            let _ = fs::create_dir_all(&context_dir);
            // Short name: strip "ai-pm-" prefix
            let short_name = args.tool_name.strip_prefix("ai-pm-").unwrap_or(&args.tool_name);
            let date_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
            let context_file = context_dir.join(format!("{}-{}.md", short_name, date_str));
            let _ = fs::write(&context_file, &result.full_text);
        }
    }

    let done_payload = serde_json::json!({
        "outputFile": out_path.to_string_lossy(),
        "durationMs": duration_ms,
        "inputTokens": result.input_tokens,
        "outputTokens": result.output_tokens,
        "finalText": result.full_text,
    });
    let _ = app.emit("stream_done", done_payload);
}
```

Note: `chrono` is already a dependency (used in projects.rs). Verify with `grep chrono app/src-tauri/Cargo.toml`.

**Step 3: Update TypeScript API type**

In `tauri-api.ts`, change `runTool`:
```typescript
runTool: (args: { toolName: string; userInput: string; filePath?: string; projectId?: string }) =>
  invoke<void>("run_tool", { args }),
```

**Step 4: Update `useToolStream` hook**

In `use-tool-stream.ts`, change the function signature:
```typescript
export function useToolStream(toolName: string, projectId?: string): UseToolStreamReturn {
```

Inside `run` callback, change the `api.runTool` call:
```typescript
api.runTool({ toolName, userInput, filePath, projectId }).catch(...)
```

Also add `projectId` to the `useCallback` dependency array.

**Step 5: Build + check Cargo.toml**

```bash
grep chrono <AI_PM_ROOT>/app/src-tauri/Cargo.toml
```
If not present, add: `chrono = "0.4"` to `[dependencies]` in Cargo.toml.

```bash
cd <AI_PM_ROOT>/app/src-tauri && cargo build 2>&1 | tail -20
```

**Step 6: Commit**

```bash
git add app/src-tauri/src/commands/tools.rs app/src/lib/tauri-api.ts app/src/hooks/use-tool-stream.ts
git commit -m "feat: run_tool saves output to project context dir when project_id is bound"
```

---

### Task 4: `ContextPills` component

**Files:**
- Create: `app/src/components/context-pills.tsx`

**Context:** Renders a row of pills above generation controls. Each context file = one pill with × to exclude. Knowledge entries = one pill without ×. Hover shows file preview tooltip. No pills row when empty.

**Step 1: Create the component**

Create `app/src/components/context-pills.tsx`:

```tsx
import { useState, useEffect } from "react"
import { api, type ContextFile } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface ContextPillsProps {
  projectId: string
  /** Called whenever excluded set changes */
  onExcludeChange: (excluded: string[]) => void
  className?: string
}

/** "ai-pm-interview-2026-03-17.md" → "INTERVIEW 03-17" */
function formatPillName(fileName: string): string {
  const base = fileName.replace(/^ai-pm-/, "").replace(/\.md$/, "")
  const dateMatch = base.match(/(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const toolPart = base.replace(/-\d{4}-\d{2}-\d{2}$/, "").toUpperCase()
    return `${toolPart} ${dateMatch[2]}-${dateMatch[3]}`
  }
  return base.toUpperCase()
}

export function ContextPills({ projectId, onExcludeChange, className }: ContextPillsProps) {
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])
  const [knowledgeCount, setKnowledgeCount] = useState(0)
  const [excluded, setExcluded] = useState<string[]>([])
  const [tooltip, setTooltip] = useState<{ name: string; preview: string } | null>(null)

  useEffect(() => {
    api.listProjectContext(projectId).then(setContextFiles).catch(console.error)
    api.listKnowledge().then((entries) => setKnowledgeCount(entries.length)).catch(console.error)
  }, [projectId])

  const toggle = (name: string) => {
    const next = excluded.includes(name)
      ? excluded.filter((n) => n !== name)
      : [...excluded, name]
    setExcluded(next)
    onExcludeChange(next)
  }

  if (contextFiles.length === 0 && knowledgeCount === 0) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-3",
        className,
      )}
    >
      {/* Label */}
      <span className="font-terminal text-[10px] uppercase tracking-[2px] text-[var(--text-muted)] shrink-0">
        注入上下文：
      </span>

      {/* Context file pills */}
      {contextFiles.map((file) => {
        const isExcluded = excluded.includes(file.name)
        return (
          <div
            key={file.name}
            className="relative"
            onMouseEnter={() => setTooltip(file)}
            onMouseLeave={() => setTooltip(null)}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5",
                "font-terminal text-[10px] uppercase tracking-[1px]",
                "border transition-colors duration-[var(--duration-terminal)]",
                isExcluded
                  ? "border-[var(--border)] text-[var(--text-muted)] opacity-40 line-through"
                  : "border-[var(--border)] text-[var(--dark)]"
              )}
            >
              {formatPillName(file.name)}
              <button
                type="button"
                onClick={() => toggle(file.name)}
                className="opacity-50 hover:opacity-100 transition-opacity"
                title={isExcluded ? "重新包含" : "排除此上下文"}
              >
                ×
              </button>
            </span>

            {/* Preview tooltip */}
            {tooltip?.name === file.name && (
              <div className="absolute bottom-full left-0 mb-1 z-50 w-64 p-3 bg-[var(--secondary)] border border-[var(--border)] shadow-lg">
                <p className="font-terminal text-[9px] uppercase tracking-[1px] text-[var(--text-muted)] mb-1">
                  {file.name}
                </p>
                <p className="text-xs text-[var(--dark)] leading-relaxed line-clamp-4">
                  {file.preview}
                </p>
              </div>
            )}
          </div>
        )
      })}

      {/* Knowledge pill (no × — knowledge exclusion is out of scope) */}
      {knowledgeCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 font-terminal text-[10px] uppercase tracking-[1px] border border-[var(--border)] text-[var(--text-muted)]">
          知识库 · {knowledgeCount}条
        </span>
      )}
    </div>
  )
}
```

**Step 2: Verify dev server accepts it**

```bash
cd <AI_PM_ROOT>/app && npm run dev 2>&1 | head -20
```
Expected: Vite starts, no TypeScript errors.

**Step 3: Commit**

```bash
git add app/src/components/context-pills.tsx
git commit -m "feat: ContextPills component with exclude toggle and hover preview"
```

---

### Task 5: Wire ContextPills into all 6 phase pages

**Files:**
- Modify: `app/src/pages/project/Analysis.tsx`
- Modify: `app/src/pages/project/Research.tsx`
- Modify: `app/src/pages/project/Stories.tsx`
- Modify: `app/src/pages/project/Prd.tsx`
- Modify: `app/src/pages/project/Prototype.tsx`
- Modify: `app/src/pages/project/Review.tsx`

**Context:** `ContextPills` shows below the Badge/divider line, before main content. It feeds `excludedContext` to `start()` when the user triggers generation.

**The pattern is the same for all 6 pages:**

1. Add import:
   ```tsx
   import { ContextPills } from "@/components/context-pills"
   ```

2. Add state for excluded context:
   ```tsx
   const [excludedContext, setExcludedContext] = useState<string[]>([])
   ```

3. In `handleGenerate` (and `handleRegenerate` / `handleRestart`), pass excludedContext to `start()`:
   ```tsx
   start(initialMessages, { excludedContext })
   ```
   For Prototype (no messages): `start([{ role: "user", content: "请生成产品原型" }], { excludedContext })`

4. After the `<div className="h-px bg-[var(--border)]" />` header divider, add:
   ```tsx
   <ContextPills
     projectId={projectId!}
     onExcludeChange={setExcludedContext}
     className="border-b border-[var(--border)] px-0"
   />
   ```

**Read each page before editing to find exact locations.** The divider is typically at the top of the main return block.

**Step 1: Implement Analysis.tsx**

Read the file, apply the 4 changes above.

**Step 2: Implement Research.tsx**

Same pattern.

**Step 3: Implement Stories.tsx**

Same pattern. Check if `handleGenerate` uses the same `start(messages, options?)` call pattern.

**Step 4: Implement Prd.tsx**

Same pattern. Also add `excludedContext` to the `handleRestart` / regenerate handler if present.

**Step 5: Implement Prototype.tsx**

Same pattern. `handleGenerate` and `handleRegenerate` both call `start(...)` — add `{ excludedContext }` to both.

**Step 6: Implement Review.tsx**

Same pattern.

**Step 7: Commit**

```bash
git add app/src/pages/project/
git commit -m "feat: ContextPills wired into all 6 phase pages"
```

---

### Task 6: `ProjectSelector` component + tool pages binding

**Files:**
- Create: `app/src/components/project-selector.tsx`
- Modify: `app/src/pages/tools/Interview.tsx`
- Modify: `app/src/pages/tools/Data.tsx`

**Context:** Interview and Data tool pages get a project binding selector at the top. Reads `?projectId=` from URL (populated by sidebar links in Task 7) or user picks manually. Persists to localStorage per tool.

**Step 1: Create `project-selector.tsx`**

Create `app/src/components/project-selector.tsx`:

```tsx
import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { api, type ProjectSummary } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface ProjectSelectorProps {
  toolKey: string  // e.g. "interview", "data"  — used as localStorage key
  value: string | null
  onChange: (projectId: string | null) => void
  className?: string
}

export function ProjectSelector({ toolKey, value, onChange, className }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    onChange(id)
    if (id) {
      localStorage.setItem(`tool-binding:${toolKey}`, id)
    } else {
      localStorage.removeItem(`tool-binding:${toolKey}`)
    }
  }

  const selectedProject = projects.find((p) => p.id === value)

  return (
    <div
      className={cn(
        "flex items-center gap-3 pb-3 mb-4 border-b border-[var(--border)]",
        className,
      )}
    >
      <span className="font-terminal text-[10px] uppercase tracking-[2px] text-[var(--text-muted)] shrink-0">
        绑定项目
      </span>
      <select
        value={value ?? ""}
        onChange={handleChange}
        className={cn(
          "flex-1 h-8 px-2 text-sm bg-transparent border border-[var(--border)]",
          "text-[var(--dark)] outline-none",
          "focus:border-[var(--yellow)] transition-colors duration-[var(--duration-terminal)]"
        )}
      >
        <option value="">— 不绑定 —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {selectedProject && (
        <span className="font-terminal text-[10px] text-[var(--text-muted)] shrink-0">
          运行后自动保存上下文
        </span>
      )}
    </div>
  )
}
```

**Step 2: Add project binding to Interview.tsx**

Read `app/src/pages/tools/Interview.tsx` first.

Add imports at the top:
```tsx
import { useSearchParams } from "react-router-dom"
import { ProjectSelector } from "@/components/project-selector"
```

Add state after existing `useState` calls:
```tsx
const [searchParams] = useSearchParams()
const [boundProjectId, setBoundProjectId] = useState<string | null>(() => {
  const fromUrl = searchParams.get("projectId")
  if (fromUrl) return fromUrl
  return localStorage.getItem("tool-binding:interview") ?? null
})
```

Change `useToolStream` call to pass `boundProjectId`:
```tsx
const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
  useToolStream("ai-pm-interview", boundProjectId ?? undefined)
```

Add `<ProjectSelector>` in the JSX — insert after the `<div className="h-px bg-[var(--border)]" />` divider:
```tsx
<ProjectSelector
  toolKey="interview"
  value={boundProjectId}
  onChange={setBoundProjectId}
  className="mt-4"
/>
```

**Step 3: Add project binding to Data.tsx**

Same pattern as Interview.tsx:
- Import `useSearchParams` + `ProjectSelector`
- Add `boundProjectId` state (key: `"data"`, URL param: `"projectId"`)
- Pass `boundProjectId` to `useToolStream("ai-pm-data", boundProjectId ?? undefined)`
- Add `<ProjectSelector toolKey="data" .../>` after the divider

**Step 4: Commit**

```bash
git add app/src/components/project-selector.tsx \
        app/src/pages/tools/Interview.tsx \
        app/src/pages/tools/Data.tsx
git commit -m "feat: ProjectSelector component, Interview + Data tools bind to project"
```

---

### Task 7: Sidebar TOOLS links pass `?projectId=` when in project

**Files:**
- Modify: `app/src/components/layout/Sidebar.tsx`

**Context:** `Sidebar` already receives `activeProjectId?: string` prop. When set, tool links should include `?projectId=<activeProjectId>` so the tool page auto-binds to the current project.

**Step 1: Read Sidebar.tsx**

Read the full file. Confirm `activeProjectId` is a prop.

**Step 2: Update TOOLS navigation**

Find the tool item `navigate(tool.path)` call inside the `<button onClick=...>`. Change it to:

```tsx
onClick={() => navigate(activeProjectId ? `${tool.path}?projectId=${activeProjectId}` : tool.path)}
```

**Step 3: Verify SidebarShell passes activeProjectId**

Read `app/src/components/layout/SidebarShell.tsx` (or wherever `Sidebar` is rendered). Confirm it passes `activeProjectId`. If not, find where to get the current projectId from the URL and pass it.

Expected: `SidebarShell` uses `useParams()` to get the project id and passes it to `<Sidebar activeProjectId={id}>`.

**Step 4: Commit**

```bash
git add app/src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar TOOLS links pass ?projectId= when viewing a project"
```

---

### Task 8: Dashboard search

**Files:**
- Modify: `app/src/pages/Dashboard.tsx`

**Context:** Simple client-side filter. Input above the project list. No backend changes.

**Step 1: Read Dashboard.tsx**

Read the full file to find: (a) where project list renders, (b) where the `// PROJECTS` header is.

**Step 2: Add search state**

Add after existing `useState` calls:
```tsx
const [search, setSearch] = useState("")
```

**Step 3: Filter projects**

Add derived variable after `setProjects` state:
```tsx
const filteredProjects = search.trim()
  ? projects.filter((p) =>
      p.name.toLowerCase().includes(search.trim().toLowerCase())
    )
  : projects
```

**Step 4: Add search input in JSX**

After the `// PROJECTS` header `<div className="mb-8 flex...">` block (and divider), add:

```tsx
{/* Search */}
{projects.length > 3 && (
  <div className="mb-4">
    <input
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="搜索项目..."
      className="w-full h-9 px-3 text-sm bg-transparent border border-[var(--border)] placeholder:text-[var(--text-muted)] text-[var(--dark)] outline-none focus:border-[var(--yellow)] transition-colors duration-[var(--duration-terminal)]"
    />
  </div>
)}
```

(Only show when >3 projects to avoid cluttering an empty dashboard.)

**Step 5: Use `filteredProjects` in the card map**

Change `{projects.map((project, index) =>` to `{filteredProjects.map((project, index) =>`.

**Step 6: Add empty search result state**

After the project list, add:
```tsx
{filteredProjects.length === 0 && search && (
  <div className="py-16 text-center">
    <p className="font-terminal text-xs text-[var(--text-muted)] uppercase tracking-[2px]">
      NO RESULTS
    </p>
    <p className="mt-2 text-sm text-[var(--text-muted)]">没有匹配「{search}」的项目</p>
  </div>
)}
```

**Step 7: Commit**

```bash
git add app/src/pages/Dashboard.tsx
git commit -m "feat: dashboard project search (client-side filter)"
```

---

### Task 9: Dashboard phase mini-map

**Files:**
- Modify: `app/src-tauri/src/commands/projects.rs`
- Modify: `app/src/lib/tauri-api.ts`
- Modify: `app/src/pages/Dashboard.tsx`

**Context:** Dashboard cards show 7 hex dots indicating which phases are complete. Requires `completedPhases: string[]` added to `ProjectSummary`. SQL uses `GROUP_CONCAT` to aggregate completed phase names.

**Step 1: Read projects.rs `list_projects` function**

Read the current SQL query in `list_projects`. It currently counts completed phases. Need to also collect their names.

**Step 2: Update SQL query**

Change the SELECT in `list_projects` to add `GROUP_CONCAT`:

```sql
SELECT p.id, p.name, p.description, p.current_phase, p.output_dir, p.created_at, p.updated_at,
       COUNT(CASE WHEN pp.status = 'completed' THEN 1 END) as completed_count,
       GROUP_CONCAT(CASE WHEN pp.status = 'completed' THEN pp.phase END) as completed_phases
FROM projects p
LEFT JOIN project_phases pp ON pp.project_id = p.id
GROUP BY p.id
ORDER BY p.updated_at DESC
```

**Step 3: Update `ProjectSummary` struct**

Add `completed_phases` field:
```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_phase: String,
    pub output_dir: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed_count: i64,
    pub total_phases: i64,
    pub completed_phases: Vec<String>,   // <-- new
}
```

**Step 4: Parse `completed_phases` in `query_map`**

In the `query_map` closure, add:
```rust
Ok(ProjectSummary {
    // existing fields...
    completed_count: row.get(7)?,
    total_phases: 7,
    completed_phases: row.get::<_, Option<String>>(8)?
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect(),
})
```

**Step 5: Update TypeScript type**

In `tauri-api.ts`, add to `ProjectSummary`:
```typescript
completedPhases: string[]
```

**Step 6: Add `PhaseMiniMap` component inline in Dashboard.tsx**

Add before `DashboardPage` function:

```tsx
const PHASE_ORDER = ["requirement", "analysis", "research", "stories", "prd", "prototype", "review"] as const

function PhaseMiniMap({ completedPhases }: { completedPhases: string[] }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {PHASE_ORDER.map((phase) => {
        const done = completedPhases.includes(phase)
        return (
          <div
            key={phase}
            className="w-2.5 h-2.5"
            style={{
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              background: done ? "var(--yellow)" : "var(--border)",
              opacity: done ? 0.9 : 0.4,
            }}
          />
        )
      })}
    </div>
  )
}
```

**Step 7: Render mini-map in project cards**

Inside the project card render, find where `<ProgressBar>` is rendered. Add `<PhaseMiniMap>` after it:

```tsx
<ProgressBar value={progress} className="h-1" />
<PhaseMiniMap completedPhases={project.completedPhases} />
```

**Step 8: Build and verify**

```bash
cd <AI_PM_ROOT>/app/src-tauri && cargo build 2>&1 | tail -20
```

**Step 9: Commit**

```bash
git add app/src-tauri/src/commands/projects.rs app/src/lib/tauri-api.ts app/src/pages/Dashboard.tsx
git commit -m "feat: dashboard phase mini-map, list_projects returns completedPhases"
```

---

## Execution Order

Tasks 1 → 2 → 3 are backend-only, independent of each other.
Task 4 depends on Task 1 (needs `listProjectContext` API).
Task 5 depends on Tasks 2 + 4 (needs `excludedContext` in stream + ContextPills).
Task 6 depends on Task 3 (needs `projectId` in `runTool`).
Task 7 depends on nothing (sidebar change only).
Tasks 8 + 9 are dashboard only, independent.

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**

Total files touched: ~20 files across frontend + backend.
