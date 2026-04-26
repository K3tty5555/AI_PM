# 客户端 AI 文生图集成 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Tauri 客户端中实现 AI 图片生成的完整集成——Rust API 封装、独立工具页、PRD 导出集成、Settings 配置、图片内联预览。

**Architecture:** Rust 后端 `commands/illustration.rs` 直接用 reqwest 调 Seedream API（同步返回，不用事件），前端通过 `safeInvoke` 调用。图片用 Tauri asset 协议加载（不做 base64 转码）。PRD 导出保留现有 SensitiveScanDialog，新增独立的 MermaidRenderDialog。Mermaid 检测和风格推荐在前端实现。

**Tech Stack:** Rust/Tauri 2 (reqwest, image, base64, dotenvy), React 19/TypeScript 5/Tailwind CSS 4

**Design Doc:** `docs/plans/2026-03-28-illustration-client-design.md`

---

## Phase 1: Rust 后端

### Task 1: 添加依赖 + 更新 AppState

**Files:**
- Modify: `app/src-tauri/Cargo.toml:32` (依赖区末尾)
- Modify: `app/src-tauri/src/state.rs:1-8`

**Step 1: 在 Cargo.toml 添加三个依赖**

在第 32 行 `once_cell = "1"` 之后添加：

```toml
image = "0.25"
base64 = "0.22"
dotenvy = "0.15"
```

**Step 2: 更新 AppState 添加 illustration_lock**

`state.rs` 修改为：

```rust
use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub projects_dir: String,
    pub config_dir: String,
    pub illustration_lock: Mutex<()>,
}

impl AppState {
    /// {projects_dir}/projects/ — where project file directories live
    pub fn projects_base(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.projects_dir).join("projects")
    }

    /// {projects_dir}/templates/ — where knowledge-base, prd-styles, ui-specs live
    pub fn templates_base(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.projects_dir).join("templates")
    }
}
```

**Step 3: 更新 lib.rs 中 AppState 初始化**

在 `lib.rs` 中找到 `AppState { db: ..., projects_dir: ..., config_dir: ... }` 的构造位置，添加 `illustration_lock: Mutex::new(()),`。

**Step 4: 验证编译**

```bash
cd app/src-tauri && cargo check
```

