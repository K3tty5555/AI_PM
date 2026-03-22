# Audit Scan Report

> Generated: 2026-03-22
> Scope: `app/src/` (TypeScript/React) + `app/src-tauri/src/` (Rust)

---

## Layer 1: High-Confidence Automated Detection

### 1. Hardcoded Tailwind Color Classes

Matches: **0**

(No issues found)

---

### 2. Hardcoded Hex Color Values

Matches: **17**

```
app/src/pages/tools/DesignSpec.tsx:56:    const primary   = (typeof c.primary === 'object' && c.primary !== null ? c.primary.main : null) ?? (typeof c.primary === 'string' ? c.primary : null) ?? '#1D4ED8'
app/src/pages/tools/DesignSpec.tsx:57:    const success   = c.semantic?.success ?? c.status?.success ?? (typeof c.success === 'object' ? c.success?.main : c.success) ?? '#16a34a'
app/src/pages/tools/DesignSpec.tsx:58:    const warning   = c.semantic?.warning ?? c.status?.warning ?? (typeof c.warning === 'object' ? c.warning?.main : c.warning) ?? '#d97706'
app/src/pages/tools/DesignSpec.tsx:59:    const error     = c.semantic?.error   ?? c.status?.error   ?? (typeof c.error   === 'object' ? c.error?.main   : c.error)   ?? '#dc2626'
app/src/pages/tools/DesignSpec.tsx:60:    const successBg = c.semantic?.successBg ?? '#f0fdf4'
app/src/pages/tools/DesignSpec.tsx:61:    const warningBg = c.semantic?.warningBg ?? '#fffbeb'
app/src/pages/tools/DesignSpec.tsx:62:    const errorBg   = c.semantic?.errorBg   ?? '#fef2f2'
app/src/pages/tools/DesignSpec.tsx:68:      primary: '#1D4ED8', success: '#16a34a', warning: '#d97706', error: '#dc2626',
app/src/pages/tools/DesignSpec.tsx:69:      successBg: '#f0fdf4', warningBg: '#fffbeb', errorBg: '#fef2f2',
app/src/pages/tools/DesignSpec.tsx:385:                                  background: pt.primary, color: '#fff', border: 'none',
app/src/pages/tools/DesignSpec.tsx:396:                                  background: pt.error, color: '#fff', border: 'none',
app/src/pages/tools/DesignSpec.tsx:408:                                    border: '1.5px solid #d1d5db',
app/src/pages/tools/DesignSpec.tsx:412:                                    background: '#fff', color: '#374151',
app/src/pages/tools/DesignSpec.tsx:423:                                    background: '#fff', color: '#374151',
app/src/pages/tools/DesignSpec.tsx:446:                                background: '#fff',
app/src/pages/tools/DesignSpec.tsx:452:                                <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>...
app/src/pages/tools/DesignSpec.tsx:453:                                <p style={{ fontSize: 12, color: '#6b7280' }}>...
```

> Note: All 17 matches are in `DesignSpec.tsx`, which is a design-spec preview component that renders example UI swatches. Many are fallback defaults (via `??`). Worth reviewing whether these should reference CSS variables instead.

---

### 3. Stale CSS Variable References

Matches: **0**

(No issues found)

---

### 4. `tracking-[...]` Violations

Matches: **2**

```
app/src/components/prd-toc.tsx:120:                    "tracking-[0.5px]",
app/src/components/story-board.tsx:416:            "tracking-[1px]",
```

> Per `docs/design-system.md`, `uppercase tracking-[2px]` is prohibited. These two instances use different values but still use arbitrary tracking and should be reviewed.

---

### 5. `as any` / `@ts-ignore` Escapes

Matches: **0**

(No issues found)

---

### 6. Rust `unwrap()` / `expect()` in `commands/`

Matches: **0**

(No issues found)

---

### 7. `reqwest Client::new()` Without Timeout

Matches: **1**

```
app/src-tauri/src/commands/config.rs:259:    let client = reqwest::Client::new();
```

