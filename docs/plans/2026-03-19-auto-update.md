# Auto-Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 Tauri v2 客户端自动更新：启动时检查新版本，顶部横幅提示下载，下载完成后提示下次启动安装。

**Architecture:** 使用 `tauri-plugin-updater` 官方插件，更新 Manifest（`latest.json`）托管在 GitHub Pages，每次 push `v*` tag 时 GitHub Actions 自动构建双端安装包、签名、发布到 GitHub Release，并更新 Manifest。前端通过顶部横幅分三态展示：有更新 → 下载中 → 就绪。

**Tech Stack:** Rust `tauri-plugin-updater 2.x`, GitHub Actions `tauri-apps/tauri-action@v0`, Ed25519 签名, React useState/useEffect, TypeScript `@tauri-apps/api/core`

---

## ⚠️ 一次性手动操作（开发者自己做，不是代码任务）

在执行任何代码任务前，开发者需完成以下三步：

### 手动步骤 A：生成签名密钥

```bash
# 在 app/ 目录下运行
cd <AI_PM_ROOT>/app
npx tauri signer generate -w ~/.tauri/ai-pm.key
# 输入密码（可留空直接回车）
```

运行后会显示公钥（pub_key），**立即复制**，后面 Task 2 要填入 `tauri.conf.json`。

### 手动步骤 B：将私钥存入 GitHub Secrets

进入 `https://github.com/K3tty5555/AI_PM/settings/secrets/actions`，新增：
- `TAURI_SIGNING_PRIVATE_KEY` → `~/.tauri/ai-pm.key` 文件全部内容（`cat ~/.tauri/ai-pm.key`）
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → 生成时输入的密码（若留空则填空字符串 `""`）

### 手动步骤 C：开启 GitHub Pages

进入 `https://github.com/K3tty5555/AI_PM/settings/pages`：
- Source → `Deploy from a branch`
- Branch → `gh-pages`，路径 `/（root）`
- 保存，等待几分钟后 URL `https://K3tty5555.github.io/AI_PM/latest.json` 即可访问

---

### Task 1: Rust 后端 — 添加 tauri-plugin-updater

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/src/commands/mod.rs`
- Create: `app/src-tauri/src/commands/update.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/capabilities/default.json`
- Modify: `app/src-tauri/tauri.conf.json`

**Step 1: 在 Cargo.toml 添加依赖**

在 `[dependencies]` 末尾加一行：

```toml
tauri-plugin-updater = "2"
```

完整 `[dependencies]` 块变为：

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
futures-util = "0.3"
uuid = { version = "1", features = ["v4"] }
chrono = "0.4"
dirs = "5"
async-trait = "0.1"
```

**Step 2: 创建 update.rs 命令文件**

创建 `app/src-tauri/src/commands/update.rs`：

```rust
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: String,
    pub notes: String,
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let updater = app
        .updater()
        .map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true,
            version: update.version.clone(),
            notes: update.body.clone().unwrap_or_default(),
        }),
        Ok(None) => Ok(UpdateInfo {
            available: false,
            version: String::new(),
            notes: String::new(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())
}
```

**Step 3: 在 mod.rs 注册 update 模块**

在 `app/src-tauri/src/commands/mod.rs` 末尾追加：

```
pub mod update;
```

**Step 4: 在 lib.rs 注册插件和命令**

在 `app/src-tauri/src/lib.rs` 的 `tauri::Builder::default()` 链中加入插件和命令：

在 `.plugin(tauri_plugin_dialog::init())` 后面添加：
```rust
.plugin(tauri_plugin_updater::init())
```

在 `invoke_handler` 的命令列表末尾（`rename_project` 后）添加：
```rust
commands::update::check_update,
commands::update::download_and_install_update,
```

**Step 5: 在 capabilities/default.json 添加 updater 权限**