**Step 5: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src-tauri/Cargo.toml app/src-tauri/src/state.rs app/src-tauri/src/lib.rs
git commit -m "feat(backend): add image/base64/dotenvy deps and illustration_lock to AppState"
```

---

### Task 2: 创建 illustration.rs — 数据结构 + 配置命令

**Files:**
- Create: `app/src-tauri/src/commands/illustration.rs`
- Modify: `app/src-tauri/src/commands/mod.rs:9` (添加模块声明)

**Step 1: 在 mod.rs 添加模块声明**

在 `pub mod tools;` 之后添加：

```rust
pub mod illustration;
```

**Step 2: 创建 illustration.rs 基础结构**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::state::AppState;

// ── Data Structures ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateIllustrationArgs {
    pub prompt: String,
    pub style_preset: Option<String>,
    pub layout: Option<String>,
    pub size: Option<String>,
    pub project_dir: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationResult {
    pub file_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationEntry {
    pub file_path: String,
    pub thumb_path: String,
    pub file_name: String,
    pub prompt: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIllustrationsArgs {
    pub project_dir: Option<String>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationConfigState {
    pub provider: String,
    pub model: String,
    pub api_key_masked: Option<String>,
    pub api_key_source: String, // "env" | "env_file" | "config" | "none"
    pub default_size: String,
    pub available_providers: Vec<ProviderDef>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDef {
    pub id: String,
    pub name: String,
    pub models: Vec<ModelDef>,
    pub sizes: Vec<String>,
    pub env_key_name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelDef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveIllustrationConfigArgs {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub default_size: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestKeyResult {
    pub valid: bool,
    pub message: String,
    pub cost_warning: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IllustrationMeta {
    version: u32,
    prompt: String,
    style: String,
    layout: String,
    provider: String,
    model: String,
    size: String,
    created_at: String,
}

// ── Provider Registry ────────────────────────────────────────────

fn get_providers() -> Vec<ProviderDef> {
    vec![ProviderDef {
        id: "seedream".into(),
        name: "Seedream (火山引擎)".into(),
        models: vec![ModelDef {
            id: "doubao-seedream-4-5-251128".into(),
            name: "Seedream 4.5".into(),
        }],
        sizes: vec![
            "2560x1440".into(),
            "1920x1080".into(),
            "1440x900".into(),
            "1024x1024".into(),
        ],
        env_key_name: "ARK_API_KEY".into(),
    }]
}

// ── API Key Resolution ───────────────────────────────────────────

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "****".into()
    } else {
        format!("{}****{}", &key[..4], &key[key.len() - 4..])
    }
}

fn load_api_key(provider: &ProviderDef, config_dir: &str) -> (Option<String>, String) {
    // Priority 1: environment variable
    if let Ok(val) = std::env::var(&provider.env_key_name) {
        if !val.is_empty() {
            return (Some(val), "env".into());
        }
    }

    // Priority 2: ~/.baoyu-skills/.env
    let env_file = dirs::home_dir()
        .map(|h| h.join(".baoyu-skills/.env"))
        .unwrap_or_default();
    if env_file.exists() {
        if let Ok(iter) = dotenvy::from_path_iter(&env_file) {
            for item in iter.flatten() {
                if item.0 == provider.env_key_name {
                    return (Some(item.1), "env_file".into());
                }
            }
        }
    }

    // Priority 3: config.json
    let config_path = Path::new(config_dir).join("config.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(key) = json.get("illustrationApiKey").and_then(|v| v.as_str()) {
                    if !key.is_empty() {
                        return (Some(key.to_string()), "config".into());
                    }
                }
            }
        }
    }

    (None, "none".into())
}

// ── Config Commands ──────────────────────────────────────────────

#[tauri::command]
pub fn get_illustration_config(
    state: tauri::State<'_, AppState>,
) -> IllustrationConfigState {
    let providers = get_providers();
    // Load saved provider preference or default to seedream
    let config_path = Path::new(&state.config_dir).join("config.json");
    let (saved_provider, saved_model, saved_size) = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
        (
            json.get("illustrationProvider").and_then(|v| v.as_str()).unwrap_or("seedream").to_string(),
            json.get("illustrationModel").and_then(|v| v.as_str()).unwrap_or("doubao-seedream-4-5-251128").to_string(),
            json.get("illustrationSize").and_then(|v| v.as_str()).unwrap_or("2560x1440").to_string(),
        )
    } else {
        ("seedream".into(), "doubao-seedream-4-5-251128".into(), "2560x1440".into())
    };

    let provider_def = providers.iter().find(|p| p.id == saved_provider).cloned()
        .unwrap_or_else(|| providers[0].clone());
    let (api_key, source) = load_api_key(&provider_def, &state.config_dir);

    IllustrationConfigState {
        provider: saved_provider,
        model: saved_model,
        api_key_masked: api_key.as_deref().map(mask_key),
        api_key_source: source,
        default_size: saved_size,
        available_providers: providers,
    }
}

#[tauri::command]
pub fn save_illustration_config(
    state: tauri::State<'_, AppState>,
    args: SaveIllustrationConfigArgs,
) -> Result<(), String> {
    let config_path = Path::new(&state.config_dir).join("config.json");
    let mut json: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::json!({})
    };

    let obj = json.as_object_mut().ok_or("Invalid config")?;
    obj.insert("illustrationProvider".into(), serde_json::json!(args.provider));
    obj.insert("illustrationModel".into(), serde_json::json!(args.model));
    obj.insert("illustrationSize".into(), serde_json::json!(args.default_size));
    if let Some(key) = args.api_key {
        obj.insert("illustrationApiKey".into(), serde_json::json!(key));
    }

    fs::create_dir_all(&state.config_dir).map_err(|e| e.to_string())?;
    let tmp = config_path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &config_path).map_err(|e| e.to_string())?;
    Ok(())
}
```

**Step 3: 验证编译**

```bash
cd app/src-tauri && cargo check
```

**Step 4: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src-tauri/src/commands/illustration.rs app/src-tauri/src/commands/mod.rs
git commit -m "feat(backend): illustration.rs — data structures, provider registry, config commands"
```

---

### Task 3: generate_illustration 命令

**Files:**
- Modify: `app/src-tauri/src/commands/illustration.rs` (追加函数)

**Step 1: 在 illustration.rs 末尾追加生成命令**

```rust
// ── Prompt Building ──────────────────────────────────────────────

fn build_prompt(user_prompt: &str, style: &str, layout: &str) -> String {
    // Check if it looks like Mermaid code
    let first_line = user_prompt.lines().next().unwrap_or("").trim();
    let is_mermaid = ["graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram"]
        .iter()
        .any(|k| first_line.starts_with(k));

    if is_mermaid {
        format!(
            "专业产品流程信息图，扁平矢量{}风格，纯白色背景(#FFFFFF)，蓝色系配色(主色#1D4ED8)。\
            中文标注，清晰可读，简洁专业，适合嵌入PRD文档。充足留白，节点间用带箭头连接线。\
            布局类型：{}。\n\n流程内容（基于以下 Mermaid 代码转化为可视化信息图）：\n{}",
            style, layout, user_prompt
        )
    } else {
        format!(
            "专业产品信息图，扁平矢量{}风格，纯白色背景(#FFFFFF)，蓝色系配色(主色#1D4ED8)。\
            中文标注，清晰可读，简洁专业，适合嵌入PRD文档。\n\n{}",
            style, user_prompt
        )
    }
}

