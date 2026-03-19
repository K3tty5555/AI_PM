# 自动更新功能设计文档

日期：2026-03-19

## 背景

AI PM 客户端（Tauri v2）内部分发，macOS + Windows 双端。当前无更新机制，用户需手动下载新版本。需实现启动时自动检查 + 提示下载 + 下次启动安装的完整更新流程。

---

## 架构

```
开发者 push tag v0.x.x
    ↓
GitHub Actions 自动触发
    ↓
  macOS 构建 + 签名       Windows 构建 + 签名
    ↓                         ↓
上传到 GitHub Release（.dmg.tar.gz / .msi.zip）
    ↓
更新 latest.json → GitHub Pages
    ↓
用户启动 App → 检查 latest.json → 有新版本 → 提示下载
→ 后台下载 → 完成后提示「下次启动自动安装」
```

---

## 组成部分

### 1. 签名密钥（一次性）

用 Tauri CLI 生成 Ed25519 密钥对：
- 私钥：存入 GitHub Secrets（`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）
- 公钥：写入 `tauri.conf.json` 的 `plugins.updater.pubkey` 字段

作用：防止安装包被篡改，Tauri updater 会校验每个下载包的签名。

### 2. 更新 Manifest（latest.json）

托管在 GitHub Pages（`gh-pages` 分支），路径：`https://K3tty5555.github.io/AI_PM/latest.json`

格式：
```json
{
  "version": "0.2.0",
  "notes": "更新说明",
  "pub_date": "2026-03-19T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<sig>",
      "url": "https://github.com/K3tty5555/AI_PM/releases/download/v0.2.0/AI.PM_0.2.0_aarch64.dmg.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<sig>",
      "url": "https://github.com/K3tty5555/AI_PM/releases/download/v0.2.0/AI.PM_0.2.0_x64.dmg.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<sig>",
      "url": "https://github.com/K3tty5555/AI_PM/releases/download/v0.2.0/AI.PM_0.2.0_x64_en-US.msi.zip"
    }
  }
}
```

每次发版由 GitHub Actions 自动生成并推送。

### 3. GitHub Actions Workflow

文件：`.github/workflows/release.yml`

触发条件：`push` 到 `v*` tag（如 `v0.2.0`）

Jobs：
- `build-macos`：在 `macos-latest` 上构建，输出 `.dmg.tar.gz` + `.sig`
- `build-windows`：在 `windows-latest` 上构建，输出 `.msi.zip` + `.sig`
- `update-manifest`：收集签名，生成 `latest.json`，推送到 `gh-pages`

使用 `tauri-apps/tauri-action@v0` 官方 Action。

### 4. Tauri 插件集成（Rust 端）

- 新增依赖：`tauri-plugin-updater = "2"`（`Cargo.toml`）
- 注册插件：`lib.rs` 中 `.plugin(tauri_plugin_updater::init())`
- 新增能力：`capabilities/default.json` 加 `updater:default`
- 新增 Rust 命令：
  - `check_update` → 返回 `{ available: bool, version: string, notes: string }`
  - `download_and_install_update` → 下载并标记安装，带进度事件

### 5. 前端 UI

**启动检查**（`AppLayout.tsx` 挂载时）：
- 调用 `check_update`，若 `available === true` → 显示顶部更新横幅

**更新横幅**（全局固定在内容区顶部）：
- 状态一：`有新版本 v0.2.0 · [下载更新]` — 蓝色，`bg-[var(--accent-light)]`
- 状态二：`正在下载… 42%` — 进度条，不可重复点击
- 状态三：`✅ 更新已就绪，下次启动自动安装 · [立即重启]`
- 关闭按钮：用户可手动关闭横幅

**设置页「关于」区域**：
- 显示当前版本号（从 `tauri.conf.json` 读取）
- `[检查更新]` 按钮：手动触发同一流程

---

## 发版流程（配置完成后）

```bash
# 1. 修改版本号（app/src-tauri/tauri.conf.json + app/src-tauri/Cargo.toml）
# 2. 提交
git add -A && git commit -m "chore: bump version to 0.2.0"
# 3. 打 tag 并 push
git tag v0.2.0
git push origin main --tags
```

GitHub Actions 自动完成后续所有步骤（约 15-20 分钟）。

---

## 一次性配置步骤（开发者手动操作）

### Step 1：生成签名密钥

```bash
# 在 app/ 目录下执行
npx tauri signer generate -w ~/.tauri/ai-pm.key
```

输出两个文件：
- `~/.tauri/ai-pm.key`（私钥，保密）
- `~/.tauri/ai-pm.key.pub`（公钥，填入代码）

### Step 2：将私钥存入 GitHub Secrets

进入 `https://github.com/K3tty5555/AI_PM/settings/secrets/actions`，新增两个 Secret：
- `TAURI_SIGNING_PRIVATE_KEY`：粘贴 `~/.tauri/ai-pm.key` 文件全部内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成时设置的密码（若未设置填空字符串）

### Step 3：开启 GitHub Pages

进入 `https://github.com/K3tty5555/AI_PM/settings/pages`：
- Source 选 `Deploy from a branch`
- Branch 选 `gh-pages`，路径 `/ (root)`
- 保存后 Pages URL 为 `https://K3tty5555.github.io/AI_PM/`

### Step 4-5：代码实现（由 Claude 完成）

- Cargo.toml / lib.rs / capabilities / tauri.conf.json
- GitHub Actions workflow
- 前端横幅 UI + 设置页按钮

---

## 不在本次范围

- 强制更新（不能跳过）
- 更新日志详情页
- 差量更新（Tauri updater 不支持）
- 私有 repo 的 token 认证（repo 为公开，无需）