当前文件 `app/src-tauri/capabilities/default.json`：

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
    "core:window:allow-close",
    "shell:allow-open",
    "dialog:allow-open",
    "updater:default"
  ]
}
```

**Step 6: 在 tauri.conf.json 添加 updater 配置**

在 `app/src-tauri/tauri.conf.json` 的 `bundle` 块后面添加 `plugins` 块。

> ⚠️ `pubkey` 字段必须替换为手动步骤 A 中生成的真实公钥。格式如 `dW50cnVzdGVkIGNvbW1lbnQ6...`

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
        "decorations": true,
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
    "resources": ["resources/skills/**/*"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "updater": {
      "pubkey": "REPLACE_WITH_YOUR_PUBLIC_KEY",
      "endpoints": [
        "https://K3tty5555.github.io/AI_PM/latest.json"
      ]
    }
  }
}
```

**Step 7: cargo check 验证编译**

```bash
cd <AI_PM_ROOT>/app
cargo tauri build --no-bundle -- --message-format=json 2>&1 | tail -5
```

若无报错继续。如果编译报错 `updater()` 方法不存在，检查 `tauri-plugin-updater` 版本和 `capabilities` 配置。

**Step 8: Commit**

```bash
cd <USER_HOME>/workplace/AI_PM
git add app/src-tauri/Cargo.toml \
        app/src-tauri/Cargo.lock \
        app/src-tauri/src/commands/mod.rs \
        app/src-tauri/src/commands/update.rs \
        app/src-tauri/src/lib.rs \
        app/src-tauri/capabilities/default.json \
        app/src-tauri/tauri.conf.json
git commit -m "feat: add tauri-plugin-updater Rust backend"
```

---

### Task 2: 前端 TypeScript API 绑定

**Files:**
- Modify: `app/src/lib/tauri-api.ts`

**Step 1: 在 tauri-api.ts 末尾添加类型和函数**

打开 `app/src/lib/tauri-api.ts`，找到文件末尾，添加：

```typescript
// ─── Updater ────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  available: boolean
  version: string
  notes: string
}

export const checkUpdate = (): Promise<UpdateInfo> =>
  invoke("check_update")

export const downloadAndInstallUpdate = (): Promise<void> =>
  invoke("download_and_install_update")
```

**Step 2: Commit**

```bash
cd <USER_HOME>/workplace/AI_PM
git add app/src/lib/tauri-api.ts
git commit -m "feat: add update API bindings in tauri-api.ts"
```

---

### Task 3: 前端更新横幅（AppLayout.tsx）

**Files:**
- Modify: `app/src/layouts/AppLayout.tsx`

**Step 1: 实现更新横幅**

完整替换 `app/src/layouts/AppLayout.tsx` 文件内容：

