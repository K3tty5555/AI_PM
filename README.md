<h1 align="center">AI PM</h1>
<p align="center">
  AI-powered product manager toolkit — from idea clarification to PRD, analytics design, prototype, review, and retrospective.
</p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README_zh-CN.md">简体中文</a>
</p>

> [!NOTE]
> **The Tauri desktop client was retired on 2026-07-17 and its source removed from this repo.** Historical installers remain on GitHub Releases only and are unmaintained. The actively maintained form of AI_PM is the **Claude Code skills** edition described below.

---

## What is AI PM?

AI PM is an AI product manager suite. Start with a rough idea, and it can help you clarify requirements, analyze users and competitors, write user stories, generate a PRD, design analytics, build an HTML prototype, run a six-role review, and summarize learnings. It runs as a set of Claude Code skills plus a PM sub-agent.

## Current Capabilities

### Product Workflow

```
Office Hours → Requirement → Analysis → Research → Stories → PRD → Analytics → Prototype → Review → Retrospective
```

- 9 core project phases, plus optional Office Hours before formal writing
- Each phase saves independently and can be resumed
- PM agent / driver workflow for PRD quality checks before review

### PRD and Review

- **Markdown-first PRD** as the canonical source
- **Version management** with per-phase folders and version indexes
- **AI illustration** generation and embedding into PRD content
- **Six-role review** from product, design, frontend, backend, QA, and operations perspectives

### Localized PM Methods

PM methods borrowed from established practice and **re-grounded for China-mainland enterprise reality** — localized, not translated. Each passes a localization filter, ships with local counter-examples, and folds into existing skills instead of adding command surface:

- **Pre-mortem** risk rehearsal before the six-role review, with a general red-line / compliance slot
- **Assumption validation** in requirement analysis — what we are betting on and how to test it cheaply
- **Analytics rigor** — cohort retention, retention curves, A/B significance, North Star convergence, and user-feedback theme / sentiment analysis
- **Competitive battlecards** for sales-facing situations
- **Collaboration map + customer-decision map** for internal alignment and multi-layer customer decision chains
- **Release docs** — generate update notes and a user manual from shipped features, then publish to Feishu (`/ai-pm release-docs`)

### Export and Tooling

| Area | What it covers |
|------|----------------|
| PRD export | PDF, DOCX, share page, and supporting export scripts |
| Product tools | Priority assessment, weekly report, on-site interview, data insight |
| Knowledge tools | Product persona, design spec, product knowledge base |
| Prototype | HTML prototype generation, device preview, motion intensity, multi-file mode |
| Collaboration | Claude-first project memory with Codex-readable shared indexes |

## Quick Start

```bash
git clone <repository-url>
cd AI_PM
claude
```

Then run:

```text
/ai-pm "I want to build a personal finance app for young people"
```

AI PM will guide requirement clarification first, then move through the product workflow.

HTML prototypes and dashboards use the bundled `ai-pm-frontend-design` skill by default. External Claude Code plugins such as `impeccable` are optional enhancements, not runtime requirements.

## Claude Code Commands

| Command | Description |
|---------|-------------|
| `/ai-pm [idea]` | Main product workflow |
| `/ai-pm office-hours` | Early requirement discussion / feasibility check |
| `/ai-pm --team [idea]` | Multi-agent workflow for complex requirements |
| `/ai-pm continue` | Resume the last unfinished project |
| `/ai-pm strategy` | Strategy sandbox for project-level or product-level strategic thinking |
| `/ai-pm sharing [topic or source path]` | Write a standalone experience-sharing article; not a PRD, retrospective, or training handout |
| `/ai-pm-sharing` | Direct entry to the same experience-sharing article skill |
| `/ai-pm-strategy-verify` | Strategy verification scout — dig evidence to the end, return reversals + forks (never the final call) |
| `/ai-pm driver [PRD]` | PM-style quality gate before review |
| `/ai-pm-prd` | Generate or update PRD |
| `/ai-pm-data metrics` | Analytics and metric design |
| `/ai-pm-prototype` | Generate interactive HTML prototype |
| `/ai-pm-review` | Six-role requirement review |
| `/ai-pm retrospective` | Project retrospective and knowledge capture |
| `/ai-pm acceptance [PRD]` | Product acceptance — verify implementation against the PRD in a test environment |
| `/ai-pm release-docs [PRD\|project]` | Release update notes + user manual from shipped features, publish to Feishu |
| `/ai-pm-priority` | Requirement priority assessment |
| `/ai-pm-weekly` | Weekly report generation |
| `/ai-pm-interview` | On-site interview mode |
| `/ai-pm-persona` | Product persona / writing style learning |
| `/ai-pm-design-spec` | Design spec management |
| `/ai-pm-knowledge` | Product knowledge base |
| `/pm-gap-research` | Gap-oriented product research |
| `/multi-perspective-review` | Multi-perspective review mode |
| `/tutorial-center-update` | Update the offline tutorial center |

Core standalone skills: `/ai-pm-analyze`, `/ai-pm-research`, `/ai-pm-story`, `/ai-pm-prd`, `/ai-pm-prototype`, `/ai-pm-review`, `/ai-pm-sharing`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Skills | Claude Code project skills + 2 sub-agents (pm-agent / prototype-agent) |
| Export Scripts | Python 3, Node scripts, Chrome-based PDF rendering |
| Collaboration Context | `.ai-shared` indexes and `scripts/ai-sync` checks |

## Project Structure

```text
.claude/skills/                    # Claude Code project skills
.claude/agents/                    # 2 sub-agents: pm-agent (PRD gate) and prototype-agent (prototype audit)
.ai-shared/                        # Shared memory / skill / agent indexes for Claude and Codex
scripts/ai-sync/                   # Index generation and context drift checks
templates/                         # PRD styles, UI specs, knowledge presets
docs/                              # Local-only planning notes (gitignored — not distributed with the repo)
output/                            # Local output, git-ignored
output/sharing/articles/           # Standalone experience-sharing articles
AI_PM_教程中心.html                 # Offline interactive tutorial
```

The single registry for top-level output containers is `.claude/skills/ai-pm/references/output-containers.md`.

## Tutorial

Open `AI_PM_教程中心.html` in your browser. It works offline and covers the Claude Code edition.

## License

[MIT](LICENSE)
