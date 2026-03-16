# AI PM Tauri Desktop Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Tauri 2.0 desktop app at `app/` that completely replaces the Next.js `web/` version, with custom frameless 终末地-styled window, Rust backend, and identical UX.

**Architecture:** Rust backend (`src-tauri/src/`) handles SQLite, config, file I/O, and Claude API streaming. React 19 frontend (`src/`) in Vite + Tailwind v4 + React Router v7 calls Rust via `invoke()`. Streaming replaces SSE: Rust emits `stream_chunk`/`stream_done`/`stream_error` Tauri events; frontend listens with `@tauri-apps/api/event`.

**Tech Stack:** Tauri 2, Rust (rusqlite, reqwest, tokio, serde_json), React 19, TypeScript, Vite 6, Tailwind v4, React Router v7, `@tauri-apps/api` v2

---

## Scene Setting (READ THIS FIRST)

You are building a brand-new Tauri desktop app. The existing `web/` (Next.js) app serves as the reference implementation — you will port its React components and business logic, replacing:

| Web pattern | Tauri pattern |
|-------------|---------------|
| `next/navigation` `useRouter()` | `react-router-dom` `useNavigate()` |
| `next/navigation` `useParams()` | `react-router-dom` `useParams()` |
| `next/link` `<Link>` | `react-router-dom` `<Link>` |
| `fetch('/api/...')` | `invoke('command_name', args)` from `@tauri-apps/api/core` |
| SSE EventSource / fetch stream | `listen('stream_chunk', handler)` from `@tauri-apps/api/event` |
| `"use client"` directives | Delete — Vite has no server components |
| `@/components/...` import paths | `../components/...` relative paths (or configure vite alias `@` → `./src`) |

All React component logic stays the same. Only imports and data-fetching patterns change.

**Reading skill files:** The Rust backend reads AI PM skill files from the AI PM installation root. Derive `ai_pm_root` from `~/.ai-pm-config`: `projects_dir = /path/to/AI_PM/output/projects` → `ai_pm_root = /path/to/AI_PM` (go up 2 levels). Skill files are at `{ai_pm_root}/.claude/skills/{skillName}/SKILL.md`.

---

## Task 1: Scaffold Tauri Project Structure

**Files to create:**
- `app/package.json`
- `app/vite.config.ts`
- `app/tsconfig.json`
- `app/tsconfig.node.json`
- `app/index.html`
- `app/src-tauri/Cargo.toml`
- `app/src-tauri/build.rs`
- `app/src-tauri/tauri.conf.json`
- `app/src-tauri/capabilities/default.json`
- `app/src-tauri/src/main.rs` (minimal — delegates to lib.rs)
- `app/src-tauri/src/lib.rs` (minimal placeholder — real content in Task 4)
- `app/src/main.tsx` (minimal React entry)
- `app/src/App.tsx` (placeholder — replaced in Task 8)

**Step 1: Create `app/package.json`**

```json
{
  "name": "ai-pm",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@base-ui/react": "^1.3.0",
    "@hello-pangea/dnd": "^18.0.1",
    "@tauri-apps/api": "^2",
    "@tiptap/extension-placeholder": "^3.20.1",
    "@tiptap/pm": "^3.20.1",
    "@tiptap/react": "^3.20.1",
    "@tiptap/starter-kit": "^3.20.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.577.0",
    "mermaid": "^11.13.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^7.0.0",
    "rehype-raw": "^7.0.0",
    "remark-gfm": "^4.0.1",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@tailwindcss/vite": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^6"
  }
}
```

**Step 2: Create `app/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` command
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

**Step 3: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create `app/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create `app/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI PM</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create `app/src-tauri/Cargo.toml`**

```toml
[package]
name = "ai-pm"
version = "0.1.0"
edition = "2021"

[lib]
name = "ai_pm_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
futures-util = "0.3"
uuid = { version = "1", features = ["v4"] }
chrono = "0.4"
dirs = "5"
```

**Step 7: Create `app/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

**Step 8: Create `app/src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "AI PM",
  "version": "0.1.0",
  "identifier": "com.ai-pm.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "AI PM",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "decorations": false,
        "titleBarStyle": "Overlay",
        "hiddenTitle": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**Step 9: Create `app/src-tauri/capabilities/default.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2/capability",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-fullscreen",
    "core:window:allow-minimize",
    "core:window:allow-close"
  ]
}
```

**Step 10: Create `app/src-tauri/src/main.rs`**

```rust
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_pm_lib::run()
}
```

**Step 11: Create minimal `app/src-tauri/src/lib.rs`** (placeholder — will be expanded in Task 4)

```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 12: Create minimal `app/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div>AI PM — loading...</div>
  </React.StrictMode>
);
```

**Step 13: Generate default Tauri icons** (required for build)

```bash
cd app
# Install dependencies first
npm install
# Generate placeholder icons (requires ImageMagick or use tauri icon command)
mkdir -p src-tauri/icons
# Download a placeholder or copy from web/app/favicon.ico if available
# The simplest approach: use tauri's icon generation if the CLI is available
npx @tauri-apps/cli icon ../web/app/favicon.ico 2>/dev/null || true
# If that fails, create minimal PNG placeholders programmatically:
node -e "
const { execSync } = require('child_process');
const sizes = ['32x32', '128x128', '128x128@2x'];
// If we can't generate real icons, the build will fail — note this in the output
console.log('Icons needed in src-tauri/icons/ — run: npx @tauri-apps/cli icon <source-image>');
"
```

> **Note for icon generation:** If `npx @tauri-apps/cli icon` fails, create a 1024x1024 source PNG at `app/app-icon.png` first, then run `cd app && npx @tauri-apps/cli icon app-icon.png`. For testing purposes, copy any PNG as a placeholder into all required icon slots.

**Step 14: Verify structure**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
npm install 2>&1 | tail -5
```

Expected: `cargo check` compiles successfully. `npm install` completes without errors.

**Step 15: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/
git commit -m "feat: scaffold Tauri 2.0 project in app/"
```

---

## Task 2: Port Design System (CSS + Fonts + Tailwind)

**Files to create/copy:**
- `app/src/index.css` (adapted from `web/app/globals.css`)
- `app/public/fonts/GeistVF.woff2` (copy from `web/app/fonts/`)
- `app/public/fonts/GeistMonoVF.woff2` (copy from `web/app/fonts/`)

**Step 1: Copy fonts**

```bash
mkdir -p /Users/xiaowu/workplace/AI_PM/app/public/fonts
cp /Users/xiaowu/workplace/AI_PM/web/app/fonts/GeistVF.woff2 /Users/xiaowu/workplace/AI_PM/app/public/fonts/
cp /Users/xiaowu/workplace/AI_PM/web/app/fonts/GeistMonoVF.woff2 /Users/xiaowu/workplace/AI_PM/app/public/fonts/
```

**Step 2: Create `app/src/index.css`**

Copy the content of `web/app/globals.css` verbatim, but:
1. Replace the first 3 lines (`@import "tailwindcss"`, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`) with:
   ```css
   @import "tailwindcss";
   @import "tw-animate-css";
   ```