```tsx
import type { CSSProperties } from "react"
import { useState, useEffect, useRef } from "react"
import { Outlet } from "react-router-dom"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { ActivityBar } from "@/components/layout/ActivityBar"
import { checkUpdate, downloadAndInstallUpdate } from "@/lib/tauri-api"
import type { UpdateInfo } from "@/lib/tauri-api"

export type Theme = "light" | "dark"

type BannerState = "idle" | "available" | "downloading" | "ready" | "error"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("sidebar-open")
    return stored === null ? true : stored === "true"
  })

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("app-theme") as Theme) ?? "light"
  })

  const [bannerState, setBannerState] = useState<BannerState>("idle")
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const checkDoneRef = useRef(false)

  // Sync theme class to <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove("theme-light", "theme-dark")
    html.classList.add(`theme-${theme}`)
    localStorage.setItem("app-theme", theme)
  }, [theme])

  // Startup update check (runs once)
  useEffect(() => {
    if (checkDoneRef.current) return
    checkDoneRef.current = true

    checkUpdate()
      .then((info) => {
        if (info.available) {
          setUpdateInfo(info)
          setBannerState("available")
        }
      })
      .catch((err) => {
        console.error("[Updater] check failed", err)
      })
  }, [])

  const handleDownload = async () => {
    setBannerState("downloading")
    try {
      await downloadAndInstallUpdate()
      setBannerState("ready")
    } catch (err) {
      console.error("[Updater] download failed", err)
      setBannerState("error")
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-open", String(next))
      return next
    })
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"))
  }

  const showBanner =
    !bannerDismissed && bannerState !== "idle"

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-[var(--background)]">
      <ActivityBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      <div
        data-tauri-drag-region
        className="fixed top-0 right-0 h-[44px] z-10"
        style={{
          left: sidebarOpen ? "252px" : "72px",
          WebkitAppRegion: "drag",
          transition: "left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      />

      <SidebarShell
        open={sidebarOpen}
        onToggle={toggleSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main
        className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 relative"
        style={{
          marginLeft: sidebarOpen ? 252 : 72,
          paddingTop: "44px",
          transition: "margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      >
        {/* Update banner */}
        {showBanner && (
          <div
            className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-2 text-sm"
            style={{
              background:
                bannerState === "ready"
                  ? "var(--accent-light, #DBEAFE)"
                  : bannerState === "error"
                  ? "#FEE2E2"
                  : "var(--accent-light, #DBEAFE)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span className="text-[var(--text-primary)]">
              {bannerState === "available" &&
                `有新版本 v${updateInfo?.version} 可用`}
              {bannerState === "downloading" && "正在下载更新…"}
              {bannerState === "ready" &&
                "✅ 更新已下载，下次启动时自动安装"}
              {bannerState === "error" && "更新下载失败，请稍后重试"}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {bannerState === "available" && (
                <button
                  onClick={handleDownload}
                  className="rounded-md bg-[var(--accent-color)] px-3 py-1 text-xs text-white hover:opacity-90"
                >
                  下载更新
                </button>
              )}
              {bannerState !== "downloading" && (
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-base leading-none"
                  aria-label="关闭"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  )
}
```

**Step 2: TypeScript 检查**

```bash
cd <AI_PM_ROOT>/app
npx tsc --noEmit 2>&1 | head -30
```

预期：无报错（或仅有与 update 无关的既有警告）

**Step 3: Commit**

```bash
cd <USER_HOME>/workplace/AI_PM
git add app/src/layouts/AppLayout.tsx
git commit -m "feat: add update banner in AppLayout startup check"
```

---

### Task 4: 设置页「关于」区域手动检查按钮

**Files:**
- Modify: `app/src/pages/Settings.tsx`

**Step 1: 在 Settings.tsx 顶部 import 区域添加 API 引用**

在已有的 `import { ... } from "@/lib/tauri-api"` 行中，加入 `checkUpdate, downloadAndInstallUpdate`（如果已有则跳过）：

找到 Settings.tsx 顶部 import，添加（或合并到已有 import）：

```typescript
import { checkUpdate, downloadAndInstallUpdate } from "@/lib/tauri-api"
import type { UpdateInfo } from "@/lib/tauri-api"
```

**Step 2: 在 Settings 函数体中添加状态和逻辑**

在 Settings 函数体内现有 state 声明区域末尾（找到最后一个 `const [xxx, setXxx] = useState` 的地方）添加：

```typescript
const [checkingUpdate, setCheckingUpdate] = useState(false)
const [manualUpdateInfo, setManualUpdateInfo] = useState<UpdateInfo | null>(null)
const [manualUpdateState, setManualUpdateState] = useState<
  "idle" | "available" | "downloading" | "ready" | "none" | "error"
>("idle")

const handleCheckUpdate = async () => {
  setCheckingUpdate(true)
  setManualUpdateState("idle")
  setManualUpdateInfo(null)
  try {
    const info = await checkUpdate()
    if (info.available) {
      setManualUpdateInfo(info)
      setManualUpdateState("available")
    } else {
      setManualUpdateState("none")
    }
  } catch (err) {
    console.error("[Settings] check update failed", err)
    setManualUpdateState("error")
  } finally {
    setCheckingUpdate(false)
  }
}

const handleManualDownload = async () => {
  setManualUpdateState("downloading")
  try {
    await downloadAndInstallUpdate()
    setManualUpdateState("ready")
  } catch (err) {
    console.error("[Settings] download update failed", err)
    setManualUpdateState("error")
  }
}
```