fn slugify(text: &str) -> String {
    let chars: String = text.chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-')
        .collect();
    let words: Vec<&str> = chars.split_whitespace().take(3).collect();
    if words.is_empty() {
        "illustration".into()
    } else {
        words.join("-").to_lowercase()
    }
}

// ── Generate Command ─────────────────────────────────────────────

#[tauri::command]
pub async fn generate_illustration(
    state: tauri::State<'_, AppState>,
    args: GenerateIllustrationArgs,
) -> Result<IllustrationResult, String> {
    let providers = get_providers();
    // Load current config
    let config_path = Path::new(&state.config_dir).join("config.json");
    let (saved_provider_id, saved_model, saved_size) = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
        (
            json.get("illustrationProvider").and_then(|v| v.as_str()).unwrap_or("seedream").to_string(),
            json.get("illustrationModel").and_then(|v| v.as_str()).unwrap_or("doubao-seedream-4-5-251128").to_string(),
            json.get("illustrationSize").and_then(|v| v.as_str()).unwrap_or("2560x1440").to_string(),
        )
    } else {
        ("seedream".into(), "doubao-seedream-4-5-251128".into(), "2560x1440".into())
    };

    let provider = providers.iter().find(|p| p.id == saved_provider_id)
        .ok_or("未找到图片生成服务商配置")?;
    let (api_key, _) = load_api_key(provider, &state.config_dir);
    let api_key = api_key.ok_or("未配置 API Key，请在设置中配置")?;

    let size = args.size.unwrap_or(saved_size);
    let style = args.style_preset.unwrap_or_else(|| "corporate-memphis".into());
    let layout = args.layout.unwrap_or_else(|| "linear-progression".into());
    let prompt = build_prompt(&args.prompt, &style, &layout);

    // Only Seedream implemented for now
    if saved_provider_id != "seedream" {
        return Err("当前仅支持 Seedream 服务商".into());
    }

    // Call Seedream API
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {}", e))?;

    let body = serde_json::json!({
        "model": saved_model,
        "prompt": prompt,
        "size": size,
        "response_format": "b64_json"
    });

    let resp = client
        .post("https://ark.cn-beijing.volces.com/api/v3/images/generations")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "生成超时（90秒），请稍后重试".to_string()
            } else if e.is_connect() {
                "网络不可达，请检查网络连接".to_string()
            } else {
                format!("API 请求失败: {}", e)
            }
        })?;

    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(match status.as_u16() {
            401 => "API Key 无效或已过期".into(),
            429 => "API 调用频率超限，请稍后重试".into(),
            402 => "API 余额不足，请检查账户".into(),
            _ => format!("API 返回错误 ({}): {}", status, &err_text[..err_text.len().min(200)]),
        });
    }

    // Check content-length
    if let Some(cl) = resp.content_length() {
        if cl > 50 * 1024 * 1024 {
            return Err("API 响应体过大（超过 50MB）".into());
        }
    }

    let result: serde_json::Value = resp.json().await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;
    let b64_data = result["data"][0]["b64_json"]
        .as_str()
        .ok_or("API 响应中未找到图片数据")?;

    // Decode base64
    use base64::Engine;
    let img_bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    // Determine save directory and file name
    let (save_dir, slug) = if let Some(ref proj_dir) = args.project_dir {
        (PathBuf::from(proj_dir).join("11-illustrations"), slugify(&args.prompt))
    } else {
        let global_dir = PathBuf::from(&state.config_dir).join("illustrations");
        let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        (global_dir, format!("{}-{}", ts, slugify(&args.prompt)))
    };
    fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;

    // File numbering with lock
    let file_name = if args.project_dir.is_some() {
        let _lock = state.illustration_lock.lock().map_err(|e| e.to_string())?;
        let max_num: u32 = fs::read_dir(&save_dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        if name.ends_with(".png") && !name.contains(".thumb.") && !name.contains(".meta.") {
                            name.split('-').next()?.parse::<u32>().ok()
                        } else {
                            None
                        }
                    })
                    .max()
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        format!("{:02}-{}", max_num + 1, slug)
    } else {
        slug.clone()
    };

    let png_path = save_dir.join(format!("{}.png", file_name));
    fs::write(&png_path, &img_bytes).map_err(|e| format!("保存图片失败: {}", e))?;

    // Generate thumbnail (256x256)
    let thumb_path = save_dir.join(format!("{}.thumb.png", file_name));
    if let Ok(img) = image::load_from_memory(&img_bytes) {
        let thumb = img.thumbnail(256, 256);
        let _ = thumb.save(&thumb_path);
    }

    // Write .meta.json
    let meta = IllustrationMeta {
        version: 1,
        prompt: args.prompt,
        style,
        layout,
        provider: saved_provider_id,
        model: saved_model,
        size,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let meta_path = save_dir.join(format!("{}.meta.json", file_name));
    let _ = fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap_or_default());

    let metadata = fs::metadata(&png_path).map_err(|e| e.to_string())?;
    // Parse image dimensions
    let (w, h) = image::image_dimensions(&png_path).unwrap_or((0, 0));

    Ok(IllustrationResult {
        file_path: png_path.to_string_lossy().to_string(),
        thumb_path: thumb_path.to_string_lossy().to_string(),
        width: w,
        height: h,
        size_bytes: metadata.len(),
    })
}
```

**Step 2: 验证编译**

```bash
cd app/src-tauri && cargo check
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src-tauri/src/commands/illustration.rs
git commit -m "feat(backend): generate_illustration command — Seedream API, thumbnail, meta"
```

---

### Task 4: list_illustrations + read_local_image + test_key

**Files:**
- Modify: `app/src-tauri/src/commands/illustration.rs` (追加)

**Step 1: 追加 list/read/test 命令**

```rust
// ── List Command ─────────────────────────────────────────────────