> `Client::new()` creates a client with no explicit timeout. Should use `Client::builder().timeout(...).build()` to prevent indefinite hangs.

---

## Layer 2: Candidate List (Requires Human Judgment)

### 8. `font-mono` / `font-terminal` Usage

Matches: **8**

```
app/src/components/analysis-cards.tsx:164:          className="px-1 py-0.5 text-xs bg-[var(--secondary)] border border-[var(--border)] rounded font-mono"
app/src/components/env-checker.tsx:243:                    "font-mono whitespace-pre-wrap break-all",
app/src/components/mermaid-renderer.tsx:82:            "font-mono",
app/src/components/prd-viewer.tsx:146:            "font-mono",
app/src/components/prd-viewer.tsx:341:            className="px-1.5 py-0.5 text-xs bg-[var(--secondary)] border border-[var(--border)] font-mono"
app/src/components/prd-viewer.tsx:364:          "font-mono",
app/src/pages/project/Review.tsx:609:                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm font-mono resize-none outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
app/src/pages/project/Research.tsx:340:              <p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)] select-all">
```

> Per design system: monospace fonts should only be used for code-related contexts. Most of these look appropriate (code blocks, mermaid, env output), but `Review.tsx:609` (textarea) and `Research.tsx:340` (URL display) should be verified.

---

### 9. Standalone `rounded` (Not `rounded-lg/xl/full/md`)

Matches: **7**

```
app/src/pages/Settings.tsx:786:              <code className="text-xs bg-[var(--hover-bg)] px-1 py-0.5 rounded">output/projects/</code>
app/src/pages/Settings.tsx:881:                <code className="bg-[var(--hover-bg)] px-1 py-0.5 rounded">templates/knowledge-base/</code>
app/src/pages/Settings.tsx:947:                <code className="bg-[var(--hover-bg)] px-1 py-0.5 rounded">templates/prd-styles/</code>
app/src/pages/Settings.tsx:1021:                <code className="bg-[var(--hover-bg)] px-1 py-0.5 rounded">templates/ui-specs/</code>
app/src/pages/tools/Knowledge.tsx:209:                      <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--secondary)] px-1.5 py-0.5 rounded">
app/src/pages/project/Prd.tsx:384:                "h-7 px-2 text-xs rounded",
app/src/pages/project/Prototype.tsx:372:              "h-7 px-2 text-xs rounded",
```

> Design system specifies `8px` border-radius (`rounded-lg`). Bare `rounded` is `4px` -- check if these should be `rounded-lg` for consistency.

---

### 10. `<button>` Element Distribution

Total files with buttons: **33**

| File | Count |
|------|-------|
| `pages/Dashboard.tsx` | 9 |
| `components/layout/Sidebar.tsx` | 9 |
| `pages/tools/DesignSpec.tsx` | 7 |
| `pages/Settings.tsx` | 7 |
| `pages/tools/Persona.tsx` | 5 |
| `pages/tools/Knowledge.tsx` | 4 |
| `pages/project/Prd.tsx` | 4 |
| `layouts/AppLayout.tsx` | 4 |
| `components/story-card.tsx` | 4 |
| `pages/project/Review.tsx` | 3 |
| `components/layout/TitleBar.tsx` | 3 |
| `components/layout/ActivityBar.tsx` | 3 |
| `components/knowledge-extract-dialog.tsx` | 3 |
| `components/env-checker.tsx` | 3 |
| `pages/project/Research.tsx` | 2 |
| `pages/project/Requirement.tsx` | 2 |
| `pages/project/Prototype.tsx` | 2 |
| `components/story-board.tsx` | 2 |
| `components/reference-files.tsx` | 2 |
| `components/knowledge-recommend-panel.tsx` | 2 |
| `pages/tools/Priority.tsx` | 1 |
| `pages/tools/Data.tsx` | 1 |
| `pages/project/Stories.tsx` | 1 |
| `components/ui/toast.tsx` | 1 |
| `components/stage-nav.tsx` | 1 |
| `components/prd-toc.tsx` | 1 |
| `components/phase-empty-state.tsx` | 1 |
| `components/new-project-dialog.tsx` | 1 |
| `components/inline-chat.tsx` | 1 |
| `components/file-upload.tsx` | 1 |
| `components/error-boundary.tsx` | 1 |
| `components/context-pills.tsx` | 1 |
| `components/command-palette.tsx` | 1 |

