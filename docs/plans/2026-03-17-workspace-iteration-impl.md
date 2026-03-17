# Workspace Iteration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix phase auto-trigger navigation bug, inject knowledge base context into generation, and pixel-correct the 终末地 design system across all pages.

**Architecture:** (1) Add `?autostart=1` URL param to control when phase pages trigger AI — navigation never auto-triggers, only explicit advance buttons do. (2) `build_system_prompt` in Rust reads `<config_dir>/knowledge/` and injects all entries before generation. (3) CSS utility class `font-terminal` consolidates the repeated monospace font string; emoji icons removed from sidebar; stage nav allows all stages to be clicked.

**Tech Stack:** Tauri 2 (Rust backend), React 19 + TypeScript, react-router-dom v7, Tailwind CSS v4, Geist fonts

---

## Key Files Reference

- Design tokens: `app/src/index.css`
- Phase nav component: `app/src/components/stage-nav.tsx`
- Sidebar: `app/src/components/layout/Sidebar.tsx`
- Project layouts: `app/src/layouts/{AppLayout,ProjectLayout,ToolsLayout}.tsx`
- Router: `app/src/router.tsx`
- Phase pages: `app/src/pages/project/{Analysis,Research,Stories,Prd,Prototype,Review,Requirement}.tsx`
- Tool pages: `app/src/pages/tools/{Priority,Weekly,Knowledge,Persona,Data,Interview}.tsx`
- Dialog: `app/src/components/new-project-dialog.tsx`
- Rust stream: `app/src-tauri/src/commands/stream.rs`
- AppState (has config_dir): `app/src-tauri/src/state.rs`

The 终末地 design standard (from `docs/plans/2026-03-15-ai-pm-web-design.md`):
- `--yellow: #fffa00` — only on interactive elements and progress
- `--radius: 0` — zero border-radius everywhere
- Font: GeistMono for HUD/labels, GeistSans for body
- Left colored stripe on cards: yellow=P0, teal=P1, grey=P2
- `//` brand prefix, hex nodes for phase nav, green pulse dot

---

### Task 1: font-terminal CSS utility + global migration

**Files:**
- Modify: `app/src/index.css`
- Modify: `app/src/components/layout/Sidebar.tsx`
- Modify: `app/src/components/layout/TitleBar.tsx`
- Modify: `app/src/components/layout/ProjectStageBar.tsx`
- Modify: `app/src/components/stage-nav.tsx`
- Modify: `app/src/components/new-project-dialog.tsx`
- Modify: `app/src/components/ui/badge.tsx`
- Modify: `app/src/pages/tools/Priority.tsx`
- Modify: `app/src/pages/tools/Knowledge.tsx` (and other tool pages with the pattern)
- Modify: `app/src/pages/project/Analysis.tsx` (and other phase pages)

**Context:** Every file that uses GeistMono has this verbose class:
`font-[var(--font-geist-mono),_'Courier_New',_monospace]`
or `font-[var(--font-geist-mono),_'Courier_New',_Courier,_monospace]`
Some files use `font-mono` (Tailwind built-in — maps to a generic monospace stack, NOT GeistMono).
We consolidate to a single utility class `font-terminal`.

**Step 1: Add utility class to index.css**

In `app/src/index.css`, add after the `@layer base { ... }` block:

```css
/* ============================================================
   Utility Classes
   ============================================================ */

@layer utilities {
  .font-terminal {
    font-family: var(--font-geist-mono), 'Courier New', monospace;
  }
}
```

**Step 2: Global replace in all TypeScript/TSX files**

Run these from `app/src/`:

```bash
# Replace the long variant (with trailing comma variant)
grep -rl 'font-\[var(--font-geist-mono),_' app/src --include="*.tsx" --include="*.ts"
```

Then in each file that matches, replace:
- `font-[var(--font-geist-mono),_'Courier_New',_monospace]` → `font-terminal`
- `font-[var(--font-geist-mono),_'Courier_New',_Courier,_monospace]` → `font-terminal`

Also in badge.tsx line 9 replace the long string in the CVA config with `font-terminal`.

**Step 3: Fix `font-mono` usages**

