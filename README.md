<p align="center">
  <img src="app/src-tauri/icons/128x128@2x.png" width="96" alt="AI PM">
</p>
<h1 align="center">AI PM</h1>
<p align="center">
  AI-powered product manager — from idea to PRD, prototype, and review in minutes.
</p>
<p align="center">
  <a href="https://github.com/K3tty5555/AI_PM/releases"><img src="https://img.shields.io/github/v/release/K3tty5555/AI_PM?style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README_zh-CN.md">简体中文</a>
</p>

---

## What is AI PM?

AI PM is an AI product manager toolkit. Describe your product idea in one sentence, and it will walk you through the entire product workflow — requirement analysis, competitive research, user stories, PRD writing, prototype design, and a six-role review meeting — all automated.

Two ways to use it, complementary to each other:

| | Claude Code Edition | Desktop App |
|---|---|---|
| Form | Skill set inside Claude Code | Standalone desktop app (macOS / Windows) |
| Interface | CLI conversation | Visual GUI |
| Prerequisite | [Claude Code](https://claude.ai/code) subscription | API Key or local Claude CLI |
| Strength | Powerful toolchain: web search, script execution, multi-agent parallel | Great UX: progress visualization, drag-and-drop, device preview, dark mode |

## Features

### Full Product Workflow (9 Phases)

```
Requirement → Analysis → Competitive Research → User Stories → PRD → Analytics Design → Prototype → 6-Role Review → Retrospective
```

Each phase saves independently. Resume anytime. Skip phases that don't apply.

### PRD Multi-Format Export
- **Markdown** — native format, always generated
- **PDF** — 15 cover templates, Chrome headless rendering
- **DOCX** — 13 recipe styles, directly importable to Feishu/Lark
- **PPT** — 18 color schemes, 5 page types, auto-generated from PRD
- **Share Page** — standalone HTML for stakeholder sharing

### Toolbox
| Tool | What it does |
|------|-------------|
| **Priority Assessment** | 4-dimension scoring (business value / cost / user impact / strategic fit), batch processing |
| **Weekly Report** | Describe your week casually, get a structured report for leadership or team sync |
| **On-site Interview** | Structured interview guide + real-time recording → PRD on the spot |
| **Data Insight** | Upload Excel/CSV → interactive dashboard + business insights |
| **Product Persona** | Learn your PRD writing style, make AI output more like you |
| **Design Spec** | Load your company's UI spec, prototypes auto-comply |
| **Knowledge Base** | Accumulate design patterns, decisions, pitfalls — auto-recommended in context |
| **AI Illustration** | Generate flowcharts and diagrams with Seedream AI |
| **PPT Generation** | PRD → PowerPoint with industry-matched color schemes |
| **Screenshot Analysis** | Competitive UI analysis — 5 modes: describe, OCR, UI review, chart data, object detect |

### Desktop App Highlights
- Project Dashboard with search, filter, favorites, and progress bars
- User story drag-and-drop reordering (StoryBoard)
- PRD table-of-contents navigation + Mermaid live rendering
- Prototype device simulation (Mobile / Tablet / Desktop)
- Motion intensity selector for prototypes (low / medium / high)
- Six-role review results with tab switching
- CLI enhanced mode: web search for research, multi-file prototype
- Progressive reveal: content fades in paragraph by paragraph
- Generation progress: real-time tool call status + token cost display
- Dark mode, keyboard shortcuts (⌘K / ⌘B / ⌘1-9)

## Quick Start

### Option 1: Claude Code Edition

```bash
git clone https://github.com/K3tty5555/AI_PM.git
cd AI_PM
claude  # Open Claude Code in this directory
```

```
/ai-pm "I want to build a personal finance app for young people"
```

AI will guide you through requirement clarification, then progressively advance to PRD and prototype.

### Option 2: Desktop App

Download from [Releases](https://github.com/K3tty5555/AI_PM/releases):
- macOS: `AI.PM_x.x.x_universal.dmg`
- Windows: `AI.PM_x.x.x_x64-setup.exe`

On first launch, configure your AI backend in Settings (pick one):
- **Anthropic API** — enter your API Key
- **OpenAI-compatible endpoint** — enter Base URL + Key (supports proxies)
- **Claude CLI** — reuse your locally logged-in Claude Code, no extra key needed

## Claude Code Commands

| Command | Description |
|---------|-------------|
| `/ai-pm [idea]` | Full workflow: requirement → PRD → prototype → review |
| `/ai-pm --team [idea]` | Complex requirements, multi-agent parallel collaboration |
| `/ai-pm continue` | Resume the last unfinished project |
| `/ai-pm priority` | Requirement priority assessment |
| `/ai-pm weekly` | Weekly report generation |
| `/ai-pm interview` | On-site interview mode |
| `/ai-pm data [file]` | Data insight analysis |
| `/ai-pm persona` | Product persona (style learning) |
| `/ai-pm design-spec` | Design spec management |
| `/ai-pm knowledge` | Product knowledge base |

Standalone skills: `/ai-pm-analyze`, `/ai-pm-research`, `/ai-pm-story`, `/ai-pm-prd`, `/ai-pm-prototype`, `/ai-pm-review`

## Feature Comparison

| Capability | Claude Code | Desktop App |
|-----------|:---:|:---:|
| Web search (competitive research) | Native | CLI mode |
| Script execution (data analysis) | Native | CLI mode |
| Multi-agent parallel | Yes | Planned |
| Playwright web analysis | Yes | Requires local setup |
| Visual Dashboard | - | Yes |
| Drag-and-drop editing | - | Yes |
| Device simulation preview | - | Yes |
| Brainstorm mode | Natural conversation | Dedicated mode |
| Offline use | Online required | API mode online |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5, Vite 6, TailwindCSS 4, Mermaid 11 |
| Backend | Tauri 2, Rust, SQLite |
| AI Skills | Claude Code Skills (Markdown-based, 23 skills) |
| Export Scripts | Python 3 (python-docx, python-pptx, Pillow) |
| CI/CD | GitHub Actions, macOS universal binary + Windows x64 |

## Project Structure

```
.claude/skills/          # 23 AI skills (Claude Code)
app/src/                 # React frontend (13 pages, 9 tools, 63 components)
app/src-tauri/           # Rust backend (13 command modules)
templates/               # PRD styles, UI specs, knowledge base, presets
docs/                    # Design system, implementation plans
output/                  # Per-project output (git-ignored)
AI_PM_教程中心.html       # Interactive tutorial (open in browser, offline)
```

## Tutorial

Open `AI_PM_教程中心.html` in your browser (works offline) for a visual guide covering both the Claude Code edition and the desktop app.

## License

[MIT](LICENSE)