2. Replace `@custom-variant dark (&:is(.dark *));` → keep as-is (Tailwind v4 supports this)
3. Replace `@theme inline { ... }` block — keep as-is
4. At the very top, add font-face declarations for Geist:

```css
@font-face {
  font-family: 'GeistSans';
  src: url('/fonts/GeistVF.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
}

@font-face {
  font-family: 'GeistMono';
  src: url('/fonts/GeistMonoVF.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
}
```

5. Add CSS variable declarations for the fonts at the top of `:root`:
```css
--font-geist-sans: 'GeistSans', system-ui, sans-serif;
--font-geist-mono: 'GeistMono', 'Courier New', monospace;
```

The full `app/src/index.css` should have: font-face declarations → @import tailwindcss → @import tw-animate-css → @custom-variant → @theme inline → :root with ALL variables including `--font-geist-sans` and `--font-geist-mono` → .dark → keyframes (dotPulse, fadeInUp, progressFill, rippleOut) → any global styles.

Also add this at the end (was in web/app/globals.css after keyframes):
```css
/* Suppress DevTools overlay */
nextjs-portal { display: none !important; }

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans);
  -webkit-font-smoothing: antialiased;
}
```

**Step 3: Update `app/src/main.tsx` to import CSS**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ fontFamily: "var(--font-geist-sans)" }}>AI PM — loading...</div>
  </React.StrictMode>
);
```

**Step 4: Verify fonts load in dev mode**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
npm run dev &
sleep 3
# Check vite compiles without CSS errors
```

**Step 5: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/index.css app/public/fonts/ app/src/main.tsx
git commit -m "feat: port 终末地 design system to Tauri app"
```

---

## Task 3: Port Shared React Components

**Files to create (all in `app/src/`):**
- `lib/utils.ts` — verbatim copy from `web/lib/utils.ts`
- `lib/story-parser.ts` — verbatim copy from `web/lib/story-parser.ts`
- `lib/design-tokens.ts` — verbatim copy from `web/lib/design-tokens.ts`
- `components/ui/badge.tsx` — verbatim copy from `web/components/ui/badge.tsx`
- `components/ui/button.tsx` — verbatim copy from `web/components/ui/button.tsx`
- `components/ui/card.tsx` — verbatim copy from `web/components/ui/card.tsx`
- `components/ui/progress-bar.tsx` — verbatim copy from `web/components/ui/progress-bar.tsx`
- `components/ui/confirm-dialog.tsx` — verbatim copy from `web/components/ui/confirm-dialog.tsx`
- `components/rarity-stripe-card.tsx` — verbatim copy
- `components/inline-chat.tsx` — verbatim copy (remove `"use client"`)
- `components/analysis-cards.tsx` — verbatim copy (remove `"use client"`)
- `components/stage-nav.tsx` — verbatim copy (remove `"use client"`)
- `components/story-board.tsx` — verbatim copy (remove `"use client"`)
- `components/story-card.tsx` — verbatim copy (remove `"use client"`)
- `components/prd-viewer.tsx` — verbatim copy (remove `"use client"`)
- `components/prd-toc.tsx` — verbatim copy (remove `"use client"`)
- `components/mermaid-renderer.tsx` — verbatim copy (remove `"use client"`)
- `components/rich-editor.tsx` — verbatim copy (remove `"use client"`)
- `components/file-upload.tsx` — verbatim copy (remove `"use client"`)
- `components/new-project-dialog.tsx` — adapted (remove `"use client"`, remove next/link)

**Step 1: Create lib directory and copy files**

```bash
mkdir -p /Users/xiaowu/workplace/AI_PM/app/src/lib
mkdir -p /Users/xiaowu/workplace/AI_PM/app/src/components/ui
```

Copy the following files verbatim (they have no Next.js dependencies):
- `web/lib/utils.ts` → `app/src/lib/utils.ts`
- `web/lib/story-parser.ts` → `app/src/lib/story-parser.ts`
- `web/lib/design-tokens.ts` → `app/src/lib/design-tokens.ts`
- `web/components/ui/badge.tsx` → `app/src/components/ui/badge.tsx`
- `web/components/ui/button.tsx` → `app/src/components/ui/button.tsx`
- `web/components/ui/card.tsx` → `app/src/components/ui/card.tsx`
- `web/components/ui/progress-bar.tsx` → `app/src/components/ui/progress-bar.tsx`
- `web/components/ui/confirm-dialog.tsx` → `app/src/components/ui/confirm-dialog.tsx`
- `web/components/rarity-stripe-card.tsx` → `app/src/components/rarity-stripe-card.tsx`
- `web/components/analysis-cards.tsx` → `app/src/components/analysis-cards.tsx`
- `web/components/stage-nav.tsx` → `app/src/components/stage-nav.tsx`
- `web/components/story-board.tsx` → `app/src/components/story-board.tsx`
- `web/components/story-card.tsx` → `app/src/components/story-card.tsx`
- `web/components/prd-viewer.tsx` → `app/src/components/prd-viewer.tsx`
- `web/components/prd-toc.tsx` → `app/src/components/prd-toc.tsx`
- `web/components/mermaid-renderer.tsx` → `app/src/components/mermaid-renderer.tsx`
- `web/components/rich-editor.tsx` → `app/src/components/rich-editor.tsx`
- `web/components/file-upload.tsx` → `app/src/components/file-upload.tsx`
- `web/components/inline-chat.tsx` → `app/src/components/inline-chat.tsx`

After copying ALL of the above, do a global search-and-replace for `"use client"` and remove those lines.

**Step 2: Adapt `new-project-dialog.tsx`**

Copy `web/components/new-project-dialog.tsx` to `app/src/components/new-project-dialog.tsx`, then:
- Remove `"use client"` line
- Replace `import { invoke } from "@tauri-apps/api/core"` for fetch call

The `onCreated` fetch call in new-project-dialog calls `POST /api/projects`. Adapt:

Find the fetch call pattern (something like `await fetch("/api/projects", {method: "POST", ...})`).
Replace with:
```typescript
import { invoke } from "@tauri-apps/api/core"
// ...
const project = await invoke<{ id: string; name: string }>("create_project", { name: name.trim() })
```

Remove the `description` field from the request if the web version sends it (it was removed in the UX polish — only `name` is sent now).

**Step 3: Verify TypeScript compiles**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
npx tsc --noEmit 2>&1 | head -30
```

Fix any import errors (usually missing `@tauri-apps/api` or wrong import paths).

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/
git commit -m "feat: port all shared React components to Tauri app"
```

---

## Task 4: Implement Rust AppState + DB Initialization

**Files to create:**
- `app/src-tauri/src/db.rs`
- `app/src-tauri/src/state.rs`
- `app/src-tauri/src/lib.rs` (replace minimal placeholder)
- `app/src-tauri/src/commands/mod.rs`

**Step 1: Create `app/src-tauri/src/state.rs`**

```rust
use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub projects_dir: String,
    pub ai_pm_root: String,
    pub config_dir: String,
}
```

**Step 2: Create `app/src-tauri/src/db.rs`**

```rust
use rusqlite::{Connection, Result};

pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            current_phase TEXT NOT NULL DEFAULT 'requirement',
            output_dir TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_phases (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            phase TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            output_file TEXT,
            started_at TEXT,
            completed_at TEXT
        );

        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
    ")?;

    Ok(conn)
}
```

**Step 3: Create `app/src-tauri/src/commands/mod.rs`**

```rust
pub mod config;
pub mod files;
pub mod projects;
pub mod stream;
```

**Step 4: Replace `app/src-tauri/src/lib.rs` with full setup**

```rust
mod commands;
mod db;
mod state;

use db::init_db;
use state::AppState;
use std::fs;
use std::path::Path;

pub use state::AppState as TauriState;

fn resolve_app_paths() -> (String, String, String) {
    // Read ~/.ai-pm-config to get projects_dir
    let home = dirs::home_dir().unwrap_or_default();
    let config_path = home.join(".ai-pm-config");

    let projects_dir: String;
    let ai_pm_root: String;

    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(pd) = config["projects_dir"].as_str() {
                projects_dir = pd.to_string();
                // Derive ai_pm_root: go up 2 levels from output/projects
                let p = Path::new(pd);
                ai_pm_root = p.parent()  // output/
                    .and_then(|p| p.parent())  // AI_PM/
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| pd.to_string());
            } else {
                projects_dir = format!("{}/output/projects", home.display());
                ai_pm_root = format!("{}/AI_PM", home.display());
            }
        } else {
            projects_dir = format!("{}/output/projects", home.display());
            ai_pm_root = format!("{}/AI_PM", home.display());
        }
    } else {
        projects_dir = format!("{}/output/projects", home.display());
        ai_pm_root = format!("{}/AI_PM", home.display());
    }

    let config_dir = home.join(".config").join("ai-pm").to_string_lossy().to_string();

    (projects_dir, ai_pm_root, config_dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (projects_dir, ai_pm_root, config_dir) = resolve_app_paths();

    // Ensure data directories exist
    fs::create_dir_all(&projects_dir).ok();
    fs::create_dir_all(&config_dir).ok();

    // Init SQLite database
    let db_path = format!("{}/ai_pm.db", config_dir);
    let conn = init_db(&db_path).expect("Failed to initialize database");

    let state = AppState {
        db: std::sync::Mutex::new(conn),
        projects_dir,
        ai_pm_root,
        config_dir,
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::save_config,
            commands::config::test_config,
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::get_project,
            commands::projects::delete_project,
            commands::projects::advance_phase,
            commands::projects::update_phase,
            commands::files::read_project_file,
            commands::files::save_project_file,
            commands::stream::start_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Verify compilation**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30
```

Expected: `error[E0433]: failed to resolve: use of undeclared crate or module 'commands'` or similar — this is fine since command modules are empty stubs yet.

Create empty stub files to make it compile:

```bash
touch app/src-tauri/src/commands/config.rs
touch app/src-tauri/src/commands/files.rs
touch app/src-tauri/src/commands/projects.rs
touch app/src-tauri/src/commands/stream.rs
```

Add a placeholder function to each stub (minimum required to compile):
```rust
// In each stub file, add:
// (this will be replaced in subsequent tasks)
```

Actually, since `generate_handler![]` references specific function names, remove those from lib.rs temporarily — use an empty handler array `tauri::generate_handler![]` until commands are implemented in Tasks 5-7.

**Step 6: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/
git commit -m "feat: implement Rust AppState, DB init, and project structure"
```

---

## Task 5: Implement Rust Config Commands

**File to create:** `app/src-tauri/src/commands/config.rs`

This replaces the web's `GET /api/config`, `POST /api/config`, and `POST /api/config/test` routes.

**Step 1: Write `app/src-tauri/src/commands/config.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;

const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeConfig {
    #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(rename = "baseUrl", skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    pub model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigState {
    pub has_config: bool,
    pub config_source: String,
    pub api_key: Option<String>,   // masked: "sk-ant-...****"
    pub base_url: Option<String>,
    pub model: String,
}

fn get_config_path(config_dir: &str) -> String {
    format!("{}/config.json", config_dir)
}

pub fn read_config_internal(config_dir: &str) -> Option<ClaudeConfig> {
    // Tier 1: env var
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return Some(ClaudeConfig {
                api_key: Some(key),
                base_url: std::env::var("ANTHROPIC_BASE_URL").ok().filter(|s| !s.is_empty()),
                model: std::env::var("ANTHROPIC_MODEL").ok()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            });
        }
    }

    // Tier 2: local config file
    let config_path = get_config_path(config_dir);
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<ClaudeConfig>(&raw) {
            if config.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false) {
                return Some(config);
            }
        }
    }

    None
}

fn mask_key(key: &str) -> String {
    if key.len() > 8 {
        format!("{}****", &key[..8])
    } else {
        "****".to_string()
    }
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> ConfigState {
    // Check env var
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return ConfigState {
                has_config: true,
                config_source: "env".to_string(),
                api_key: Some(mask_key(&key)),
                base_url: std::env::var("ANTHROPIC_BASE_URL").ok().filter(|s| !s.is_empty()),
                model: std::env::var("ANTHROPIC_MODEL").ok()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            };
        }
    }

    // Check local config file
    let config_path = get_config_path(&state.config_dir);
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<ClaudeConfig>(&raw) {
            if let Some(key) = &config.api_key {
                if !key.is_empty() {
                    return ConfigState {
                        has_config: true,
                        config_source: "local".to_string(),
                        api_key: Some(mask_key(key)),
                        base_url: config.base_url,
                        model: config.model,
                    };
                }
            }
        }
    }

    ConfigState {
        has_config: false,
        config_source: "none".to_string(),
        api_key: None,
        base_url: None,
        model: DEFAULT_MODEL.to_string(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigArgs {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
pub fn save_config(state: State<AppState>, args: SaveConfigArgs) -> Result<serde_json::Value, String> {
    let config_path = get_config_path(&state.config_dir);

    // Read existing config
    let mut existing = if let Ok(raw) = fs::read_to_string(&config_path) {
        serde_json::from_str::<serde_json::Value>(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Merge new values
    if let Some(key) = args.api_key {
        if !key.is_empty() {
            existing["apiKey"] = serde_json::Value::String(key);
        }
    }
    if let Some(url) = args.base_url {
        existing["baseUrl"] = serde_json::Value::String(url);
    }
    if let Some(model) = args.model {
        if !model.is_empty() {
            existing["model"] = serde_json::Value::String(model);
        }
    }

    // Write back
    fs::create_dir_all(Path::new(&config_path).parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&config_path, serde_json::to_string_pretty(&existing).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "ok": true }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConfigArgs {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
pub async fn test_config(state: State<'_, AppState>, args: TestConfigArgs) -> Result<serde_json::Value, String> {
    // Determine which credentials to test
    let api_key = args.api_key
        .filter(|k| !k.is_empty())
        .or_else(|| read_config_internal(&state.config_dir).and_then(|c| c.api_key))
        .ok_or_else(|| "No API key configured".to_string())?;

    let base_url = args.base_url
        .filter(|u| !u.is_empty())
        .or_else(|| read_config_internal(&state.config_dir).and_then(|c| c.base_url))
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());

    let model = args.model
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let client = reqwest::Client::new();
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    let resp = client
        .post(&url)
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": &model,
            "max_tokens": 10,
            "messages": [{"role": "user", "content": "Hi"}]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(serde_json::json!({ "ok": true, "model": model }))
    } else {
        let err_body = resp.text().await.unwrap_or_default();
        Ok(serde_json::json!({ "ok": false, "error": err_body }))
    }
}
```

**Step 2: Register commands in `lib.rs`**

Update the `invoke_handler![]` macro in `lib.rs` to include:
```rust
commands::config::get_config,
commands::config::save_config,
commands::config::test_config,
```

**Step 3: Verify compilation**

```bash
cargo check --manifest-path /Users/xiaowu/workplace/AI_PM/app/src-tauri/Cargo.toml 2>&1 | grep -E "error|warning: unused" | head -20
```

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/commands/config.rs app/src-tauri/src/lib.rs
git commit -m "feat: implement Rust config commands (get/save/test)"
```

---

## Task 6: Implement Rust Project + File Commands

**Files to create:**
- `app/src-tauri/src/commands/projects.rs`
- `app/src-tauri/src/commands/files.rs`

**Step 1: Create `app/src-tauri/src/commands/projects.rs`**

```rust
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;
use crate::state::AppState;

const PHASES: &[&str] = &[
    "requirement", "analysis", "research", "stories", "prd", "prototype", "review",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPhase {
    pub id: String,
    pub project_id: String,
    pub phase: String,
    pub status: String,
    pub output_file: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_phase: String,
    pub output_dir: String,
    pub created_at: String,
    pub updated_at: String,
    pub phases: Vec<ProjectPhase>,
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectSummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, name, description, current_phase, output_dir, created_at, updated_at
         FROM projects ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let projects: Vec<ProjectSummary> = stmt.query_map([], |row| {
        let project_id: String = row.get(0)?;
        Ok((project_id, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?, row.get::<_, String>(4)?,
            row.get::<_, String>(5)?, row.get::<_, String>(6)?))
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, name, description, current_phase, output_dir, created_at, updated_at)| {
        let completed_count: i64 = db.query_row(
            "SELECT COUNT(*) FROM project_phases WHERE project_id = ?1 AND status = 'completed'",
            params![&id],
            |row| row.get(0),
        ).unwrap_or(0);

        ProjectSummary {
            id,
            name,
            description,
            current_phase,
            output_dir,
            created_at,
            updated_at,
            completed_count,
            total_phases: PHASES.len() as i64,
        }
    })
    .collect();

    Ok(projects)
}

#[tauri::command]
pub fn create_project(state: State<AppState>, name: String) -> Result<ProjectDetail, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let output_dir = format!("{}/{}", state.projects_dir, name);

    // Create project directory
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Insert project
    db.execute(
        "INSERT INTO projects (id, name, description, current_phase, output_dir, created_at, updated_at)
         VALUES (?1, ?2, NULL, 'requirement', ?3, ?4, ?4)",
        params![&id, &name, &output_dir, &now],
    ).map_err(|e| e.to_string())?;

    // Insert 7 phases
    let mut phases = Vec::new();
    for (idx, &phase) in PHASES.iter().enumerate() {
        let phase_id = Uuid::new_v4().to_string();
        let status = if idx == 0 { "in_progress" } else { "pending" };
        let started_at: Option<&str> = if idx == 0 { Some(&now) } else { None };

        db.execute(
            "INSERT INTO project_phases (id, project_id, phase, status, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![&phase_id, &id, phase, status, started_at],
        ).map_err(|e| e.to_string())?;

        phases.push(ProjectPhase {
            id: phase_id,
            project_id: id.clone(),
            phase: phase.to_string(),
            status: status.to_string(),
            output_file: None,
            started_at: started_at.map(|s| s.to_string()),
            completed_at: None,
        });
    }

    // Write _status.json
    write_status_json(&output_dir, &phases, "requirement");

    Ok(ProjectDetail {
        id,
        name,
        description: None,
        current_phase: "requirement".to_string(),
        output_dir,
        created_at: now.clone(),
        updated_at: now,
        phases,
    })
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> Result<Option<ProjectDetail>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let result = db.query_row(
        "SELECT id, name, description, current_phase, output_dir, created_at, updated_at
         FROM projects WHERE id = ?1",
        params![&id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
        )),
    );

    match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
        Ok(_) => {}
    }

    let (pid, name, description, current_phase, output_dir, created_at, updated_at) = result.unwrap();

    let mut stmt = db.prepare(
        "SELECT id, project_id, phase, status, output_file, started_at, completed_at
         FROM project_phases WHERE project_id = ?1 ORDER BY rowid"
    ).map_err(|e| e.to_string())?;

    let phases: Vec<ProjectPhase> = stmt.query_map(params![&pid], |row| {
        Ok(ProjectPhase {
            id: row.get(0)?,
            project_id: row.get(1)?,
            phase: row.get(2)?,
            status: row.get(3)?,
            output_file: row.get(4)?,
            started_at: row.get(5)?,
            completed_at: row.get(6)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(Some(ProjectDetail {
        id: pid,
        name,
        description,
        current_phase,
        output_dir,
        created_at,
        updated_at,
        phases,
    }))
}

#[tauri::command]
pub fn delete_project(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get output_dir before deleting
    let output_dir: Option<String> = db.query_row(
        "SELECT output_dir FROM projects WHERE id = ?1",
        params![&id],
        |row| row.get(0),
    ).ok();

    db.execute("DELETE FROM projects WHERE id = ?1", params![&id])
        .map_err(|e| e.to_string())?;

    // Delete project files
    if let Some(dir) = output_dir {
        if Path::new(&dir).exists() {
            fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePhaseArgs {
    pub project_id: String,
    pub phase: String,
    pub status: String,
    pub output_file: Option<String>,
}

#[tauri::command]
pub fn update_phase(state: State<AppState>, args: UpdatePhaseArgs) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get current phase row
    let phase_id: String = db.query_row(
        "SELECT id FROM project_phases WHERE project_id = ?1 AND phase = ?2",
        params![&args.project_id, &args.phase],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if args.status == "completed" {
        db.execute(
            "UPDATE project_phases SET status = ?1, completed_at = ?2, output_file = ?3 WHERE id = ?4",
            params![&args.status, &now, &args.output_file, &phase_id],
        ).map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "UPDATE project_phases SET status = ?1 WHERE id = ?2",
            params![&args.status, &phase_id],
        ).map_err(|e| e.to_string())?;
    }

    // Update project updated_at
    db.execute(
        "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        params![&now, &args.project_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn advance_phase(state: State<AppState>, id: String) -> Result<Option<String>, String> {
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let current_phase: String = db.query_row(
        "SELECT current_phase FROM projects WHERE id = ?1",
        params![&id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let current_idx = PHASES.iter().position(|&p| p == current_phase.as_str());
    let Some(idx) = current_idx else {
        return Ok(None);
    };

    if idx >= PHASES.len() - 1 {
        return Ok(None);
    }

    let next_phase = PHASES[idx + 1];

    // Mark current phase completed
    db.execute(
        "UPDATE project_phases SET status = 'completed', completed_at = ?1
         WHERE project_id = ?2 AND phase = ?3",
        params![&now, &id, &current_phase],
    ).map_err(|e| e.to_string())?;

    // Mark next phase in_progress
    db.execute(
        "UPDATE project_phases SET status = 'in_progress', started_at = ?1
         WHERE project_id = ?2 AND phase = ?3",
        params![&now, &id, next_phase],
    ).map_err(|e| e.to_string())?;

    // Update project current_phase
    db.execute(
        "UPDATE projects SET current_phase = ?1, updated_at = ?2 WHERE id = ?3",
        params![next_phase, &now, &id],
    ).map_err(|e| e.to_string())?;

    // Update _status.json
    let output_dir: String = db.query_row(
        "SELECT output_dir FROM projects WHERE id = ?1",
        params![&id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut phase_status = std::collections::HashMap::new();
    for &p in PHASES {
        let status: String = db.query_row(
            "SELECT status FROM project_phases WHERE project_id = ?1 AND phase = ?2",
            params![&id, p],
            |row| row.get(0),
        ).unwrap_or_else(|_| "pending".to_string());
        phase_status.insert(p, status == "completed");
    }

    let fake_phases: Vec<ProjectPhase> = PHASES.iter().map(|&p| ProjectPhase {
        id: String::new(),
        project_id: id.clone(),
        phase: p.to_string(),
        status: if *phase_status.get(p).unwrap_or(&false) { "completed" } else { "pending" }.to_string(),
        output_file: None,
        started_at: None,
        completed_at: None,
    }).collect();
    write_status_json(&output_dir, &fake_phases, next_phase);

    Ok(Some(next_phase.to_string()))
}

fn write_status_json(output_dir: &str, phases: &[ProjectPhase], last_phase: &str) {
    let phases_map: serde_json::Value = phases.iter().map(|p| {
        (p.phase.clone(), serde_json::Value::Bool(p.status == "completed"))
    }).collect::<serde_json::Map<_, _>>().into();

    let status = serde_json::json!({
        "phases": phases_map,
        "lastPhase": last_phase,
        "updatedAt": Utc::now().to_rfc3339(),
    });

    let path = Path::new(output_dir).join("_status.json");
    let _ = fs::write(path, serde_json::to_string_pretty(&status).unwrap());
}
```

**Step 2: Create `app/src-tauri/src/commands/files.rs`**

```rust
use serde::Deserialize;
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub fn read_project_file(
    state: State<AppState>,
    project_id: String,
    file_name: String,
) -> Result<Option<String>, String> {
    // Get project name from DB to resolve output_dir
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result: rusqlite::Result<String> = db.query_row(
        "SELECT output_dir FROM projects WHERE id = ?1",
        rusqlite::params![&project_id],
        |row| row.get(0),
    );

    let output_dir = match result {
        Ok(dir) => dir,
        Err(_) => return Ok(None),
    };

    let file_path = Path::new(&output_dir).join(&file_name);

    match fs::read_to_string(&file_path) {
        Ok(content) if !content.is_empty() => Ok(Some(content)),
        _ => Ok(None),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileArgs {
    pub project_id: String,
    pub file_name: String,
    pub content: String,
}

#[tauri::command]
pub fn save_project_file(
    state: State<AppState>,
    args: SaveFileArgs,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let output_dir: String = db.query_row(
        "SELECT output_dir FROM projects WHERE id = ?1",
        rusqlite::params![&args.project_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let file_path = Path::new(&output_dir).join(&args.file_name);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, &args.content).map_err(|e| e.to_string())?;

    Ok(())
}
```

**Step 3: Verify compilation**

```bash
cargo check --manifest-path /Users/xiaowu/workplace/AI_PM/app/src-tauri/Cargo.toml 2>&1 | grep "^error" | head -20
```

Fix any compilation errors.

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/commands/
git commit -m "feat: implement Rust project CRUD and file commands"
```

---

## Task 7: Implement Rust Streaming Command

**File to create:** `app/src-tauri/src/commands/stream.rs`

This is the most complex Rust command. It reads skill files, builds the system prompt, calls Claude API with SSE streaming, and emits Tauri events chunk-by-chunk.

**Step 1: Create `app/src-tauri/src/commands/stream.rs`**

```rust
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use crate::state::AppState;
use crate::commands::config::read_config_internal;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// Phase → (skill_name, input_files[], output_file)
fn phase_config(phase: &str) -> Option<(&'static str, &'static [&'static str], &'static str)> {
    match phase {
        "requirement" => Some(("ai-pm", &[], "01-requirement-draft.md")),
        "analysis" => Some(("ai-pm-analyze", &["01-requirement-draft.md"], "02-analysis-report.md")),
        "research" => Some(("ai-pm-research", &["01-requirement-draft.md", "02-analysis-report.md"], "03-competitor-report.md")),
        "stories" => Some(("ai-pm-story", &["02-analysis-report.md", "03-competitor-report.md"], "04-user-stories.md")),
        "prd" => Some(("ai-pm-prd", &["02-analysis-report.md", "03-competitor-report.md", "04-user-stories.md"], "05-prd/05-PRD-v1.0.md")),
        _ => None,
    }
}

fn load_skill(ai_pm_root: &str, skill_name: &str) -> Result<String, String> {
    let skill_dir = Path::new(ai_pm_root).join(".claude").join("skills").join(skill_name);
    let entry = skill_dir.join("SKILL.md");

    if !entry.exists() {
        return Err(format!("Skill not found: {} (looked in {})", skill_name, skill_dir.display()));
    }

    let mut files: Vec<String> = fs::read_dir(&skill_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|f| f.ends_with(".md"))
        .collect();

    // SKILL.md first, then alphabetical
    files.retain(|f| f != "SKILL.md");
    files.sort();

    let mut sections = Vec::new();

    // SKILL.md content
    let main_content = fs::read_to_string(&entry).map_err(|e| e.to_string())?;
    sections.push(main_content);

    // Sub-files
    for file in files {
        let path = skill_dir.join(&file);
        if let Ok(content) = fs::read_to_string(&path) {
            let label = file.trim_end_matches(".md");
            sections.push(format!("\n<!-- sub-file: {} -->\n{}", label, content));
        }
    }

    Ok(sections.join("\n"))
}

fn build_system_prompt(
    ai_pm_root: &str,
    output_dir: &str,
    project_name: &str,
    skill_name: &str,
    input_files: &[&str],
    user_input: Option<&str>,
) -> Result<String, String> {
    let skill_content = load_skill(ai_pm_root, skill_name)?;

    let mut parts = vec![skill_content];

    // Project context
    let mut ctx = vec![
        String::new(),
        "---".to_string(),
        String::new(),
        "## 当前项目上下文".to_string(),
        String::new(),
        format!("- 项目名称：{}", project_name),
    ];

    // Previous outputs
    let previous_outputs: Vec<(String, String)> = input_files.iter()
        .filter_map(|filename| {
            let path = Path::new(output_dir).join(filename);
            fs::read_to_string(&path).ok().map(|c| (filename.to_string(), c))
        })
        .collect();

    if !previous_outputs.is_empty() {
        ctx.push(String::new());
        ctx.push("### 已有产出物".to_string());
        ctx.push(String::new());
        for (filename, content) in &previous_outputs {
            ctx.push(format!("#### {}", filename));
            ctx.push(String::new());
            ctx.push("```".to_string());
            ctx.push(content.clone());
            ctx.push("```".to_string());
            ctx.push(String::new());
        }
    }

    if let Some(input) = user_input {
        ctx.push(String::new());
        ctx.push("### 用户输入".to_string());
        ctx.push(String::new());
        ctx.push(input.to_string());
    }

    parts.push(ctx.join("\n"));

    Ok(parts.join("\n"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartStreamArgs {
    pub project_id: String,
    pub phase: String,
    pub messages: Vec<ChatMessage>,
}

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    args: StartStreamArgs,
) -> Result<(), String> {
    let (project_name, output_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let result = db.query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ).map_err(|e| format!("Project not found: {}", e))?;
        result
    };

    let (skill_name, input_files, output_file) = phase_config(&args.phase)
        .ok_or_else(|| format!("Unknown phase: {}", args.phase))?;

    let last_user_msg = args.messages.iter().rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str());

    let system_prompt = build_system_prompt(
        &state.ai_pm_root,
        &output_dir,
        &project_name,
        skill_name,
        input_files,
        last_user_msg,
    ).map_err(|e| {
        let _ = app.emit("stream_error", &e);
        e
    })?;

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "API 未配置 — 请前往「设置」页面填写 API Key 后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    let base_url = config.base_url
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());
    let api_key = config.api_key.unwrap_or_default();

    let client = reqwest::Client::new();
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    let messages_json: Vec<serde_json::Value> = args.messages.iter().map(|m| {
        serde_json::json!({"role": m.role, "content": m.content})
    }).collect();

    let body = serde_json::json!({
        "model": config.model,
        "max_tokens": 8192,
        "stream": true,
        "system": system_prompt,
        "messages": messages_json,
    });

    let mut resp = client
        .post(&url)
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("HTTP error: {}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        let msg = format!("API error: {}", err_body);
        let _ = app.emit("stream_error", &msg);
        return Ok(());
    }

    let mut full_text = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE messages (separated by \n\n)
        loop {
            if let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" { continue; }
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                            if event["type"] == "content_block_delta" {
                                if let Some(text) = event["delta"]["text"].as_str() {
                                    full_text.push_str(text);
                                    let _ = app.emit("stream_chunk", text);
                                }
                            }
                        }
                    }
                }
            } else {
                break;
            }
        }
    }

    // Save output file
    let file_path = Path::new(&output_dir).join(output_file);
    if let Some(parent) = file_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&file_path, &full_text);

    let _ = app.emit("stream_done", output_file);

    Ok(())
}
```

**Step 2: Verify compilation**

```bash
cargo check --manifest-path /Users/xiaowu/workplace/AI_PM/app/src-tauri/Cargo.toml 2>&1 | grep "^error" | head -20
```

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src-tauri/src/commands/stream.rs
git commit -m "feat: implement Rust Claude API streaming command"
```

---

## Task 8: React Router + Layout Components

**Files to create:**
- `app/src/hooks/use-ai-stream.ts` (Tauri events version)
- `app/src/lib/tauri-api.ts` (typed invoke wrappers)
- `app/src/components/layout/TitleBar.tsx`
- `app/src/components/layout/TopBar.tsx`
- `app/src/components/layout/Sidebar.tsx` (port from `web/components/layout/sidebar.tsx`)
- `app/src/components/layout/SidebarShell.tsx`
- `app/src/components/layout/ProjectStageBar.tsx`
- `app/src/router.tsx`
- `app/src/App.tsx`
- `app/src/main.tsx` (final version)

**Step 1: Create `app/src/lib/tauri-api.ts`** — typed wrappers over `invoke()`

```typescript
import { invoke } from "@tauri-apps/api/core"

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProjectPhase {
  id: string
  projectId: string
  phase: string
  status: string
  outputFile: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  currentPhase: string
  outputDir: string
  createdAt: string
  updatedAt: string
  completedCount: number
  totalPhases: number
}

export interface ProjectDetail extends Omit<ProjectSummary, 'completedCount' | 'totalPhases'> {
  phases: ProjectPhase[]
}

export interface ConfigState {
  hasConfig: boolean
  configSource: string
  apiKey: string | null
  baseUrl: string | null
  model: string
}

export interface ChatMessage {
  role: string
  content: string
}

// ─── API functions ─────────────────────────────────────────────────────────

export const api = {
  // Projects
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  createProject: (name: string) => invoke<ProjectDetail>("create_project", { name }),
  getProject: (id: string) => invoke<ProjectDetail | null>("get_project", { id }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  advancePhase: (id: string) => invoke<string | null>("advance_phase", { id }),
  updatePhase: (args: { projectId: string; phase: string; status: string; outputFile?: string }) =>
    invoke<void>("update_phase", { args }),

  // Files
  readProjectFile: (projectId: string, fileName: string) =>
    invoke<string | null>("read_project_file", { projectId, fileName }),
  saveProjectFile: (args: { projectId: string; fileName: string; content: string }) =>
    invoke<void>("save_project_file", { args }),

  // Config
  getConfig: () => invoke<ConfigState>("get_config"),
  saveConfig: (args: { apiKey?: string; baseUrl?: string; model?: string }) =>
    invoke<{ ok: boolean }>("save_config", { args }),
  testConfig: (args: { apiKey?: string; baseUrl?: string; model?: string }) =>
    invoke<{ ok: boolean; model?: string; error?: string }>("test_config", { args }),

  // Stream (fire-and-forget — results come via events)
  startStream: (args: { projectId: string; phase: string; messages: ChatMessage[] }) =>
    invoke<void>("start_stream", { args }),
}
```

**Step 2: Create `app/src/hooks/use-ai-stream.ts`** — replaces web's SSE-based hook

```typescript
import { useState, useCallback, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"

interface UseAiStreamOptions {
  projectId: string
  phase: string
}

interface UseAiStreamReturn {
  text: string
  isStreaming: boolean
  error: string | null
  outputFile: string | null
  start: (messages: Array<{ role: string; content: string }>) => void
  reset: () => void
}

export function useAiStream({ projectId, phase }: UseAiStreamOptions): UseAiStreamReturn {
  const [text, setText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputFile, setOutputFile] = useState<string | null>(null)
  const cleanupRef = useRef<UnlistenFn[]>([])

  const cleanup = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setText("")
    setIsStreaming(false)
    setError(null)
    setOutputFile(null)
  }, [cleanup])

  const start = useCallback(
    (messages: Array<{ role: string; content: string }>) => {
      cleanup()
      setText("")
      setError(null)
      setOutputFile(null)
      setIsStreaming(true)

      // Set up listeners BEFORE invoking (to avoid missing early events)
      Promise.all([
        listen<string>("stream_chunk", (event) => {
          setText((prev) => prev + event.payload)
        }),
        listen<string>("stream_done", (event) => {
          setOutputFile(event.payload)
          setIsStreaming(false)
          cleanup()
        }),
        listen<string>("stream_error", (event) => {
          setError(event.payload)
          setIsStreaming(false)
          cleanup()
        }),
      ]).then((unlisteners) => {
        cleanupRef.current = unlisteners

        // Fire-and-forget: invoke starts streaming in Rust background
        api.startStream({ projectId, phase, messages }).catch((err: unknown) => {
          setError(String(err))
          setIsStreaming(false)
          cleanup()
        })
      })
    },
    [projectId, phase, cleanup]
  )

  return { text, isStreaming, error, outputFile, start, reset }
}
```

**Step 3: Port layout components from `web/components/layout/`**

Copy `web/components/layout/sidebar.tsx` → `app/src/components/layout/Sidebar.tsx`
- Remove `"use client"`
- Replace `import { useRouter } from "next/navigation"` with `import { useNavigate } from "react-router-dom"`
- Replace `router.push(...)` with `navigate(...)`

**Step 4: Create `app/src/components/layout/TitleBar.tsx`** — custom frameless titlebar

```tsx
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api } from "@/lib/tauri-api"

export function TitleBar() {
  const navigate = useNavigate()
  const [apiReady, setApiReady] = useState<boolean | null>(null)

  useEffect(() => {
    api.getConfig()
      .then((data) => setApiReady(data.hasConfig))
      .catch(() => setApiReady(false))
  }, [])

  return (
    <header
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 select-none items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* macOS traffic lights sit in the left 72px — leave space */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Brand — center */}
      <button
        onClick={() => navigate("/")}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-base font-bold tracking-[2px] text-[var(--dark)] transition-opacity hover:opacity-70"
      >
        // AI PM
      </button>

      {/* Right: API status + settings */}
      <div
        className="flex items-center gap-4"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {apiReady !== null && (
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
            title={apiReady ? "API 已配置" : "点击配置 API"}
          >
            <span
              className={cn(
                "inline-block h-2 w-2",
                apiReady ? "bg-[var(--green)]" : "bg-[var(--yellow)]"
              )}
              style={apiReady ? { animation: "dotPulse 2s ease-in-out infinite" } : undefined}
            />
            <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
              {apiReady ? "API_OK" : "API_UNSET"}
            </span>
          </button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate("/settings")}
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  )
}
```

**Step 5: Create `app/src/components/layout/SidebarShell.tsx`**

Port `web/components/layout/sidebar-shell.tsx`:
- Remove `"use client"`
- Replace `useRouter`/`useParams` with react-router-dom equivalents
- Replace `fetch("/api/projects")` with `api.listProjects()`

**Step 6: Create `app/src/components/layout/ProjectStageBar.tsx`**

Port `web/components/layout/project-stage-bar.tsx`:
- Remove `"use client"`
- Replace next/navigation with react-router-dom
- Replace `fetch("/api/projects/${id}")` with `api.getProject(id)`

**Step 7: Create `app/src/router.tsx`**

```tsx
import { createBrowserRouter } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"
import { ProjectLayout } from "./layouts/ProjectLayout"
import { DashboardPage } from "./pages/Dashboard"
import { SettingsPage } from "./pages/Settings"
import { RequirementPage } from "./pages/project/Requirement"
import { AnalysisPage } from "./pages/project/Analysis"
import { ResearchPage } from "./pages/project/Research"
import { StoriesPage } from "./pages/project/Stories"
import { PrdPage } from "./pages/project/Prd"
import { PrototypePage } from "./pages/project/Prototype"
import { ReviewPage } from "./pages/project/Review"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "settings", element: <SettingsPage /> },
      {
        path: "project/:id",
        element: <ProjectLayout />,
        children: [
          { path: "requirement", element: <RequirementPage /> },
          { path: "analysis", element: <AnalysisPage /> },
          { path: "research", element: <ResearchPage /> },
          { path: "stories", element: <StoriesPage /> },
          { path: "prd", element: <PrdPage /> },
          { path: "prototype", element: <PrototypePage /> },
          { path: "review", element: <ReviewPage /> },
        ],
      },
    ],
  },
])
```

**Step 8: Create layout wrappers**

`app/src/layouts/AppLayout.tsx`:
```tsx
import { Outlet } from "react-router-dom"
import { TitleBar } from "@/components/layout/TitleBar"

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
```

`app/src/layouts/ProjectLayout.tsx`:
```tsx
import { Outlet } from "react-router-dom"
import { TitleBar } from "@/components/layout/TitleBar"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { ProjectStageBar } from "@/components/layout/ProjectStageBar"

export function ProjectLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <SidebarShell />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ProjectStageBar />
          <main className="flex-1 overflow-y-auto p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
```

**Step 9: Update `app/src/main.tsx` (final)**

```tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { router } from "./router"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
```

**Step 10: Verify TypeScript compiles**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
npx tsc --noEmit 2>&1 | head -30
```

**Step 11: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/
git commit -m "feat: set up React Router, TitleBar drag region, and layout shell"
```

---

## Task 9: Port Dashboard + Settings Pages

**Files to create:**
- `app/src/pages/Dashboard.tsx`
- `app/src/pages/Settings.tsx`

**Step 1: Port `web/app/(dashboard)/page.tsx` → `app/src/pages/Dashboard.tsx`**

Copy the file, then adapt:
- Remove `"use client"`
- `import { useRouter } from "next/navigation"` → `import { useNavigate } from "react-router-dom"`
- `const router = useRouter()` → `const navigate = useNavigate()`
- `router.push(path)` → `navigate(path)`
- `fetch("/api/projects")` → `api.listProjects()`
- `fetch("/api/projects/${id}", { method: "DELETE" })` → `api.deleteProject(id)`
- Import `api` from `@/lib/tauri-api`
- Export as named export: `export function DashboardPage() { ... }`

**Step 2: Port `web/app/settings/page.tsx` → `app/src/pages/Settings.tsx`**

Copy the file, then adapt:
- Remove `"use client"`
- `import { useRouter } from "next/navigation"` → `import { useNavigate } from "react-router-dom"`
- All `fetch("/api/config")` → `api.getConfig()`
- `fetch("/api/config", { method: "POST", ... })` → `api.saveConfig(args)`
- `fetch("/api/config/test", { method: "POST", ... })` → `api.testConfig(args)`
- Update version string to "AI PM Desktop v0.1.0"
- Export as named export: `export function SettingsPage() { ... }`

**Step 3: Verify TypeScript**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/pages/
git commit -m "feat: port Dashboard and Settings pages to Tauri"
```

---

## Task 10: Port All Project Phase Pages

**Files to create:**
- `app/src/pages/project/Requirement.tsx`
- `app/src/pages/project/Analysis.tsx`
- `app/src/pages/project/Research.tsx`
- `app/src/pages/project/Stories.tsx`
- `app/src/pages/project/Prd.tsx`
- `app/src/pages/project/Prototype.tsx` (stub)
- `app/src/pages/project/Review.tsx` (stub)

**Common adaptation rules for all project pages:**
1. Remove `"use client"`
2. `useParams()` from react-router-dom (same API, just different import)
3. `useRouter()` → `useNavigate()`; `router.push(path)` → `navigate(path)`
4. `fetch("/api/projects/${id}")` → `api.getProject(id)`
5. `fetch("/api/projects/${id}/files/${file}")` → `api.readProjectFile(id, file)`
6. `fetch("/api/ai/save", { method: "POST", body: JSON.stringify({...}) })` → `api.saveProjectFile({ projectId, fileName, content })`
7. `fetch("/api/projects/${id}", { method: "PATCH", body: JSON.stringify({ action: "advance" }) })` → `api.advancePhase(id)`
8. `fetch("/api/projects/${id}", { method: "PATCH", body: JSON.stringify({ action: "updatePhase", ... }) })` → `api.updatePhase({ projectId: id, phase, status, outputFile })`
9. `useAiStream` import from `@/hooks/use-ai-stream` (hook API is identical, just internals changed)
10. Export as named function (not default): `export function RequirementPage() { ... }`

**Step 1: Port `web/app/project/[id]/requirement/page.tsx` → Requirement.tsx**

Port with adaptations above. Key changes:
- `const params = useParams()` and `params.id` (react-router-dom has same API)
- `useNavigate()` instead of `useRouter()`

**Step 2: Port `web/app/project/[id]/analysis/page.tsx` → Analysis.tsx**

Port with adaptations above. The `useAiStream` hook interface is identical — it just uses Tauri events internally instead of SSE. No page-level changes needed to the hook usage.

**Step 3: Port remaining AI-stream pages**

For Research (`web/app/project/[id]` — check if research page exists; if not, create a stub that mirrors analysis but with `phase: "research"` and `RESEARCH_FILE = "03-competitor-report.md"`).

For Stories: port `web/app/project/[id]/stories/page.tsx` → Stories.tsx

For PRD: port `web/app/project/[id]/prd/page.tsx` → Prd.tsx

**Step 4: Create stubs for Prototype and Review**

```tsx
// app/src/pages/project/Prototype.tsx
import { Badge } from "@/components/ui/badge"
export function PrototypePage() {
  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-6">
        <Badge variant="outline">PROTOTYPE</Badge>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <p className="mt-8 text-sm text-[var(--text-muted)]">原型设计功能即将推出</p>
    </div>
  )
}
```

Same pattern for Review.tsx.

**Step 5: Run TypeScript check**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Fix all type errors.

**Step 6: Run Tauri dev to test**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
npm run tauri dev 2>&1 &
sleep 15
# Window should open — verify:
# 1. TitleBar appears with // AI PM branding
# 2. Traffic lights work on Mac
# 3. Dashboard loads (may be empty initially)
# 4. Settings page loads and shows config
```

**Step 7: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add app/src/pages/
git commit -m "feat: port all project phase pages to Tauri"
```

---

## Task 11: Build Verification + Cleanup

**Goal:** Verify `npm run tauri build` produces a working .app bundle. Then update `~/.ai-pm-config` to include `ai_pm_root`, and clean up the `web/` directory and `启动 AI PM.command`.

**Step 1: Build for current platform**

```bash
cd /Users/xiaowu/workplace/AI_PM/app
npm run tauri build 2>&1 | tail -20
```

Expected output: `Finished 2 bundles at:` followed by paths to .dmg and .app files.

Common build failures and fixes:
- **Missing icons**: Run `npx @tauri-apps/cli icon app-icon.png` with a valid source PNG
- **Rust compile errors**: Run `cargo build` in `src-tauri/` to see detailed errors
- **TypeScript errors**: Run `npm run build` to see Vite build errors

**Step 2: Test the built app**

```bash
open /Users/xiaowu/workplace/AI_PM/app/src-tauri/target/release/bundle/macos/AI\ PM.app
```

Verify:
- [ ] Window opens with custom TitleBar (// AI PM branding, traffic lights)
- [ ] Window is draggable by the title bar
- [ ] Can navigate to Settings, configure API key
- [ ] Can create a new project
- [ ] Can enter requirement text and advance to analysis
- [ ] AI streaming works (analysis page shows streaming text)

**Step 3: Update `~/.ai-pm-config` to add `ai_pm_root`**

The Rust code currently derives `ai_pm_root` from `projects_dir`. As a safety measure, also store it explicitly:

```bash
node -e "
const fs = require('fs');
const path = require('fs');
const configPath = \`\${process.env.HOME}/.ai-pm-config\`;
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
config.ai_pm_root = '/Users/xiaowu/workplace/AI_PM';
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Updated ~/.ai-pm-config:', config);
"
```

**Step 4: Delete `web/` and `启动 AI PM.command`**

> ⚠️ Only do this after verifying the Tauri app works end-to-end.

```bash
cd /Users/xiaowu/workplace/AI_PM
rm -rf web/
rm -f "启动 AI PM.command"
```

Update `CLAUDE.md` to remove references to the web version:
- Remove the "前置条件" quick-start section referencing `npm run dev`
- Update the start instructions to reference the Tauri app

**Step 5: Update `.gitignore`**

Add Tauri-specific ignores to `.gitignore`:
```
# Tauri
app/node_modules/
app/dist/
app/src-tauri/target/
```

**Step 6: Final commit**

```bash
cd /Users/xiaowu/workplace/AI_PM
git add -A
git commit -m "feat: complete Tauri desktop client — web/ removed

- Tauri 2.0 desktop app replaces Next.js web version
- Custom frameless window with 终末地 design system
- Rust backend: SQLite (rusqlite), Claude API streaming, config mgmt
- React 19 + Vite 6 + React Router v7 frontend
- Mac arm64/x86_64 DMG ~25MB vs competitor's 493MB Electron app
- web/ and 启动 AI PM.command deleted (no legacy)"
```

---

## Implementation Notes

### Rust async in Tauri commands
Commands marked `async fn` run in Tauri's tokio runtime. The `State<'_>` borrow requires the `'_` lifetime annotation for async commands.

### WebkitAppRegion CSS
The drag region on macOS uses `-webkit-app-region: drag` CSS property. In Tauri, use `data-tauri-drag-region` attribute on elements OR inline style `WebkitAppRegion: "drag"`. Interactive elements inside a drag region need `WebkitAppRegion: "no-drag"`.

### Tauri event namespacing
Events `stream_chunk`, `stream_done`, `stream_error` are global. If multiple tabs or windows were possible, namespace them. For now single-window is fine.

### `invoke()` argument naming
Tauri snake_cases Rust struct fields: Rust `project_id` → JS sees `project_id` (unchanged when using `#[serde(rename_all = "camelCase")]` on the struct, but the command argument name in `invoke()` matches the Rust parameter name verbatim). Test each command in Tauri's dev console if invoke fails.

### Font loading in Vite
Fonts in `public/fonts/` are served at `/fonts/`. The `@font-face` src URL `/fonts/GeistVF.woff2` works in both dev (Vite dev server) and production (Tauri bundled app).