**Total buttons: 83**

---

### 11. `aria-label` / `aria-*` Distribution

Total files with aria attributes: **13**

| File | Count |
|------|-------|
| `components/command-palette.tsx` | 6 |
| `components/ui/progress-bar.tsx` | 3 |
| `components/story-card.tsx` | 3 |
| `components/ui/toast.tsx` | 2 |
| `components/ui/confirm-dialog.tsx` | 2 |
| `components/knowledge-extract-dialog.tsx` | 2 |
| `pages/project/Requirement.tsx` | 1 |
| `pages/Settings.tsx` | 1 |
| `layouts/AppLayout.tsx` | 1 |
| `components/stage-nav.tsx` | 1 |
| `components/prd-viewer.tsx` | 1 |
| `components/file-upload.tsx` | 1 |
| `components/analysis-cards.tsx` | 1 |

**Total aria attributes: 25**

> Accessibility gap: 83 buttons across 33 files, but only 25 aria attributes across 13 files. Many buttons likely lack accessible labels.

---

### 12. `document.querySelector` / `document.getElementById` Anti-Pattern

Matches: **5**

```
app/src/main.tsx:10:ReactDOM.createRoot(document.getElementById("root")!).render(
app/src/components/mermaid-renderer.tsx:44:          document.getElementById(`d${id}`)?.remove()
app/src/layouts/AppLayout.tsx:46:          const sidebarNameEl = document.querySelector('[data-slot="sidebar"] button span.truncate')
app/src/pages/project/Prd.tsx:157:      const el = document.getElementById(id)
app/src/pages/project/Prd.tsx:225:    const el = document.getElementById(id)
```

> `main.tsx:10` is standard React bootstrap (acceptable). The other 4 are direct DOM queries that bypass React's ref system. `AppLayout.tsx:46` is particularly fragile as it relies on CSS selector matching internal DOM structure. `Prd.tsx` uses getElementById for scroll-to-anchor which could use refs instead.

---

## Summary

| # | Check | Matches | Severity |
|---|-------|---------|----------|
| 1 | Hardcoded Tailwind color classes | 0 | -- |
| 2 | Hardcoded hex color values | 17 | Medium |
| 3 | Stale CSS variable references | 0 | -- |
| 4 | `tracking-[...]` violations | 2 | High |
| 5 | `as any` / `@ts-ignore` escapes | 0 | -- |
| 6 | Rust `unwrap()`/`expect()` in commands | 0 | -- |
| 7 | `reqwest Client::new()` no timeout | 1 | High |
| 8 | `font-mono` / `font-terminal` usage | 8 | Low (review) |
| 9 | Standalone `rounded` | 7 | Medium |
| 10 | `<button>` distribution | 83 total | Info |
| 11 | `aria-*` distribution | 25 total | Medium |
| 12 | `document.querySelector` anti-pattern | 5 | Medium |

### Key Findings

- **Clean areas**: No Tailwind color class leaks, no stale CSS vars, no TypeScript escape hatches, no Rust unwrap panics in command handlers.
- **Top priority**: 2 `tracking-[...]` violations (design system prohibition) and 1 `Client::new()` without timeout (potential hang in production).
- **Design consistency**: 17 hardcoded hex values in `DesignSpec.tsx` and 7 bare `rounded` instead of `rounded-lg`.
- **Accessibility gap**: 83 buttons but only 25 aria attributes -- significant coverage gap.
- **React anti-patterns**: 4 direct DOM queries (excluding React bootstrap) that should migrate to refs.
