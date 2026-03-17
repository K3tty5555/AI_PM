# Core UX: Streaming Status + Phase Guidance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce user anxiety during AI generation and clarify "what to do next" after each phase.

**Architecture:** Two independent changes: (1) a `extractStreamStatus()` util that parses the last meaningful line from stream text, used by all 6 phase pages in the `isStreaming` block; (2) a `PHASE_META` constant that drives updated bottom action bar labels in all 6 phase pages.

**Tech Stack:** React 19, TypeScript, Tauri 2, existing `useAiStream` hook

---

### Task 1: `extractStreamStatus` utility

**Files:**
- Modify: `app/src/lib/utils.ts`

**Context:**
Currently all phase pages show `THINKING...` when `isStreaming && text === ""`, and nothing extra when text starts flowing. We want to extract the last meaningful line and show it as a status hint.

**Step 1: Add the function to `app/src/lib/utils.ts`**

Add at the bottom of the file:

```typescript
/**
 * Extract a short status hint from streaming AI output.
 * Returns the last non-empty line that contains meaningful content,
 * stripped of markdown syntax, truncated to 20 chars.
 */
export function extractStreamStatus(text: string): string {
  if (!text) return ""
  const lines = text.split("\n")
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i].trim()
    if (!raw) continue
    // Strip markdown: headings, bullets, bold, code fences
    const stripped = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*>]\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
    if (stripped.length < 4) continue
    // Must contain at least one CJK char or common keyword to be meaningful
    if (!/[\u4e00-\u9fff]|writing|generating|analyzing/.test(stripped)) continue
    return stripped.length > 20 ? stripped.slice(0, 20) + "…" : stripped + "…"
  }
  return ""
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors (or only pre-existing unrelated errors)

**Step 3: Commit**

```bash
git add app/src/lib/utils.ts
git commit -m "feat: add extractStreamStatus util for streaming progress hints"
```

---

### Task 2: Apply streaming status to all 6 phase pages

**Files:**
- Modify: `app/src/pages/project/Research.tsx` (line ~298-305)
- Modify: `app/src/pages/project/Analysis.tsx` (similar block)
- Modify: `app/src/pages/project/Stories.tsx` (similar block)
- Modify: `app/src/pages/project/Prd.tsx` (line ~373-375)
- Modify: `app/src/pages/project/Prototype.tsx` (similar block)
- Modify: `app/src/pages/project/Review.tsx` (similar block)

**Context:**
Each phase page has a streaming block like:
```tsx
{isStreaming && (
  <div className="mt-4">
    <ProgressBar value={progressValue} animated />
    {isThinking && (
      <p className="mt-2 font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)] animate-[blink_1s_step-end_infinite]">THINKING...</p>
    )}
    <p className="mt-2 font-terminal text-xs text-[var(--text-muted)]">
      {timer display}
    </p>
  </div>
)}
```

Replace the `{isThinking && <p>THINKING...</p>}` block in EACH page with:

```tsx
{isThinking
  ? <p className="mt-2 font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)] animate-[blink_1s_step-end_infinite]">THINKING...</p>
  : extractStreamStatus(text)
    ? <p className="mt-2 font-terminal text-xs tracking-[1px] text-[var(--text-muted)]">{extractStreamStatus(text)}</p>
    : null
}
```

Also add the import in each file:
```typescript
import { cn, extractStreamStatus } from "@/lib/utils"
```
(or just add `extractStreamStatus` to the existing `cn` import)

**Step 1: Update Research.tsx**

Find the `{isThinking && ...THINKING...}` block (around line 301) and replace as above. Add `extractStreamStatus` to the import from `@/lib/utils`.

**Step 2: Update Analysis.tsx** — same pattern

**Step 3: Update Stories.tsx** — same pattern

**Step 4: Update Prd.tsx** — same pattern (line ~373)

**Step 5: Update Prototype.tsx** — same pattern

**Step 6: Update Review.tsx** — same pattern

**Step 7: Verify TypeScript compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors

**Step 8: Commit**

```bash
git add app/src/pages/project/
git commit -m "feat: show streaming status hint below progress bar in all phase pages"
```

---

### Task 3: `PHASE_META` constant

**Files:**
- Create: `app/src/lib/phase-meta.ts`

**Context:**
Each phase page's bottom action bar needs to show the next phase name and a one-line description. We centralize this so it's easy to maintain.

**Step 1: Create `app/src/lib/phase-meta.ts`**

```typescript
export interface PhaseMeta {
  /** Label for the primary "advance" button */
  nextLabel: string
  /** One-line description shown below the button */
  nextDescription: string
  /** Label for the back button */
  backLabel: string
}