#[tauri::command]
pub fn list_illustrations(
    state: tauri::State<'_, AppState>,
    args: ListIllustrationsArgs,
) -> Result<Vec<IllustrationEntry>, String> {
    let dir = if let Some(ref proj_dir) = args.project_dir {
        PathBuf::from(proj_dir).join("11-illustrations")
    } else {
        PathBuf::from(&state.config_dir).join("illustrations")
    };

    if !dir.exists() {
        return Ok(vec![]);
    }

    let offset = args.offset.unwrap_or(0);
    let limit = args.limit.unwrap_or(50).min(100);

    let mut entries: Vec<IllustrationEntry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".png") && !name.contains(".thumb.")
        })
        .filter_map(|e| {
            let path = e.path();
            let file_name = e.file_name().to_string_lossy().to_string();
            let stem = file_name.trim_end_matches(".png");
            let meta_path = dir.join(format!("{}.meta.json", stem));
            let thumb_path = dir.join(format!("{}.thumb.png", stem));

            let (prompt, created_at) = if meta_path.exists() {
                let content = fs::read_to_string(&meta_path).unwrap_or_default();
                let meta: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
                (
                    meta.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    meta.get("createdAt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                )
            } else {
                // Degraded: use file modified time
                let modified = e.metadata().ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        dt.to_rfc3339()
                    })
                    .unwrap_or_default();
                (String::new(), modified)
            };

            let size_bytes = e.metadata().ok().map(|m| m.len()).unwrap_or(0);

            Some(IllustrationEntry {
                file_path: path.to_string_lossy().to_string(),
                thumb_path: thumb_path.to_string_lossy().to_string(),
                file_name,
                prompt,
                created_at,
                size_bytes,
            })
        })
        .collect();

    // Sort by created_at descending
    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Apply pagination
    let paginated: Vec<IllustrationEntry> = entries.into_iter().skip(offset).take(limit).collect();
    Ok(paginated)
}

// ── Read Local Image ─────────────────────────────────────────────

const ALLOWED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "svg"];
const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024; // 20MB

#[tauri::command]
pub fn read_local_image(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    // Security: must be under $HOME
    let home = dirs::home_dir().ok_or("无法确定主目录")?;
    let canonical = file_path.canonicalize().map_err(|_| "文件路径无效")?;
    if !canonical.starts_with(&home) {
        return Err("只能读取主目录下的图片文件".into());
    }

    // Security: no ".." in path
    if path.contains("..") {
        return Err("路径不允许包含 ..".into());
    }

    // Security: check extension
    let ext = file_path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持的图片格式: .{}", ext));
    }

    // Security: check file size
    let metadata = fs::metadata(&canonical).map_err(|_| "图片文件不存在")?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err("图片文件过大（超过 20MB）".into());
    }

    // Return the path as-is — frontend will use convertFileSrc()
    Ok(canonical.to_string_lossy().to_string())
}

// ── Test Key ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_illustration_key(
    state: tauri::State<'_, AppState>,
    api_key: Option<String>,
) -> Result<TestKeyResult, String> {
    let providers = get_providers();
    let provider = &providers[0]; // Seedream

    let key = if let Some(k) = api_key {
        k
    } else {
        let (k, _) = load_api_key(provider, &state.config_dir);
        k.ok_or("未配置 API Key")?
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Send minimal request — empty body, just check auth
    let resp = client
        .post("https://ark.cn-beijing.volces.com/api/v3/images/generations")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", key))
        .body("{}")
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = r.status().as_u16();
            if status == 401 {
                Ok(TestKeyResult {
                    valid: false,
                    message: "API Key 无效或已过期".into(),
                    cost_warning: false,
                })
            } else {
                // 400 = key valid but request body invalid (expected)
                Ok(TestKeyResult {
                    valid: true,
                    message: "API Key 有效".into(),
                    cost_warning: false,
                })
            }
        }
        Err(e) => {
            if e.is_timeout() {
                Ok(TestKeyResult {
                    valid: false,
                    message: "连接超时（15秒）".into(),
                    cost_warning: false,
                })
            } else {
                Ok(TestKeyResult {
                    valid: false,
                    message: format!("网络错误: {}", e),
                    cost_warning: false,
                })
            }
        }
    }
}

