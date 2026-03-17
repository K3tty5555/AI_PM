# AI PM Desktop — Workspace Iteration Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan.

**Date:** 2026-03-17
**Status:** Confirmed

---

## Goal

Fix two core UX problems in one iteration:

1. **B — Document-first navigation**: Phase pages must not auto-trigger AI on mount. Navigation between phases should always be safe.
2. **C — Context injection with visibility**: Tool outputs (interview, data analysis) and knowledge base entries auto-inject into phase generation, with visible "context pills" the user can remove.

Plus a full **终末地 design system pixel-level audit** across all components and pages.

---

## Architecture

### B — Phase Navigation Fix

**Chosen approach: `?autostart=1` URL parameter**

- "Confirm → advance" buttons navigate with `?autostart=1` appended
- Sidebar phase clicks and direct navigation carry no param
- Each phase page checks `useSearchParams()` for `autostart`; only triggers `start()` if present AND no file exists on disk
- `StageNav`: remove `locked` restriction — ALL stages are clickable (user can jump to any phase to view)

**Phase page state machine:**

```
has_file=true                → show document + follow-up chat + Regenerate button
has_file=false, autostart=1  → auto-trigger generation immediately
has_file=false, autostart=0  → empty state + explicit "开始生成" button
```

**Empty state design (终末地 style):**
```
┌─────────────────────────────────────┐
│                                     │
│     ⬡  ANALYSIS                     │
│                                     │
│     尚未生成需求分析报告              │
│                                     │
│     [ 开始生成 → ]                   │
│                                     │
└─────────────────────────────────────┘
```

### C — Context Injection

**Tool output storage (project-bound):**
- When running a tool from a project context (future feature), output saves to `<output_dir>/context/<tool-name>-<timestamp>.md`
- For now: standalone tool runs save to `<projects_dir>/context-global/<tool-name>/latest.md`
- `build_system_prompt` in `stream.rs` scans `<output_dir>/context/` and injects all files found

**Context pills UI (above "开始生成" / during generation):**
```
使用上下文：[📄 访谈记录] [🧠 知识库·3条] [× 移除]
```
- Pills built from scanning `<output_dir>/context/` for files
- Each pill has × to temporarily exclude from current generation (stored in component state, not persisted)
- If no context files exist, pills row is hidden

**Knowledge base injection:**
- `build_system_prompt` reads all knowledge entries from `<config_dir>/knowledge/` and appends a compact summary block
- Format: category headers + entry titles + content

### 终末地 UI Fixes

**6 confirmed deviations:**

1. **TOOLS sidebar emojis** → replace with monospace dash `—` prefix or no icon; use text-only labels with proper HUD typography
2. **Mixed `font-mono` / `font-[var(--font-geist-mono)...]`** → create Tailwind utility class `font-terminal` mapped to GeistMono in CSS; update all usages
3. **Tool result cards missing left stripe** → add `border-l-2 border-l-[var(--yellow)]` (active/result state) or `border-l-2 border-l-[var(--teal)]` (info state) to result container divs
4. **Stage nav `#d0d0d0` hardcode** → replace with `var(--border)` / `var(--text-muted)`
5. **Settings page orphaned (AppLayout, no sidebar)** → move Settings to use same shell as Tools (SidebarShell visible)
6. **Knowledge category tabs** → align active state to HUD standard: `font-terminal text-[10px] uppercase tracking-[2px]`; yellow underline not yellow background for tab active state

**Additional polish found during audit:**
- `ProgressBar` animated gradient: confirm uses `linear-gradient(90deg, var(--yellow), rgba(255,250,0,0.3))`
- All `border-radius` usage: confirm 0 everywhere (no rounded classes)
- `animate-pulse` on "正在思考..." text: replace with proper terminal blink animation (`animate-[blink_1s_step-end_infinite]`)
- New-project dialog checkbox: replace generic `<input type="checkbox">` with styled terminal checkbox

---

## Components Touched

**Modified:**
- `app/src/components/stage-nav.tsx` — remove locked restriction
- `app/src/components/layout/Sidebar.tsx` — TOOLS section: remove emojis
- `app/src/layouts/AppLayout.tsx` — Settings page moves to SidebarShell layout
- `app/src/index.css` — add `font-terminal` utility
- All phase pages (7) — add `?autostart=1` check, remove auto-trigger
- `app/src-tauri/src/commands/stream.rs` — inject knowledge base + context dir
- `app/src/components/ui/progress-bar.tsx` — verify gradient
- `app/src/components/new-project-dialog.tsx` — styled checkbox
- `app/src/pages/tools/Knowledge.tsx` — tab active state fix
- `app/src/pages/Settings.tsx` — move to sidebar layout

**Created:**
- `app/src/components/context-pills.tsx` — context pills row component
- `app/src/components/phase-empty-state.tsx` — empty state for ungenerated phases

---

## Out of Scope

- Actual project-bound tool runs (tool pages don't have project selector yet)
- Context pills × removal persisting to backend (component state only)
- Knowledge search/filter in injection (inject all, frontend can filter later)
