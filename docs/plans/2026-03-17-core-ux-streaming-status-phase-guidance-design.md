# Core UX: Streaming Status + Phase Guidance Design

**Date:** 2026-03-17

## Goal

Reduce user anxiety during AI generation and eliminate confusion about "what to do next" after each phase.

## Problem Statement

1. **Waiting anxiety**: During streaming, users see a blank progress bar + "THINKING…" with no sense of progress. In CLI mode, content only appears at the very end, making it impossible to tell if the AI is working or stuck.
2. **Phase transition confusion**: After content is generated, the "next step" button doesn't indicate where it leads or what that phase does.

---

## Feature 1: Streaming Status Summary

### Approach
Pure frontend — no AI cooperation needed. Extract the last meaningful line from the accumulated stream text and show it as a status message below the progress bar.

### Extraction Rules
- Take the last non-empty line from `text` that contains Chinese characters or meaningful keywords
- Truncate to 20 characters max, append `…`
- If `text` is empty (still thinking), show `THINKING...` as before
- Strip markdown syntax (`#`, `*`, `-`, `>`) before displaying

### UI
```
[████████░░░░░] 00:23
正在撰写功能清单…
```

### Implementation
- Extract logic into a utility function `extractStreamStatus(text: string): string`
- Place in `app/src/lib/utils.ts` or a new `app/src/lib/stream-utils.ts`
- Use in all 6 phase pages: Research, Analysis, Stories, Prd, Prototype, Review
- Replace current `isThinking` "THINKING..." display with the new status line

---

## Feature 2: Phase Transition Guidance

### Approach
Hardcode a `PHASE_META` constant mapping each phase to its next phase name + one-line description. Update each phase page's bottom action bar to show this info.

### PHASE_META Table
| Current Phase | Next Button Label | Description |
|---|---|---|
| Requirement | 进入需求分析 | 深挖用户痛点和核心价值 |
| Research | 进入竞品研究 | 分析同类产品，找差异化机会 |
| Analysis | 进入用户故事 | 拆解功能场景和验收标准 |
| Stories | 进入 PRD | 撰写完整产品需求文档 |
| Prd | 进入原型设计 | 生成可交互的页面原型 |
| Prototype | 进入需求评审 | 六角色评审，发现遗漏和风险 |
| Review | 完成项目 | 归档所有产出，项目结束 |

### UI
```
[← 返回用户故事]    [进入原型设计 →]
                     基于 PRD 生成可交互原型
```

### Implementation
- Add `PHASE_META` constant to a shared location (e.g. `app/src/lib/phase-meta.ts`)
- Update bottom action bar in each phase page to show next phase name on button + description text below

---

## Scope

- **Files touched**: `app/src/lib/` (new utils), 6 phase pages, possibly `PhaseEmptyState` component
- **No backend changes** required
- **No AI prompt changes** required
