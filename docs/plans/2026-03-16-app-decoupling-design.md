# App 解耦设计文档

**Date:** 2026-03-16
**Status:** Approved

## 背景

AI_PM 项目目前由两部分组成：

- `.claude/skills/` — Claude Code 技能集，面向 Claude Code CLI 用户
- `app/` — Tauri 桌面 app，面向独立软件用户

两者同在一个 repo（monorepo）。app 目前强依赖外部 `ai_pm_root` 路径来加载 skills，导致 app 无法独立发版。

## 目标

- app 打包时内置 skills，用户下载安装包即可使用，无需配置任何路径
- AI_PM skills 更新后，下次 app 构建时自动打包进去
- 两个产品保持 monorepo，但 app 内部与外部路径完全解耦

## 决策

- **repo 结构**：保持单 repo，不拆分
- **skills 来源**：构建时自动从 `../../.claude/skills/` 复制到 app 资源目录（build.rs 方案）
- **输出目录**：保持用户自定义配置（已有功能，不变）
- **`ai_pm_root`**：彻底移除

---

## Design

### Part 1：Skills 打包进 app

**新增 `app/src-tauri/build.rs`**

每次编译时自动将 `../../.claude/skills/` 复制到 `src-tauri/resources/skills/`：

```rust
fn main() {
    let src = std::path::Path::new("../../.claude/skills");
    let dst = std::path::Path::new("resources/skills");
    copy_dir(src, dst);
    println!("cargo:rerun-if-changed=../../.claude/skills");
    tauri_build::build()
}
```

**`tauri.conf.json` 配置**

```json
{
  "bundle": {
    "resources": ["resources/skills/**/*"]
  }
}
```

**`stream.rs` 的 `load_skill()` 修改**

传入 `app: &AppHandle`，通过 `app.path().resource_dir()` 定位内置 skills：

```rust
fn load_skill(app: &AppHandle, skill_name: &str) -> Result<String, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("无法获取资源目录：{}", e))?;
    let skill_dir = resource_dir.join("skills").join(skill_name);
    // 后续逻辑不变
}
```

`start_stream` 函数签名中已有 `app: AppHandle`，直接传入即可。

---

### Part 2：移除 `ai_pm_root`

**`AppState`（`state.rs`）**

移除 `ai_pm_root: String` 字段。

**`ClaudeConfig`（`config.rs`）**

移除 `ai_pm_root` 相关配置字段及读写逻辑。

**`ClaudeCliProvider`（`claude_cli.rs`）**

`work_dir` 字段保留，但改由 `stream.rs` 传入项目的 `output_dir`（绝对路径，已存在数据库中）：

```rust
Backend::ClaudeCli => {
    Box::new(crate::providers::claude_cli::ClaudeCliProvider {
        work_dir: output_dir.clone(),  // 项目输出目录，而非 ai_pm_root
    })
}
```

**设置页面（`Settings.tsx`）**

移除 `ai_pm_root` / skills 路径输入框。

**`tauri-api.ts`**

移除 `ConfigState` 中的 `ai_pm_root` 字段。

---

## Files Changed

| 文件 | 变更类型 |
|------|---------|
| `app/src-tauri/build.rs` | 新建：编译时复制 skills |
| `app/src-tauri/tauri.conf.json` | 修改：bundle resources |
| `app/src-tauri/src/commands/stream.rs` | 修改：load_skill 改用资源目录，ClaudeCli 传 output_dir |
| `app/src-tauri/src/state.rs` | 修改：移除 ai_pm_root |
| `app/src-tauri/src/commands/config.rs` | 修改：移除 ai_pm_root 配置 |
| `app/src-tauri/src/providers/claude_cli.rs` | 修改：work_dir 语义变更（output_dir） |
| `app/src/pages/Settings.tsx` | 修改：移除 ai_pm_root 输入框 |
| `app/src/lib/tauri-api.ts` | 修改：移除 ai_pm_root 字段 |