// ── Delete Illustration ──────────────────────────────────────────

#[tauri::command]
pub fn delete_illustration(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // Same security checks as read_local_image
    let home = dirs::home_dir().ok_or("无法确定主目录")?;
    let canonical = file_path.canonicalize().map_err(|_| "文件不存在")?;
    if !canonical.starts_with(&home) || path.contains("..") {
        return Err("路径不合法".into());
    }

    let stem = canonical.file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无法解析文件名")?;
    let parent = canonical.parent().ok_or("无法确定父目录")?;

    // Delete main file + thumb + meta
    let _ = fs::remove_file(&canonical);
    let _ = fs::remove_file(parent.join(format!("{}.thumb.png", stem)));
    let _ = fs::remove_file(parent.join(format!("{}.meta.json", stem)));
    Ok(())
}
```

**Step 2: 验证编译**

```bash
cd app/src-tauri && cargo check
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src-tauri/src/commands/illustration.rs
git commit -m "feat(backend): list_illustrations, read_local_image, test_key, delete commands"
```

---

### Task 5: 注册所有命令到 lib.rs

**Files:**
- Modify: `app/src-tauri/src/lib.rs:250` (invoke_handler 末尾)

**Step 1: 在 `commands::instincts::delete_instinct,` 之后添加**

```rust
            commands::illustration::get_illustration_config,
            commands::illustration::save_illustration_config,
            commands::illustration::generate_illustration,
            commands::illustration::list_illustrations,
            commands::illustration::read_local_image,
            commands::illustration::test_illustration_key,
            commands::illustration::delete_illustration,
```

**Step 2: 验证编译**

```bash
cd app/src-tauri && cargo check
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src-tauri/src/lib.rs
git commit -m "feat(backend): register illustration commands in invoke_handler"
```

---

## Phase 2: 前端类型和 Hook

### Task 6: tauri-api.ts 添加类型和 API 方法

**Files:**
- Modify: `app/src/lib/tauri-api.ts`

**Step 1: 在类型定义区（InstinctEntry 接口附近）添加**

```typescript
// ── Illustration ─────────────────────────────────────────────────

export interface GenerateIllustrationArgs {
  prompt: string
  stylePreset?: string
  layout?: string
  size?: string
  projectDir?: string
}

export interface IllustrationResult {
  filePath: string
  thumbPath: string
  width: number
  height: number
  sizeBytes: number
}

export interface IllustrationEntry {
  filePath: string
  thumbPath: string
  fileName: string
  prompt: string
  createdAt: string
  sizeBytes: number
}

export interface IllustrationConfigState {
  provider: string
  model: string
  apiKeyMasked: string | null
  apiKeySource: "env" | "env_file" | "config" | "none"
  defaultSize: string
  availableProviders: ProviderDef[]
}

export interface ProviderDef {
  id: string
  name: string
  models: { id: string; name: string }[]
  sizes: string[]
  envKeyName: string
}

export interface TestKeyResult {
  valid: boolean
  message: string
  costWarning: boolean
}
```

**Step 2: 在 api 对象末尾（闭合大括号前）添加**

```typescript
  // ── Illustration ───────────────────────────────────────────────
  generateIllustration: (args: GenerateIllustrationArgs) =>
    safeInvoke<IllustrationResult>("generate_illustration", { args }),
  listIllustrations: (args: { projectDir?: string; offset?: number; limit?: number }) =>
    safeInvoke<IllustrationEntry[]>("list_illustrations", { args }),
  readLocalImage: (path: string) =>
    safeInvoke<string>("read_local_image", { path }),
  getIllustrationConfig: () =>
    safeInvoke<IllustrationConfigState>("get_illustration_config"),
  saveIllustrationConfig: (args: { provider: string; model: string; apiKey?: string; defaultSize: string }) =>
    safeInvoke<void>("save_illustration_config", { args }),
  testIllustrationKey: (apiKey?: string) =>
    safeInvoke<TestKeyResult>("test_illustration_key", { apiKey: apiKey ?? null }),
  deleteIllustration: (path: string) =>
    safeInvoke<void>("delete_illustration", { path }),
```

**Step 3: 验证编译**

```bash
cd app && npx tsc --noEmit
```

**Step 4: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/lib/tauri-api.ts
git commit -m "feat(frontend): add illustration types and API methods to tauri-api.ts"
```

---

### Task 7: useIllustration hook

**Files:**
- Create: `app/src/hooks/use-illustration.ts`