`font-mono` (Tailwind built-in) appears in some places — check if they should be `font-terminal`:
- `app/src/pages/tools/Priority.tsx` line 98: `font-mono` → `font-terminal`
- Any other `font-mono` in src → replace with `font-terminal` if it's labelling/HUD text

**Step 4: Verify dev server still starts**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npm run dev
```
Expected: Vite starts on port 1420, no CSS compile errors.

**Step 5: Commit**

```bash
git add app/src/index.css app/src/components app/src/pages
git commit -m "style: add font-terminal utility, migrate all GeistMono usages"
```

---

### Task 2: Sidebar TOOLS section — remove emojis, fix typography

**Files:**
- Modify: `app/src/components/layout/Sidebar.tsx`

**Context:** The TOOLS section uses emoji icons (`icon: "⚡"`) completely off-brand for the terminal aesthetic. The design uses monospace text labels. The emoji `<span>` should be removed; labels get `font-terminal` typography.

**Step 1: Update TOOLS constant — remove icon field**

In `Sidebar.tsx`, change the TOOLS array from:
```tsx
const TOOLS = [
  { path: "/tools/priority",  label: "需求优先级", icon: "⚡" },
  { path: "/tools/weekly",    label: "工作周报",   icon: "📋" },
  { path: "/tools/knowledge", label: "知识库",     icon: "🧠" },
  { path: "/tools/persona",   label: "产品分身",   icon: "🪞" },
  { path: "/tools/data",      label: "数据洞察",   icon: "📊" },
  { path: "/tools/interview", label: "调研访谈",   icon: "🎯" },
]
```
To:
```tsx
const TOOLS = [
  { path: "/tools/priority",  label: "需求优先级" },
  { path: "/tools/weekly",    label: "工作周报"   },
  { path: "/tools/knowledge", label: "知识库"     },
  { path: "/tools/persona",   label: "产品分身"   },
  { path: "/tools/data",      label: "数据洞察"   },
  { path: "/tools/interview", label: "调研访谈"   },
]
```

**Step 2: Update tool item render — remove icon span, fix label typography**

Find the tool item render block (the `<button>` inside the TOOLS `<ul>`). Change from:
```tsx
<span className="text-[11px]">{tool.icon}</span>
<span className="text-xs">{tool.label}</span>
```
To (single span with terminal styling):
```tsx
<span className="font-terminal text-[11px] uppercase tracking-[1.5px]">
  {tool.label}
</span>
```

Also update the TypeScript interface for TOOLS items (remove `icon` if it's in a typed interface, or just let TypeScript infer from the array).

**Step 3: Visual check**

Open the app, look at the sidebar TOOLS section. Should show all 6 tools as uppercase monospace text labels without any emoji.

**Step 4: Commit**

```bash
git add app/src/components/layout/Sidebar.tsx
git commit -m "style: remove emoji icons from TOOLS sidebar, use terminal typography"
```

---

### Task 3: StageNav — all stages clickable + fix hardcoded colors

**Files:**
- Modify: `app/src/components/stage-nav.tsx`

**Context:** Currently `locked` stages cannot be clicked (`clickable = completed || current`). This is the root of the navigation bug — if the user is at step 5 and wants to review step 2, they can (completed → clickable), but if they're at step 2 and want to peek at step 5 (locked), they can't. The design intention is that ALL stages should be navigable so users can browse their project freely. Also `#d0d0d0` hardcoded color should use CSS vars.

**Step 1: Make all stages clickable**

In `stage-nav.tsx`, change:
```tsx
const clickable = status === "completed" || status === "current"
```
To:
```tsx
const clickable = true
```

And on the button element, change `disabled={!clickable}` to `disabled={false}` (or remove the disabled prop entirely):
```tsx
// Before:
disabled={!clickable}
onClick={() => clickable && onStageClick?.(stage.id)}

// After:
onClick={() => onStageClick?.(stage.id)}
```

**Step 2: Replace hardcoded #d0d0d0 with CSS vars**

Find all `#d0d0d0` in stage-nav.tsx and replace:
- As border/line color: `#d0d0d0` → `var(--border)`
- As text color on locked nodes: `text-[#d0d0d0]` → `text-[var(--text-muted)]`
- As background on locked nodes: `bg-[#d0d0d0]` → `bg-[var(--border)]`

