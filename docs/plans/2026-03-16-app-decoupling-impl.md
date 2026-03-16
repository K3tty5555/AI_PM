# App 解耦实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 skills 打包进 app 资源，移除 `ai_pm_root` 外部路径依赖，app 可独立发版。

**Architecture:** 编译时 `build.rs` 把 `../../.claude/skills/` 复制到 `src-tauri/resources/skills/`，Tauri 将其打包进安装包；运行时通过 `app.path().resource_dir()` 读取内置 skills；CLI 模式工作目录改用项目 `output_dir`。

**Tech Stack:** Rust / Tauri 2 / React TypeScript

---

## Task 1: 更新 build.rs — 编译时复制 skills

**Files:**
- Modify: `app/src-tauri/build.rs`
- Create (gitignore): `app/src-tauri/resources/skills/`（由 build.rs 生成，不纳入版本库）

**Step 1: 替换 build.rs 全部内容**

```rust
use std::fs;
use std::path::Path;

fn copy_dir(src: &Path, dst: &Path) {
    if !src.exists() {
        panic!("Skills source directory not found: {}", src.display());
    }
    fs::create_dir_all(dst).expect("Failed to create resources/skills dir");
    for entry in fs::read_dir(src).expect("Failed to read skills dir") {
        let entry = entry.expect("Failed to read dir entry");
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir(&src_path, &dst_path);
        } else {
            fs::copy(&src_path, &dst_path).expect("Failed to copy skill file");
        }
    }
}

fn main() {
    // Copy skills from AI_PM monorepo into bundled resources
    let skills_src = Path::new("../../.claude/skills");
    let skills_dst = Path::new("resources/skills");

    copy_dir(skills_src, skills_dst);

    // Re-run if skills change
    println!("cargo:rerun-if-changed=../../.claude/skills");

    tauri_build::build()
}
```

**Step 2: 在 `app/src-tauri/.gitignore` 中添加（若文件不存在则新建）**

```
# Generated at build time from ../../.claude/skills
resources/skills/
```

**Step 3: 手动执行一次复制验证目录存在**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && source ~/.cargo/env && cargo build 2>&1 | tail -5
```

期望：`Finished dev profile` 且 `resources/skills/` 目录已生成。

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/build.rs app/src-tauri/.gitignore && git commit -m "feat: build.rs 编译时复制 skills 到 resources"
```

---

## Task 2: 配置 tauri.conf.json 打包 resources

**Files:**
- Modify: `app/src-tauri/tauri.conf.json`

**Step 1: 在 `bundle` 块中加入 `resources`**

找到：
```json
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
```

替换为：
```json
  "bundle": {
    "active": true,
    "targets": "all",
    "resources": ["resources/skills/**/*"],
    "icon": [
```

**Step 2: 验证 JSON 格式正确**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && python3 -c "import json; json.load(open('tauri.conf.json')); print('JSON OK')"
```

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/tauri.conf.json && git commit -m "feat: tauri.conf.json 配置 bundle resources"
```

---