**Step 3: 替换「关于」Card 内容**

找到 Settings.tsx 中的 `{/* About Card */}` 注释块（约 1063-1086 行），替换整个 Card：

```tsx
{/* About Card */}
<Card className="hover:shadow-none">
  <CardHeader>
    <CardTitle>关于</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-primary)]">
        AI PM Desktop v0.1.0
      </p>
      <p className="text-sm text-[var(--text-secondary)]">
        基于 Claude API 的产品经理工作台
      </p>
      <button
        type="button"
        onClick={() => openUrl("https://github.com/K3tty5555/AI_PM")}
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--accent-color)] hover:underline"
      >
        <ExternalLink className="size-3.5" strokeWidth={1.75} />
        github.com/K3tty5555/AI_PM
      </button>

      {/* Manual update check */}
      <div className="mt-1 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate || manualUpdateState === "downloading"}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            {checkingUpdate ? "检查中…" : "检查更新"}
          </button>

          {manualUpdateState === "none" && (
            <span className="text-sm text-[var(--text-secondary)]">
              已是最新版本
            </span>
          )}
          {manualUpdateState === "available" && (
            <span className="text-sm text-[var(--text-primary)]">
              发现新版本 v{manualUpdateInfo?.version}
            </span>
          )}
          {manualUpdateState === "downloading" && (
            <span className="text-sm text-[var(--text-secondary)]">
              正在下载…
            </span>
          )}
          {manualUpdateState === "ready" && (
            <span className="text-sm text-[var(--accent-color)]">
              ✅ 已下载，下次启动自动安装
            </span>
          )}
          {manualUpdateState === "error" && (
            <span className="text-sm text-red-500">检查失败，请重试</span>
          )}
        </div>

        {manualUpdateState === "available" && (
          <button
            type="button"
            onClick={handleManualDownload}
            className="w-fit rounded-lg bg-[var(--accent-color)] px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            下载并安装
          </button>
        )}
      </div>
    </div>
  </CardContent>
</Card>
```

**Step 4: TypeScript 检查**

```bash
cd <AI_PM_ROOT>/app
npx tsc --noEmit 2>&1 | head -30
```

预期：无新增报错。

**Step 5: Commit**

```bash
cd <USER_HOME>/workplace/AI_PM
git add app/src/pages/Settings.tsx
git commit -m "feat: add manual update check in Settings About section"
```

---

### Task 5: GitHub Actions 发布工作流

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: 确认 .github/workflows/ 目录存在**

```bash
ls <AI_PM_ROOT>/.github/workflows/ 2>/dev/null || echo "目录不存在，需要创建"
```

如不存在：`mkdir -p <AI_PM_ROOT>/.github/workflows/`

**Step 2: 创建 release.yml**