There are ~4 occurrences total.

**Step 3: Update locked cursor style**

The locked button currently has `cursor-default opacity-50`. Since all stages are now navigable, change locked to `cursor-pointer opacity-50` (dimmed but clickable):
```tsx
status === "locked" && [
  "bg-transparent",
  "cursor-pointer opacity-50",
  "hover:opacity-75",
]
```

**Step 4: Visual check**

Navigate to a project, confirm:
- Completed stages: yellow filled hex ✓
- Current stage: yellow border + pulse ring ✓
- Future/locked stages: dim but still clickable (clicking navigates to them)

**Step 5: Commit**

```bash
git add app/src/components/stage-nav.tsx
git commit -m "fix: make all stage nav nodes clickable, replace hardcoded colors with CSS vars"
```

---

### Task 4: Settings page → SidebarShell layout

**Files:**
- Modify: `app/src/router.tsx`

**Context:** Settings currently uses `AppLayout` (TitleBar only, no sidebar). ToolsLayout = TitleBar + SidebarShell + main. Moving Settings under ToolsLayout gives it the same chrome as tool pages.

**Step 1: Update router.tsx**

Change the root route so Settings uses ToolsLayout:
```tsx
// Before (in router.tsx):
{
  path: "/",
  element: <AppLayout />,
  children: [
    { index: true, element: <DashboardPage /> },
    { path: "settings", element: <SettingsPage /> },
  ],
},

// After:
{
  path: "/",
  element: <AppLayout />,
  children: [
    { index: true, element: <DashboardPage /> },
  ],
},
{
  path: "/settings",
  element: <ToolsLayout />,
  children: [
    { index: true, element: <SettingsPage /> },
  ],
},
```

Add the ToolsLayout import if not already present at the top (it already is in the file).

**Step 2: Check Settings navigation**

The TitleBar has a Settings button that calls `navigate("/settings")` — this still works since the path is unchanged.

The Settings page itself may have a "返回" / back button — verify it still works.

**Step 3: Visual check**

Navigate to Settings. Should now have sidebar on the left, just like tools pages.

**Step 4: Commit**

```bash
git add app/src/router.tsx
git commit -m "fix: settings page now uses SidebarShell layout for consistent chrome"
```

---

### Task 5: Remaining UI polish — blink animation, Knowledge tabs, checkbox

**Files:**
- Modify: `app/src/pages/project/Analysis.tsx`
- Modify: `app/src/pages/project/Research.tsx`
- Modify: `app/src/pages/project/Stories.tsx`
- Modify: `app/src/pages/project/Prd.tsx`
- Modify: `app/src/pages/project/Prototype.tsx`
- Modify: `app/src/pages/project/Review.tsx`
- Modify: `app/src/pages/tools/Priority.tsx`
- Modify: `app/src/pages/tools/Weekly.tsx`
- Modify: `app/src/pages/tools/Interview.tsx`
- Modify: `app/src/pages/tools/Persona.tsx`
- Modify: `app/src/pages/tools/Data.tsx`
- Modify: `app/src/pages/tools/Knowledge.tsx`
- Modify: `app/src/components/new-project-dialog.tsx`

**Context:** Three polish items:
1. `animate-pulse` on "正在思考..." text looks generic; terminal blink (`blink` keyframe already in index.css) is more on-brand.
2. Knowledge category tabs use yellow background for active state — should use yellow underline (less heavy, matches other tab patterns in the app).
3. Native checkbox with `accent-[var(--yellow)]` renders differently per OS — replace with a styled terminal checkbox.

**Step 1: Replace animate-pulse with terminal blink in all pages**

In every file that has:
```tsx
<p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>
```
Change to:
```tsx
<p className="mt-2 font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)] animate-[blink_1s_step-end_infinite]">
  THINKING...
</p>
```
(Also update the text to English to match HUD style.)

**Step 2: Fix Knowledge category tabs active state**

In `Knowledge.tsx`, find the category tab buttons. The active state currently has something like `bg-[var(--yellow)] text-[var(--dark)]`. Change to underline pattern:
```tsx
// Active tab:
"border-b-2 border-[var(--yellow)] text-[var(--dark)] font-medium"
// Inactive tab:
"border-b-2 border-transparent text-[var(--text-muted)] hover:text-[var(--dark)]"
```
Read the full Knowledge.tsx file first to find exact class locations.

