---
name: multi-perspective-review
description: >
  Multi-perspective expert review for design proposals and implementation plans.
  Automatically dispatches reviewers with appropriate expert personas based on
  what the document touches (frontend, backend, or both).
  Use this skill after completing brainstorming (design proposals) or writing-plans
  (implementation plans), before finalizing the document. Also use when the user says
  "review this design", "check my plan", "audit this proposal", or asks for expert
  feedback on architecture or UI decisions.
---

# Multi-Perspective Review

Dispatch parallel expert reviewers to audit a design proposal or implementation plan,
then consolidate findings into an actionable issue list for the user to decide on.

## When This Runs

This skill is invoked automatically at two points (configured in CLAUDE.md):

1. **After brainstorming** — when a design proposal is ready but before writing the design doc
2. **After writing-plans** — when an implementation plan is written but before execution

It can also be invoked manually at any time on any document.

## Process

```
Input document (design or plan)
  -> Detect scope (frontend / backend / both)
  -> Select reviewer personas
  -> Dispatch reviewers in parallel (one Agent per persona)
  -> Consolidate findings
  -> Present issue list to user
  -> User decides which issues to address
```

## Step 1: Detect Scope

Read the document and classify which layers it touches. Look for these signals:

**Frontend signals**: component, page, UI, UX, CSS, styling, layout, dialog, modal,
button, input, form, animation, responsive, Toast, Badge, sidebar, Tailwind, React,
tsx, useState, useEffect, onClick

**Backend signals**: API, database, SQL, Rust, command, endpoint, reqwest, struct,
Cargo, migration, schema, query, invoke, Tauri command, provider, stream

**Classification**:
- Both frontend and backend signals present -> `full-stack`
- Only frontend signals -> `frontend-only`
- Only backend signals -> `backend-only`
- Neither (pure docs/process change) -> `backend-only` (default to architecture review)

## Step 2: Select Reviewer Personas

| Scope | Reviewers |
|-------|-----------|
| `full-stack` | Architecture, Frontend, Backend, UI/UX |
| `frontend-only` | Frontend, UI/UX |
| `backend-only` | Architecture, Backend |

## Step 3: Dispatch Reviewers

Use the Agent tool to dispatch reviewers **in parallel** (all in one message).
Each reviewer gets the full document plus a persona-specific prompt.

### Architecture Reviewer

```
You are a senior software architect reviewing a design/plan.

Focus on:
- Responsibility boundaries: are modules/commands well-separated?
- Data flow: is the data path clear and minimal?
- Integration with existing system: does it conflict with or duplicate existing code?
- Over-engineering: is anything unnecessarily complex?
- Missing edge cases: error handling, failure modes, concurrency
- API design: are interfaces clean and consistent?

Review the following document and output a list of issues.
For each issue, state: severity (Critical / Important / Suggestion),
what the problem is, and a concrete recommendation.

If everything looks good, say "No issues found."

Document:
{document_content}
```

### Backend Reviewer

```
You are a senior backend engineer reviewing a design/plan.

Focus on:
- Technical feasibility: can this actually be built as described?
- Performance: any obvious bottlenecks (N+1 queries, unbounded loops, missing pagination)?
- Security: path traversal, injection, auth bypass
- Error handling: are failure cases covered with meaningful messages?
- Dependencies: are new dependencies justified? Version compatibility?
- Testing: is the approach testable?

Review the following document and output a list of issues.
For each issue, state: severity (Critical / Important / Suggestion),
what the problem is, and a concrete recommendation.

If everything looks good, say "No issues found."

Document:
{document_content}
```

### Frontend Reviewer

```
You are a senior frontend engineer reviewing a design/plan.

Focus on:
- Component design: are components reusable and well-scoped?
- State management: is state lifted appropriately? Any unnecessary re-renders?
- Accessibility: keyboard navigation, ARIA labels, screen reader support
- Performance: large lists without virtualization? Heavy computations in render?
- Type safety: are TypeScript types correct and complete?
- Consistency with existing patterns in the codebase

Review the following document and output a list of issues.
For each issue, state: severity (Critical / Important / Suggestion),
what the problem is, and a concrete recommendation.

If everything looks good, say "No issues found."

Document:
{document_content}
```

### UI/UX Reviewer

```
You are a senior UI/UX designer reviewing a design/plan.

The project follows Apple HIG + Bauhaus design principles. Reference:
docs/design-system.md for the full design system specification.

Focus on:
- Cognitive load: is the user asked to make too many decisions at once?
- Information hierarchy: is the most important content most prominent?
- Consistency: does it match existing patterns in the app?
- Feedback: does every user action have clear visual feedback?
- Edge states: empty state, loading state, error state all handled?
- Dismissibility: can users close/hide things they don't need?
- Copy/microcopy: is the language clear and non-technical for the target user?

Review the following document and output a list of issues.
For each issue, state: severity (Critical / Important / Suggestion),
what the problem is, and a concrete recommendation.

If everything looks good, say "No issues found."

Document:
{document_content}
```

## Step 4: Consolidate and Present

After all reviewers return, consolidate into a single issue list:

1. Deduplicate: if multiple reviewers flag the same issue, merge into one entry
   and note which perspectives flagged it
2. Sort by severity: Critical first, then Important, then Suggestion
3. Present to user in this format:

```
## Multi-Perspective Review Results

Scope: {full-stack / frontend-only / backend-only}
Reviewers: {list of personas that reviewed}

### Critical Issues
- **[Architecture] Issue title**: description. Recommendation: ...
- **[UI/UX + Frontend] Issue title**: description (flagged by 2 reviewers). Recommendation: ...

### Important Issues
- ...

### Suggestions
- ...

### No Issues Found By
- {Reviewer name} (if a reviewer found no issues, list them here)

---
{N} issues found. Which ones should I address?
```

## What Happens Next

After presenting the issue list:
- Wait for the user to decide which issues to fix
- The user may say "fix all", "fix Critical + Important", "skip suggestions", or pick specific ones
- Address the selected issues by revising the design/plan document
- Do NOT re-run the review after fixes (avoid infinite loops) unless the user explicitly asks

## Important Notes

- Reviewers run in parallel for speed — dispatch all Agents in one message
- Each reviewer is an independent Agent with no shared context
- The design system file (docs/design-system.md) should be read by the UI/UX reviewer,
  not injected into all reviewers
- Keep review output concise — issues only, no praise or summary of what the document does well
- If the document is very short (< 20 lines), it may not warrant a full review — ask the user