创建 `<AI_PM_ROOT>/.github/workflows/release.yml`：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install frontend deps
        run: npm ci
        working-directory: app

      - name: Build and release (macOS universal)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: app
          tagName: ${{ github.ref_name }}
          releaseName: AI PM ${{ github.ref_name }}
          releaseBody: '请查看 CHANGELOG 了解此版本变更。'
          releaseDraft: false
          prerelease: false
          args: --target universal-apple-darwin

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install frontend deps
        run: npm ci
        working-directory: app

      - name: Build and release (Windows x64)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: app
          tagName: ${{ github.ref_name }}
          releaseName: AI PM ${{ github.ref_name }}
          releaseBody: '请查看 CHANGELOG 了解此版本变更。'
          releaseDraft: false
          prerelease: false

  update-manifest:
    needs: [build-macos, build-windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main

      - name: Download release assets
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG="${{ github.ref_name }}"
          VERSION="${TAG#v}"

          # Download .sig files
          gh release download "$TAG" --pattern "*.sig" --dir /tmp/sigs

          # Read signatures
          SIG_MAC_ARM=$(cat /tmp/sigs/*.aarch64.dmg.tar.gz.sig 2>/dev/null || echo "")
          SIG_MAC_X64=$(cat /tmp/sigs/*.x64.dmg.tar.gz.sig 2>/dev/null || echo "")
          SIG_WIN=$(cat /tmp/sigs/*.msi.zip.sig 2>/dev/null || echo "")

          REPO="K3tty5555/AI_PM"
          PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

          cat > latest.json <<EOF
          {
            "version": "${VERSION}",
            "notes": "更新至 ${TAG}",
            "pub_date": "${PUB_DATE}",
            "platforms": {
              "darwin-aarch64": {
                "signature": "${SIG_MAC_ARM}",
                "url": "https://github.com/${REPO}/releases/download/${TAG}/AI.PM_${VERSION}_aarch64.dmg.tar.gz"
              },
              "darwin-x86_64": {
                "signature": "${SIG_MAC_X64}",
                "url": "https://github.com/${REPO}/releases/download/${TAG}/AI.PM_${VERSION}_x64.dmg.tar.gz"
              },
              "windows-x86_64": {
                "signature": "${SIG_WIN}",
                "url": "https://github.com/${REPO}/releases/download/${TAG}/AI.PM_${VERSION}_x64_en-US.msi.zip"
              }
            }
          }
          EOF

      - name: Deploy latest.json to gh-pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
          publish_branch: gh-pages
          force_orphan: false
          keep_files: true
          include_files: latest.json
```

**Step 3: Commit**

```bash
cd <USER_HOME>/workplace/AI_PM
git add .github/workflows/release.yml
git commit -m "feat: add GitHub Actions release workflow for auto-update"
```

---

### Task 6: 整体验证

**Step 1: 前端 TypeScript 全量检查**

```bash
cd <AI_PM_ROOT>/app
npx tsc --noEmit 2>&1
```

预期：无新增报错。

**Step 2: Rust 编译检查**

```bash
cd <AI_PM_ROOT>/app
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20
```

预期：`warning: ...` 可接受，`error[E...]` 则需修复。

**Step 3: 开发模式启动验证**

```bash
cd <AI_PM_ROOT>/app
npm run tauri dev
```

预期：App 正常启动，控制台无 `[Updater]` 相关 panic。更新检查会因 `latest.json` 不存在而静默失败（被 `.catch` 捕获，不影响正常使用）。

---

## 发版流程（配置完成后每次上线使用）

```bash
# 1. 修改两处版本号（保持一致）
#    app/src-tauri/tauri.conf.json → "version"
#    app/src-tauri/Cargo.toml → version = "..."
#    app/src/pages/Settings.tsx → "AI PM Desktop v..."（字符串，手动改）

# 2. 提交
git add -A && git commit -m "chore: bump version to 0.2.0"

# 3. 打 tag 并推送（触发 GitHub Actions）
git tag v0.2.0
git push origin main --tags
```

GitHub Actions 自动完成：构建 → 签名 → 发布 Release → 更新 `latest.json`（约 15-20 分钟）。

---

## 注意事项

- **`pubkey` 必须填真实公钥**：Task 1 Step 6 中 `"REPLACE_WITH_YOUR_PUBLIC_KEY"` 必须换成手动步骤 A 生成的实际公钥，否则 updater 拒绝安装任何更新包
- **开发模式下更新检查静默失败**：开发时 `latest.json` 不存在，`checkUpdate` 会 reject，被 `.catch(console.error)` 吃掉，不影响正常功能
- **macOS universal binary**：`--target universal-apple-darwin` 同时打包 ARM + x64，一个 dmg 覆盖两种 Mac，Actions 中 ARM+x64 两条 platforms entry 的 url 和 sig 可能相同（指向同一个 universal dmg）
- **Windows 签名**：Windows 构建不需要代码签名证书（SmartScreen 会警告但不阻止），如需消除警告可后续添加 EV cert