**Step 3: Styled terminal checkbox in new-project-dialog**

In `new-project-dialog.tsx`, replace the native checkbox + label with a custom styled version:
```tsx
{/* Team mode toggle */}
<div className="mb-6">
  <button
    type="button"
    onClick={() => setTeamMode(!teamMode)}
    className="flex items-center gap-3 cursor-pointer group"
  >
    <span className={cn(
      "inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors duration-[var(--duration-terminal)]",
      teamMode
        ? "border-[var(--yellow)] bg-[var(--yellow)]"
        : "border-[var(--border)] bg-transparent group-hover:border-[var(--yellow)]"
    )}>
      {teamMode && (
        <span className="block h-2 w-2 bg-[var(--dark)]" />
      )}
    </span>
    <span className="text-sm text-[var(--text-muted)]">多代理模式（复杂需求）</span>
  </button>
</div>
```

**Step 4: Visual check all 3 changes**

- Navigate to any project phase, start generation → confirm "THINKING..." blink instead of fade pulse
- Open Knowledge tool → click category tabs → confirm yellow underline, not yellow background
- Open new project dialog → click team mode → confirm custom yellow checkbox

**Step 5: Commit**

```bash
git add app/src/pages app/src/components/new-project-dialog.tsx
git commit -m "style: terminal blink animation, Knowledge tab underline, styled checkbox"
```

---

### Task 6: PhaseEmptyState component

**Files:**
- Create: `app/src/components/phase-empty-state.tsx`

**Context:** When a phase has no generated file and no `?autostart=1` param, pages need to show an empty state instead of triggering AI. This component is the reusable empty state UI — hexagon icon + label + generate button. All 6 AI phase pages (Analysis, Research, Stories, Prd, Prototype, Review) will use it.

**Step 1: Create the component**

Create `app/src/components/phase-empty-state.tsx`:

```tsx
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PhaseEmptyStateProps {
  /** HUD label shown above the hex, e.g. "ANALYSIS" */
  phaseLabel: string
  /** Human-readable description, e.g. "需求分析报告" */
  description: string
  /** Called when user clicks the generate button */
  onGenerate: () => void
  disabled?: boolean
  className?: string
}

export function PhaseEmptyState({
  phaseLabel,
  description,
  onGenerate,
  disabled,
  className,
}: PhaseEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-24 gap-6",
        className,
      )}
    >
      {/* Hexagon placeholder */}
      <div
        className="flex items-center justify-center w-16 h-16 opacity-20"
        style={{
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          background: "var(--border)",
        }}
      >
        <span className="font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
          {phaseLabel.slice(0, 2)}
        </span>
      </div>

      {/* Labels */}
      <div className="flex flex-col items-center gap-2">
        <span className="font-terminal text-[10px] uppercase tracking-[3px] text-[var(--text-muted)]">
          {phaseLabel}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          尚未生成{description}
        </span>
      </div>

      {/* Generate button */}
      <Button
        variant="primary"
        onClick={onGenerate}
        disabled={disabled}
      >
        开始生成 →
      </Button>
    </div>
  )
}
```

**Step 2: Verify it compiles**

The component has no external dependencies beyond what's already in the project. No tests needed (pure UI).

**Step 3: Commit**

```bash
git add app/src/components/phase-empty-state.tsx
git commit -m "feat: PhaseEmptyState component for ungenerated phases"
```

---

### Task 7: Document-first navigation — Analysis + Research

**Files:**
- Modify: `app/src/pages/project/Analysis.tsx`
- Modify: `app/src/pages/project/Research.tsx`

**Context:** Both pages currently auto-trigger AI when the output file is absent on disk. Fix: check `?autostart=1` URL param. If file exists → show it. If no file + autostart=1 → trigger. If no file + no autostart → show PhaseEmptyState.

The pattern is identical for both pages; implement Analysis first, then copy the pattern to Research.

**Step 1: Update Analysis.tsx imports**

Add at top:
```tsx
import { useSearchParams } from "react-router-dom"
import { PhaseEmptyState } from "@/components/phase-empty-state"
```