export const PHASE_META: Record<string, PhaseMeta> = {
  requirement: {
    nextLabel: "进入需求分析",
    nextDescription: "深挖用户痛点和核心价值",
    backLabel: "← 返回",
  },
  research: {
    nextLabel: "进入用户故事",
    nextDescription: "拆解功能场景和验收标准",
    backLabel: "← 返回需求分析",
  },
  analysis: {
    nextLabel: "进入用户故事",
    nextDescription: "拆解功能场景和验收标准",
    backLabel: "← 返回修改需求",
  },
  stories: {
    nextLabel: "进入 PRD",
    nextDescription: "撰写完整产品需求文档",
    backLabel: "← 返回分析",
  },
  prd: {
    nextLabel: "进入原型设计",
    nextDescription: "基于 PRD 生成可交互原型",
    backLabel: "← 返回故事",
  },
  prototype: {
    nextLabel: "进入需求评审",
    nextDescription: "六角色评审，发现遗漏和风险",
    backLabel: "← 返回 PRD",
  },
  review: {
    nextLabel: "完成项目",
    nextDescription: "归档所有产出，项目结束",
    backLabel: "← 返回原型",
  },
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

**Step 3: Commit**

```bash
git add app/src/lib/phase-meta.ts
git commit -m "feat: add PHASE_META constant for phase transition labels"
```

---

### Task 4: Apply phase guidance to bottom action bars

**Files:**
- Modify: `app/src/pages/project/Research.tsx`
- Modify: `app/src/pages/project/Analysis.tsx`
- Modify: `app/src/pages/project/Stories.tsx`
- Modify: `app/src/pages/project/Prd.tsx`
- Modify: `app/src/pages/project/Prototype.tsx`
- Modify: `app/src/pages/project/Review.tsx`

**Context:**
Each page has a bottom action bar like:
```tsx
<div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
  <Button variant="ghost" onClick={handleBack} disabled={...}>
    &larr; 返回故事
  </Button>
  <Button variant="primary" onClick={handleComplete} disabled={!canComplete}>
    完成 ✓
  </Button>
</div>
```

Replace the right side with a wrapper that shows the description below the button:

```tsx
<div className="flex flex-col items-end gap-1">
  <Button variant="primary" onClick={handleComplete} disabled={!canComplete}>
    {saving ? "保存中..." : advancing ? "正在完成..." : PHASE_META.prd.nextLabel + " →"}
  </Button>
  {!advancing && !saving && (
    <p className="font-terminal text-[10px] text-[var(--text-muted)] tracking-[0.5px]">
      {PHASE_META.prd.nextDescription}
    </p>
  )}
</div>
```

For the **Review page** (last phase), `nextLabel` is "完成项目" and there's no description needed — keep it simple.

**Step 1: Update Research.tsx**

Import `PHASE_META` from `@/lib/phase-meta`. Find the bottom action bar (look for `&larr; 返回分析` and the advance button). Wrap the right button in `<div className="flex flex-col items-end gap-1">` and add the description `<p>` below.

Use `PHASE_META.research.nextLabel` for button text and `PHASE_META.research.nextDescription` for description.

**Step 2: Update Analysis.tsx** — use `PHASE_META.analysis`

**Step 3: Update Stories.tsx** — use `PHASE_META.stories`

**Step 4: Update Prd.tsx** — use `PHASE_META.prd`. Note: this page shows "完成 ✓" with saving/advancing states — keep those states but use `PHASE_META.prd.nextLabel` for the idle label.

**Step 5: Update Prototype.tsx** — use `PHASE_META.prototype`

**Step 6: Update Review.tsx** — use `PHASE_META.review`. The button already says "完成项目 ✓" — just add the description wrapper.

**Step 7: Verify TypeScript compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors

**Step 8: Start dev server and visually verify**

```bash
cd app && PATH="$PATH:<USER_HOME>/.cargo/bin" npm run tauri dev
```

Check: on each phase page, the bottom right shows the next phase name and description. During streaming, the status hint appears below the progress bar.

**Step 9: Commit**

```bash
git add app/src/pages/project/
git commit -m "feat: show next phase name and description in bottom action bar"
```