**Step 1: 创建 hook 文件**

```typescript
import { useState, useCallback, useRef } from "react"
import { api, type GenerateIllustrationArgs, type IllustrationResult } from "@/lib/tauri-api"

export function useIllustration() {
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<IllustrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const generate = useCallback(async (args: GenerateIllustrationArgs) => {
    setGenerating(true)
    setResult(null)
    setError(null)
    cancelledRef.current = false

    try {
      const res = await api.generateIllustration(args)
      if (cancelledRef.current) return
      setResult(res)
    } catch (err) {
      if (cancelledRef.current) return
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err))
    } finally {
      if (!cancelledRef.current) {
        setGenerating(false)
      }
    }
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setGenerating(false)
  }, [])

  const reset = useCallback(() => {
    cancelledRef.current = true
    setGenerating(false)
    setResult(null)
    setError(null)
  }, [])

  return { generating, result, error, generate, cancel, reset }
}
```

**Step 2: 验证编译**

```bash
cd app && npx tsc --noEmit
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/hooks/use-illustration.ts
git commit -m "feat(frontend): add useIllustration hook"
```

---

## Phase 3: 工具页

### Task 8: Illustration 工具页基础骨架 + 路由 + 侧边栏

**Files:**
- Create: `app/src/pages/tools/Illustration.tsx`
- Modify: `app/src/router.tsx:21,45`
- Modify: `app/src/components/layout/Sidebar.tsx:6,83`

**Step 1: 创建工具页骨架**

创建 `app/src/pages/tools/Illustration.tsx`，包含：
- 页面标题"AI 插图工具" + 副标题
- SegmentedControl 输入模式切换（Mermaid / 自然语言）
- textarea 输入区
- "生成插图"按钮
- 结果区（generating / success / error 三态）
- 历史画廊骨架（先用空状态占位）

参考 `ToolDataPage` 或 `ToolWeeklyPage` 的页面布局模式。使用 `phase-shell` 包裹，`project-selector` 可选绑定项目。

**Step 2: 在 router.tsx 添加路由**

在 `import { ToolDesignSpecPage }` 之后添加：
```typescript
import { ToolIllustrationPage } from "./pages/tools/Illustration"
```

在 `{ path: "/tools/design-spec" ...}` 之后添加：
```typescript
      { path: "/tools/illustration",   element: <ToolIllustrationPage /> },
```

**Step 3: 在 Sidebar.tsx 添加导航链接**

在 lucide-react 导入中添加 `Sparkles`。

在 `TOOLS_RESOURCE` 数组（第 85-89 行）末尾添加：
```typescript
  { path: "/tools/illustration", label: "AI 插图",   icon: Sparkles },
```

**Step 4: 验证构建**

```bash
cd app && npm run build
```

**Step 5: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/pages/tools/Illustration.tsx app/src/router.tsx app/src/components/layout/Sidebar.tsx
git commit -m "feat(frontend): add Illustration tools page shell, route, sidebar link"
```

---

### Task 9: 风格推荐面板 + Mermaid 检测

**Files:**
- Modify: `app/src/pages/tools/Illustration.tsx` (扩展输入区)

**Step 1: 在页面组件中添加前端 Mermaid 检测和风格推荐逻辑**

在 Illustration.tsx 中实现：
- `detectMermaidType(code)` 函数（前端正则）
- `STYLE_RECOMMENDATIONS` 映射表
- 风格推荐面板组件：默认折叠，显示推荐 Badge + "调整风格"链接
- 展开后：`role="radiogroup"` 卡片，支持方向键导航
- 末尾"自定义"选项展开文本输入框
- Mermaid 输入变化时自动更新推荐

参考设计文档 Section 2 的交互流程和 ARIA 要求。

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/pages/tools/Illustration.tsx
git commit -m "feat(frontend): style recommendation panel with Mermaid detection"
```

---

### Task 10: 生成流程 + 结果展示 + 边界状态

**Files:**
- Modify: `app/src/pages/tools/Illustration.tsx`

**Step 1: 集成 useIllustration hook 完成生成流程**