## Task 3: 更新 stream.rs — load_skill 改用资源目录，ClaudeCli 用 output_dir

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs`

**Step 1: 修改 `load_skill` 函数签名和路径**

找到：
```rust
fn load_skill(ai_pm_root: &str, skill_name: &str) -> Result<String, String> {
    let skill_dir = Path::new(ai_pm_root).join(".claude").join("skills").join(skill_name);
```

替换为：
```rust
fn load_skill(skills_root: &str, skill_name: &str) -> Result<String, String> {
    let skill_dir = Path::new(skills_root).join(skill_name);
```

**Step 2: 修改 `build_system_prompt` 参数名**

找到：
```rust
fn build_system_prompt(
    ai_pm_root: &str,
    output_dir: &str,
```

替换为：
```rust
fn build_system_prompt(
    skills_root: &str,
    output_dir: &str,
```

找到函数体内：
```rust
    let skill_content = load_skill(ai_pm_root, skill_name)?;
```

替换为：
```rust
    let skill_content = load_skill(skills_root, skill_name)?;
```

**Step 3: 在 `start_stream` 中解析资源目录，替换 `ai_pm_root` 用法**

找到：
```rust
    let system_prompt = build_system_prompt(
        &state.ai_pm_root,
        &output_dir,
```

**上方**插入（紧接在 `let stream_start = Instant::now();` 之后）：
```rust
    // Resolve bundled skills directory from app resources
    let skills_root = app.path().resource_dir()
        .map_err(|e| {
            let msg = format!("无法获取资源目录：{}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?
        .join("skills")
        .to_string_lossy()
        .to_string();
```

然后把调用改为：
```rust
    let system_prompt = build_system_prompt(
        &skills_root,
        &output_dir,
```

**Step 4: ClaudeCliProvider 改用 output_dir**

找到：
```rust
        Backend::ClaudeCli => {
            Box::new(crate::providers::claude_cli::ClaudeCliProvider {
                work_dir: state.ai_pm_root.clone(),
            })
        }
```

替换为：
```rust
        Backend::ClaudeCli => {
            Box::new(crate::providers::claude_cli::ClaudeCliProvider {
                work_dir: output_dir.clone(),
            })
        }
```

**Step 5: 验证编译**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && source ~/.cargo/env && cargo check 2>&1 | tail -5
```

期望：`Finished dev profile`（可能有 unused import warning，正常）

**Step 6: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/commands/stream.rs && git commit -m "feat: stream.rs 改用内置 resources/skills，CLI 用 output_dir"
```

---

## Task 4: 移除 ai_pm_root — state.rs + lib.rs

**Files:**
- Modify: `app/src-tauri/src/state.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Step 1: 修改 `state.rs`，删除 `ai_pm_root` 字段**

找到：
```rust
pub struct AppState {
    pub db: Mutex<Connection>,
    pub projects_dir: String,
    pub ai_pm_root: String,
    pub config_dir: String,
}
```

替换为：
```rust
pub struct AppState {
    pub db: Mutex<Connection>,
    pub projects_dir: String,
    pub config_dir: String,
}
```

**Step 2: 修改 `lib.rs`，精简 `resolve_app_paths`**

找到整个 `fn resolve_app_paths() -> (String, String, String) {` 函数（第 11-78 行），替换为：

```rust
fn resolve_app_paths() -> (String, String) {
    let home = dirs::home_dir().unwrap_or_default();
    let config_dir = home
        .join(".config")
        .join("ai-pm")
        .to_string_lossy()
        .to_string();

    // Default projects dir: ~/Documents/AI PM
    let default_projects_dir = home
        .join("Documents")
        .join("AI PM")
        .to_string_lossy()
        .to_string();

    // Priority 1: app config.json (projectsDir key)
    let app_config_path = format!("{}/config.json", config_dir);
    let projects_dir: String = if let Ok(raw) = fs::read_to_string(&app_config_path) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            cfg["projectsDir"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| default_projects_dir.clone())
        } else {
            default_projects_dir.clone()
        }
    } else {
        default_projects_dir.clone()
    };

    (projects_dir, config_dir)
}
```

找到：
```rust
    let (projects_dir, ai_pm_root, config_dir) = resolve_app_paths();
```

替换为：
```rust
    let (projects_dir, config_dir) = resolve_app_paths();
```

找到：
```rust
    let state = AppState {
        db: std::sync::Mutex::new(conn),
        projects_dir,
        ai_pm_root,
        config_dir,
    };
```

替换为：
```rust
    let state = AppState {
        db: std::sync::Mutex::new(conn),
        projects_dir,
        config_dir,
    };
```

**Step 3: 验证编译**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && source ~/.cargo/env && cargo check 2>&1 | tail -5
```

期望：`Finished dev profile`，无 error。

**Step 4: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src-tauri/src/state.rs app/src-tauri/src/lib.rs && git commit -m "feat: 移除 ai_pm_root — AppState 和 lib.rs 精简"
```

---

## Task 5: 清理 Settings.tsx 硬编码路径

**Files:**
- Modify: `app/src/pages/Settings.tsx`

**Step 1: 找到并删除 About 卡片中的硬编码路径显示**

找到：
```tsx
            {isAutoDetected && (
              <p className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
                技能来源：/Users/xiaowu/workplace/AI_PM
              </p>
            )}
```

删除这 4 行（整个 `{isAutoDetected && ...}` 块）。

同时，`isAutoDetected` 变量现在无用，找到：
```typescript
  const isAutoDetected = config?.hasConfig && config.configSource !== "local"
```

删除这一行。

**Step 2: 验证 TypeScript**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1 | head -10
```

期望：无输出（零 error）。

**Step 3: Commit**

```bash
cd /Users/xiaowu/workplace/AI_PM && git add app/src/pages/Settings.tsx && git commit -m "fix: 移除 Settings 硬编码技能路径"
```

---

## Task 6: 最终验证

**Step 1: Rust 全量编译**

```bash
cd /Users/xiaowu/workplace/AI_PM/app/src-tauri && source ~/.cargo/env && cargo build 2>&1 | tail -5
```

期望：`Finished dev profile`

**Step 2: TypeScript 检查**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && npx tsc --noEmit 2>&1
```

期望：无输出

**Step 3: 验证 resources/skills 目录已生成**

```bash
ls /Users/xiaowu/workplace/AI_PM/app/src-tauri/resources/skills/ | head -10
```

期望：列出各 skill 目录（ai-pm, ai-pm-analyze 等）

**Step 4: 启动 dev 模式快速冒烟**

```bash
cd /Users/xiaowu/workplace/AI_PM/app && source ~/.cargo/env && npm run tauri dev > /tmp/tauri-dev.log 2>&1 &
sleep 20 && tail -10 /tmp/tauri-dev.log
```

期望：`Running target/debug/ai-pm` 出现，无 panic。

**Step 5: 确认无未提交改动**

```bash
cd /Users/xiaowu/workplace/AI_PM && git status
```

期望：`nothing to commit, working tree clean`