**Step 2: Read autostart param in Analysis.tsx**

After the `useAiStream(...)` hook call, add:
```tsx
const [searchParams] = useSearchParams()
const autostart = searchParams.get("autostart") === "1"
```

**Step 3: Remove auto-trigger from loadExisting in Analysis.tsx**

Current `loadExisting` else-branch:
```tsx
} else {
  if (!startedRef.current) {
    startedRef.current = true
    const initialMessages: Message[] = [{ role: "user", content: "请开始分析" }]
    setMessages(initialMessages)
    start(initialMessages)
  }
}
```

New (only trigger if `autostart` is true):
```tsx
} else if (autostart) {
  if (!startedRef.current) {
    startedRef.current = true
    const initialMessages: Message[] = [{ role: "user", content: "请开始分析" }]
    setMessages(initialMessages)
    start(initialMessages)
  }
}
```

Also update the catch block the same way (replace unconditional start with `if (autostart)`):
```tsx
} catch (err) {
  console.error("Failed to load analysis file:", err)
  if (!cancelled && !startedRef.current && autostart) {
    startedRef.current = true
    const initialMessages: Message[] = [{ role: "user", content: "请开始分析" }]
    setMessages(initialMessages)
    start(initialMessages)
  }
}
```

**Step 4: Add handleGenerate in Analysis.tsx**

```tsx
const handleGenerate = useCallback(() => {
  const initialMessages: Message[] = [{ role: "user", content: "请开始分析" }]
  setMessages(initialMessages)
  startedRef.current = true
  start(initialMessages)
}, [start])
```

**Step 5: Add empty state render in Analysis.tsx**

In the render section, find the `if (loading) return ...` block. After it, add a check before the main return:
```tsx
// Empty state — no file, no autostart, not currently streaming
if (!loading && !existingContent && !text && !isStreaming && !error) {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-6 flex items-center justify-between">
        <Badge variant="outline">ANALYSIS</Badge>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <PhaseEmptyState
        phaseLabel="ANALYSIS"
        description="需求分析报告"
        onGenerate={handleGenerate}
      />
    </div>
  )
}
```

**Step 6: Apply same changes to Research.tsx**

Research.tsx follows the exact same pattern as Analysis.tsx. Make the same 5 changes:
- Import `useSearchParams` and `PhaseEmptyState`
- Read `autostart` param
- Update `loadExisting` else-branch to check `autostart`
- Add `handleGenerate`
- Add empty state render (use label `"RESEARCH"`, description `"竞品研究报告"`)

The initial message for Research is `"请开始竞品研究"`.

**Step 7: Visual check**

1. Navigate directly to `/project/<id>/analysis` (no autostart) on a project with no analysis file → empty state with "开始生成" button shows
2. Click "开始生成" → generation starts
3. Navigate with `?autostart=1` → generation auto-starts
4. Navigate to completed phase → shows existing content

**Step 8: Commit**

```bash
git add app/src/pages/project/Analysis.tsx app/src/pages/project/Research.tsx
git commit -m "fix: Analysis + Research use document-first navigation, no auto-trigger on mount"
```

---

### Task 8: Document-first navigation — Stories, Prd, Prototype, Review

**Files:**
- Modify: `app/src/pages/project/Stories.tsx`
- Modify: `app/src/pages/project/Prd.tsx`
- Modify: `app/src/pages/project/Prototype.tsx`
- Modify: `app/src/pages/project/Review.tsx`

**Context:** Same pattern as Task 7. Apply to remaining 4 phase pages. Read each file first to find the exact locations of auto-trigger code.

For each page, the steps are:
1. Add `useSearchParams` and `PhaseEmptyState` imports
2. Add `const [searchParams] = useSearchParams(); const autostart = searchParams.get("autostart") === "1"`
3. In `loadExisting` (or equivalent mount effect), gate the `start()` call with `&& autostart`
4. Add `handleGenerate` callback
5. Add empty state render before main return

**Prototype.tsx is special** — it does not have `messages` state. Its initial call is:
```tsx
start([{ role: "user", content: "请生成产品原型" }])
```
The empty state should show when: `!loading && !existingHtml && !text && !isStreaming && !error`