- 点击"生成"调用 `generate(args)`，按钮变为"取消"
- 生成中显示进度文案（"AI 绘制中..." → 30s 后"生成时间较长..." → 60s 后显示取消按钮）
- 成功：展示图片（`convertFileSrc(result.filePath)`）+ 文件路径 + "复制引用"按钮
- 失败：error 卡片（红色左侧条 + 错误原因 + "重试"按钮）
- API Key 未配置：顶部 warning 横幅 + 跳转 Settings 链接
- 使用 `useToast` 反馈复制成功

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/pages/tools/Illustration.tsx
git commit -m "feat(frontend): illustration generation flow, result display, error states"
```

---

### Task 11: Lightbox 组件

**Files:**
- Create: `app/src/components/lightbox.tsx`

**Step 1: 创建 Lightbox 组件**

复用 `SensitiveScanDialog` 的 Dialog shell 模式：
- `rgba(0,0,0,0.3)` + `backdrop-blur(4px)` 遮罩
- `dialogIn` 进入动画
- 关闭方式：点击遮罩 / 右上角关闭按钮 / Escape
- 居中 `<img>`（`max-width: 90vw; max-height: 85vh; object-fit: contain`）
- 底部信息栏：文件名 / 尺寸 / 创建时间（`--text-secondary` 13px）
- 加载中显示 Skeleton

```typescript
interface LightboxProps {
  open: boolean
  src: string         // convertFileSrc URL
  alt?: string
  fileName?: string
  dimensions?: string // "2560×1440"
  createdAt?: string
  onClose: () => void
}
```

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/components/lightbox.tsx
git commit -m "feat(frontend): add Lightbox component for image preview"
```

---

### Task 12: 历史画廊

**Files:**
- Modify: `app/src/pages/tools/Illustration.tsx` (替换空状态占位)

**Step 1: 实现历史画廊**

- 调 `api.listIllustrations({ projectDir })` 获取列表
- 3 列 CSS Grid，缩略图用 `convertFileSrc(entry.thumbPath)` 加载
- `IntersectionObserver` 懒加载（参考 `MermaidRenderer` 的 `useLazyRender`）
- 每张 hover 右上角操作按钮（删除、复制引用路径）
- 键盘：Tab 聚焦、Enter 放大（调用 Lightbox）、Delete 删除
- 右键菜单复用 `context-menu`：复制引用路径 / 在 Finder 中显示 / 删除
- 空状态：居中图标 + 引导文案 + `fadeInUp`
- 超过 20 张时顶部显示筛选条

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/pages/tools/Illustration.tsx
git commit -m "feat(frontend): illustration history gallery with thumbnails and Lightbox"
```

---

## Phase 4: PRD 导出集成

### Task 13: MermaidRenderDialog 组件

**Files:**
- Create: `app/src/components/mermaid-render-dialog.tsx`

**Step 1: 创建 Dialog 组件**

参考 `SensitiveScanDialog` 的 Dialog shell 模式，实现：

```typescript
interface MermaidBlock {
  index: number
  lineNumber: number
  code: string
  chartType: string
  recommendedLayout: string
  recommendedStyle: string
}

interface MermaidExportChoices {
  renderModes: Record<number, "ai" | "local" | "skip">
  aiStyles: Record<number, { layout: string; style: string }>
}

interface MermaidRenderDialogProps {
  open: boolean
  blocks: MermaidBlock[]
  onConfirm: (choices: MermaidExportChoices) => void
  onCancel: () => void
}
```

布局：
- 顶部"默认渲染方式"下拉（全部应用）
- 每个代码块一行：类型 + 行号 + 三选项
- 选 AI 时展开风格推荐（和工具页一致）
- 底部费用提示 + 取消/导出按钮

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/components/mermaid-render-dialog.tsx
git commit -m "feat(frontend): add MermaidRenderDialog for PRD export integration"
```

---

### Task 14: 集成到 Prd.tsx 导出流程

**Files:**
- Modify: `app/src/pages/project/Prd.tsx:460-516`

**Step 1: 添加 Mermaid 检测和两步 Dialog 逻辑**

在 Prd.tsx 中：

1. 导入 `MermaidRenderDialog` 和 `extractMermaidBlocks`（从共享工具函数）
2. 添加状态：`mermaidBlocks`, `mermaidDialogOpen`, `mermaidChoices`
3. 修改 `withSensitiveScan` → `withExportPreflight`：

```typescript
const withExportPreflight = useCallback(
  (exportFn: (mermaidChoices?: MermaidExportChoices) => Promise<void>) => {
    return async () => {
      setExporting(true)
      // Parallel preflight with Promise.allSettled + 10s timeout
      const [sensitiveResult, mermaidResult] = await Promise.allSettled([
        Promise.race([
          api.scanSensitive(projectId),
          new Promise<never>((_, reject) => setTimeout(() => reject("timeout"), 10000)),
        ]),
        Promise.resolve(extractMermaidBlocks(displayMarkdown || "")),
      ])

      const matches = sensitiveResult.status === "fulfilled" ? sensitiveResult.value : []
      const blocks = mermaidResult.status === "fulfilled" ? mermaidResult.value : []
      setExporting(false)

      // Step 1: Sensitive scan (existing dialog, unchanged)
      if (matches.length > 0) {
        setSensitiveMatches(matches)
        setPendingExportAction(() => async () => {
          // Step 2: Mermaid dialog (after sensitive is resolved)
          if (blocks.length > 0) {
            setMermaidBlocks(blocks)
            setPendingExportAction(() => exportFn)
            setMermaidDialogOpen(true)
          } else {
            await exportFn()
          }
        })
        setSensitiveDialogOpen(true)
      } else if (blocks.length > 0) {
        // No sensitive, but has Mermaid
        setMermaidBlocks(blocks)
        setPendingExportAction(() => exportFn)
        setMermaidDialogOpen(true)
      } else {
        // Neither — direct export
        await exportFn()
      }
    }
  },
  [projectId, displayMarkdown],
)
```