Phase labels and descriptions for empty states:
- Stories: `phaseLabel="STORIES"`, `description="用户故事"`
- Prd: `phaseLabel="PRD"`, `description="产品需求文档"`
- Prototype: `phaseLabel="PROTOTYPE"`, `description="交互原型"`
- Review: `phaseLabel="REVIEW"`, `description="需求评审报告"`

Initial messages:
- Stories: `"请开始编写用户故事"` (check Stories.tsx for exact text)
- Prd: `"请生成PRD"` (check Prd.tsx for exact text)
- Prototype: `[{ role: "user", content: "请生成产品原型" }]`
- Review: `"请开始评审"` (check Review.tsx)

**Read each file before implementing to find exact locations of the auto-trigger.**

**Step 1: Implement Stories.tsx**
Read `app/src/pages/project/Stories.tsx` first, then apply the 5-step pattern above.

**Step 2: Implement Prd.tsx**
Read `app/src/pages/project/Prd.tsx` first, then apply.

**Step 3: Implement Prototype.tsx**
Read the current `app/src/pages/project/Prototype.tsx` first.
Note: Prototype already has the fallback `wasStreamingRef` effect from a recent fix — keep it. Only add the autostart gate to the initial start call.

**Step 4: Implement Review.tsx**
Read `app/src/pages/project/Review.tsx` first, then apply.

**Step 5: Commit**

```bash
git add app/src/pages/project/Stories.tsx app/src/pages/project/Prd.tsx \
        app/src/pages/project/Prototype.tsx app/src/pages/project/Review.tsx
git commit -m "fix: Stories, Prd, Prototype, Review use document-first navigation"
```

---

### Task 9: All advance buttons → ?autostart=1

**Files:**
- Modify: `app/src/pages/project/Requirement.tsx`
- Modify: `app/src/pages/project/Analysis.tsx`
- Modify: `app/src/pages/project/Research.tsx`
- Modify: `app/src/pages/project/Stories.tsx`
- Modify: `app/src/pages/project/Prd.tsx`
- Modify: `app/src/pages/project/Prototype.tsx`

**Context:** After Tasks 7-8, phase pages no longer auto-trigger. But the "确认，进入下一步" buttons must still trigger generation on the destination page. They do so by appending `?autostart=1` to the navigation URL.

**Step 1: Requirement.tsx — handleStart**

Find the line in `handleStart`:
```tsx
navigate(`/project/${projectId}/analysis`)
```
Change to:
```tsx
navigate(`/project/${projectId}/analysis?autostart=1`)
```

**Step 2: Analysis.tsx — handleAdvance**

Find the navigate call at the end of handleAdvance. It currently navigates to `/stories` (skipping research in the original — keep this as-is, just add the param):
```tsx
navigate(`/project/${projectId}/stories`)
```
→
```tsx
navigate(`/project/${projectId}/stories?autostart=1`)
```

Wait — read `Analysis.tsx` handleAdvance to confirm the destination. The code reads `navigate(`/project/${projectId}/stories`)` — confirm this is correct before changing.

**Step 3: Research.tsx — handleAdvance**

Read `Research.tsx` to find its handleAdvance navigate call. Add `?autostart=1`.

**Step 4: Stories.tsx — handleAdvance**

Read `Stories.tsx` handleAdvance → add `?autostart=1` to navigation target.

**Step 5: Prd.tsx — handleAdvance**

Read `Prd.tsx` handleAdvance → add `?autostart=1`.

**Step 6: Prototype.tsx — handleAdvance**

In `Prototype.tsx`, `handleAdvance` navigates to review:
```tsx
navigate(`/project/${projectId}/review`)
```
→
```tsx
navigate(`/project/${projectId}/review?autostart=1`)
```

**Step 7: End-to-end flow test**

1. Create a new project
2. Fill in requirement, click "开始分析 →" → goes to Analysis with autostart=1 → generation triggers automatically ✓
3. Analysis completes, click "确认，进入用户故事 →" → goes to Stories with autostart=1 → triggers ✓
4. During any phase, click back to a previous phase in the stage nav → NO re-trigger, shows existing content ✓
5. Click forward to a future phase → empty state shows with "开始生成" button ✓

**Step 8: Commit**