4. 添加 MermaidRenderDialog 回调
5. 在 JSX 中渲染 `<MermaidRenderDialog />`

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/pages/project/Prd.tsx
git commit -m "feat(frontend): integrate MermaidRenderDialog into PRD export preflight"
```

---

## Phase 5: Settings + 图片预览

### Task 15: Settings 插图配置 Card

**Files:**
- Modify: `app/src/pages/settings/SettingsApi.tsx`

**Step 1: 在 SettingsApi 页面底部添加插图配置 Card**

参考现有 Card 模式，实现：
- 服务商下拉（仅显示 `implemented` 的 provider）
- 模型下拉（根据服务商联动）
- API Key 输入框（readonly when source=env/env_file，显示来源 Badge）
- 默认尺寸下拉
- 测试连接按钮（loading / success / error 反馈）
- 防抖 500ms 自动保存 + "已保存"提示

使用 `api.getIllustrationConfig()` 加载、`api.saveIllustrationConfig()` 保存、`api.testIllustrationKey()` 测试。

**Step 2: 验证构建**

```bash
cd app && npm run build
```

**Step 3: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/pages/settings/SettingsApi.tsx
git commit -m "feat(frontend): add illustration config card to Settings API page"
```

---

### Task 16: LocalImage 组件 + PrdViewer 集成

**Files:**
- Create: `app/src/components/local-image.tsx`
- Modify: `app/src/components/prd-viewer.tsx`

**Step 1: 创建 LocalImage 组件**

```typescript
import { useState, useEffect } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { api } from "@/lib/tauri-api"

interface LocalImageProps {
  src: string
  alt?: string
  className?: string
  onClick?: () => void
}

export function LocalImage({ src, alt, className, onClick }: LocalImageProps) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading")
  const [assetUrl, setAssetUrl] = useState<string | null>(null)

  useEffect(() => {
    setState("loading")
    api.readLocalImage(src)
      .then((validatedPath) => {
        setAssetUrl(convertFileSrc(validatedPath))
        setState("loaded")
      })
      .catch(() => setState("error"))
  }, [src])

  if (state === "loading") {
    return <div className={cn("animate-pulse bg-[var(--secondary)] rounded-lg h-48", className)} />
  }

  if (state === "error") {
    return (
      <div className={cn("border border-dashed border-[var(--border)] rounded-lg bg-[var(--secondary)] p-6 text-center", className)}>
        {/* ImageOff icon + "图片未找到" + path */}
        <p className="text-[var(--text-tertiary)] text-xs mt-1 break-all">{src}</p>
      </div>
    )
  }

  return (
    <img
      src={assetUrl!}
      alt={alt || ""}
      className={cn("rounded-lg cursor-pointer", className)}
      onClick={onClick}
      loading="lazy"
    />
  )
}
```

**Step 2: 在 PrdViewer 中注册自定义 image renderer**

在 `prd-viewer.tsx` 的 Markdown 渲染管线中，拦截 `<img>` 标签：当 `src` 非 `http(s)://` 且包含 `11-illustrations/` 时，替换为 `LocalImage` 组件。点击时打开 `Lightbox`。

**Step 3: 验证构建**

```bash
cd app && npm run build
```

**Step 4: 提交**

```bash
cd <AI_PM_ROOT>
git add app/src/components/local-image.tsx app/src/components/prd-viewer.tsx
git commit -m "feat(frontend): LocalImage component + PrdViewer inline preview integration"
```

---

## 任务依赖

```
Phase 1 (Rust):
  Task 1 (deps + state) → Task 2 (structs + config) → Task 3 (generate) → Task 4 (list/read/test) → Task 5 (register)

Phase 2 (types + hook):
  Task 5 → Task 6 (tauri-api types) → Task 7 (useIllustration)

Phase 3 (tools page):
  Task 7 → Task 8 (page shell) → Task 9 (style panel) → Task 10 (generate flow) → Task 11 (Lightbox) → Task 12 (gallery)

Phase 4 (PRD export):
  Task 11 → Task 13 (MermaidRenderDialog) → Task 14 (Prd.tsx integration)

Phase 5 (Settings + preview):
  Task 6 → Task 15 (Settings card)
  Task 11 → Task 16 (LocalImage + PrdViewer)

并行可能：
  Phase 5 的 Task 15 和 Task 16 可与 Phase 3 后半段并行
```

## 提交策略

每个 Task 单独提交，commit message 格式 `feat(backend|frontend): 简短描述`。全部完成后 bump version。