```bash
git add app/src/pages/project/
git commit -m "fix: advance buttons append ?autostart=1 so only explicit advance triggers generation"
```

---

### Task 10: Knowledge base injection in stream.rs

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs`
- Reference (read-only): `app/src-tauri/src/state.rs` (to confirm `config_dir` field name)

**Context:** `build_system_prompt` builds the system prompt sent to the AI. The knowledge base is stored at `<config_dir>/knowledge/<category>/<slug>.md`. We add a `load_knowledge` function that reads all entries and a compact formatted block is appended to the system prompt.

**Step 1: Read state.rs to confirm AppState shape**

```bash
cat app/src-tauri/src/state.rs
```
Confirm `AppState` has `config_dir: String` field.

**Step 2: Pass config_dir to start_stream handler**

In `start_stream`, the state is already accessed:
```rust
let (project_name, output_dir, team_mode) = {
    let db = state.db.lock()...
```

Add config_dir extraction:
```rust
let config_dir = state.config_dir.clone();
```

**Step 3: Add load_knowledge function**

After `load_skill` function, add:

```rust
fn load_knowledge(config_dir: &str) -> String {
    let kb_dir = Path::new(config_dir).join("knowledge");
    if !kb_dir.exists() {
        return String::new();
    }

    let mut category_blocks: Vec<String> = Vec::new();

    let mut categories: Vec<_> = fs::read_dir(&kb_dir)
        .map(|rd| rd.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    categories.sort_by_key(|e| e.file_name());

    for cat_entry in categories {
        let cat_path = cat_entry.path();
        if !cat_path.is_dir() {
            continue;
        }
        let cat_name = cat_entry.file_name().to_string_lossy().to_string();

        let mut entries: Vec<String> = Vec::new();
        if let Ok(files) = fs::read_dir(&cat_path) {
            let mut file_entries: Vec<_> = files.filter_map(|e| e.ok()).collect();
            file_entries.sort_by_key(|e| e.file_name());
            for file_entry in file_entries {
                let fp = file_entry.path();
                if fp.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                if let Ok(content) = fs::read_to_string(&fp) {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        entries.push(trimmed);
                    }
                }
            }
        }

        if !entries.is_empty() {
            category_blocks.push(format!(
                "#### {}\n\n{}",
                cat_name,
                entries.join("\n\n---\n\n")
            ));
        }
    }

    if category_blocks.is_empty() {
        return String::new();
    }

    format!(
        "\n\n---\n\n### 产品知识库\n\n{}\n",
        category_blocks.join("\n\n")
    )
}
```

**Step 4: Update build_system_prompt signature to accept config_dir**

Change signature from:
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
) -> Result<String, String> {
```
To:
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
) -> Result<String, String> {
```

**Step 5: Inject knowledge in build_system_prompt**

Inside `build_system_prompt`, after the `let mut parts = vec![skill_content];` line, add the knowledge block to `parts` before the context block:

```rust
// Knowledge base injection
let knowledge = load_knowledge(config_dir);
if !knowledge.is_empty() {
    parts[0].push_str(&knowledge);
}
```

Wait — actually it's cleaner to append after the skill content but before the project context. Update the logic:

In `build_system_prompt`, after:
```rust
let mut parts = vec![skill_content];
```
Add:
```rust
// Inject knowledge base entries (if any)
let knowledge = load_knowledge(config_dir);
if !knowledge.is_empty() {
    parts[0].push_str(&knowledge);
}
```

**Step 6: Update the call site in start_stream**

Change the `build_system_prompt` call to pass `&config_dir`:
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
    &config_dir,    // <-- add this
).map_err(|e| { ... })?;
```

**Step 7: Build and verify**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && cargo build 2>&1 | tail -20
```
Expected: compiles without errors.

**Step 8: Commit**

```bash
git add app/src-tauri/src/commands/stream.rs
git commit -m "feat: inject knowledge base entries into every phase generation system prompt"
```

---

## Execution Order

Tasks 1-5 are pure frontend polish — independent, no behavior change.
Tasks 6-9 are the document-first navigation fix — must be done in order (6 before 7-8, 7-8 before 9).
Task 10 is backend — independent, can be done at any point.

Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

Total estimated files touched: ~25 files.
