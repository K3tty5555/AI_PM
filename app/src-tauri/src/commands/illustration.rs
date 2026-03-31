use base64::Engine;
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
    pub api_key_source: String,
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
pub struct IllustrationMeta {
    pub version: u32,
    pub prompt: String,
    pub style: String,
    pub layout: String,
    pub provider: String,
    pub model: String,
    pub size: String,
    pub created_at: String,
}

// ── Provider Registry ────────────────────────────────────────────

pub fn get_providers() -> Vec<ProviderDef> {
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

pub fn load_api_key(provider: &ProviderDef, config_dir: &str) -> (Option<String>, String) {
    // Priority 1: environment variable
    if let Ok(val) = std::env::var(&provider.env_key_name) {
        if !val.is_empty() {
            return (Some(val), "env".into());
        }
    }

    // Priority 2: ~/.baoyu-skills/.env
    if let Some(home) = dirs::home_dir() {
        let env_file = home.join(".baoyu-skills/.env");
        if env_file.exists() {
            if let Ok(iter) = dotenvy::from_path_iter(&env_file) {
                for item in iter.flatten() {
                    if item.0 == provider.env_key_name {
                        return (Some(item.1), "env_file".into());
                    }
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

// Helper to read saved illustration config from config.json
fn read_saved_config(config_dir: &str) -> (String, String, String) {
    let config_path = Path::new(config_dir).join("config.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                return (
                    json.get("illustrationProvider").and_then(|v| v.as_str()).unwrap_or("seedream").to_string(),
                    json.get("illustrationModel").and_then(|v| v.as_str()).unwrap_or("doubao-seedream-4-5-251128").to_string(),
                    json.get("illustrationSize").and_then(|v| v.as_str()).unwrap_or("2560x1440").to_string(),
                );
            }
        }
    }
    ("seedream".into(), "doubao-seedream-4-5-251128".into(), "2560x1440".into())
}

// ── Config Commands ──────────────────────────────────────────────

#[tauri::command]
pub fn get_illustration_config(
    state: tauri::State<'_, AppState>,
) -> IllustrationConfigState {
    let providers = get_providers();
    let (saved_provider, saved_model, saved_size) = read_saved_config(&state.config_dir);

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

    let obj = json.as_object_mut().ok_or("Invalid config format")?;
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

// ── Prompt Builder ──────────────────────────────────────────────

fn build_prompt(raw: &str, style: &str, layout: &str) -> String {
    let trimmed = raw.trim();
    let first_line = trimmed.lines().next().unwrap_or("");
    let mermaid_prefixes = [
        "graph ", "graph\n", "flowchart ", "flowchart\n",
        "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram",
    ];
    let is_mermaid = mermaid_prefixes.iter().any(|p| first_line.starts_with(p));

    if is_mermaid {
        format!(
            "将以下 Mermaid 图表转换为精美的信息图插画。\n\
             风格：{}，布局：{}。\n\
             要求：保留原图的逻辑关系和层次结构，使用清晰的图标和配色，\
             适合嵌入产品文档。不要包含任何文字水印。\n\n{}",
            style, layout, trimmed
        )
    } else {
        format!(
            "为产品文档生成一张插画。\n\
             主题：{}\n\
             风格：{}，布局：{}。\n\
             要求：专业、简洁、适合嵌入产品文档，不要包含任何文字水印。",
            trimmed, style, layout
        )
    }
}

// ── Slugify ─────────────────────────────────────────────────────

fn slugify(text: &str) -> String {
    let words: Vec<&str> = text
        .split(|c: char| !c.is_alphanumeric() && c != '-')
        .filter(|w| !w.is_empty())
        .take(3)
        .collect();

    if words.is_empty() {
        "illustration".into()
    } else {
        words.join("-").to_lowercase()
    }
}

// ── Generate Command ────────────────────────────────────────────

#[tauri::command]
pub async fn generate_illustration(
    state: tauri::State<'_, AppState>,
    args: GenerateIllustrationArgs,
) -> Result<IllustrationResult, String> {
    // 1. Read saved config
    let (saved_provider, saved_model, saved_size) = read_saved_config(&state.config_dir);
    let size = args.size.unwrap_or(saved_size);
    let style = args.style_preset.unwrap_or_else(|| "专业商务".into());
    let layout = args.layout.unwrap_or_else(|| "横版".into());

    // 2. Resolve provider & API key
    let providers = get_providers();
    let provider_def = providers
        .iter()
        .find(|p| p.id == saved_provider)
        .ok_or_else(|| "当前仅支持 Seedream 服务商".to_string())?;

    if saved_provider != "seedream" {
        return Err("当前仅支持 Seedream 服务商".into());
    }

    let (api_key_opt, _source) = load_api_key(provider_def, &state.config_dir);
    let api_key = api_key_opt.ok_or_else(|| "未配置 API Key，请在设置中配置".to_string())?;

    // 3. Build prompt
    let prompt = build_prompt(&args.prompt, &style, &layout);

    // 4. Call Seedream API
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
                "生成超时（90秒）".to_string()
            } else if e.is_connect() {
                "网络不可达".to_string()
            } else {
                format!("请求失败: {}", e)
            }
        })?;

    // 5. Handle HTTP status errors
    let status = resp.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => "API Key 无效".into(),
            429 => "频率超限".into(),
            402 => "余额不足".into(),
            _ => format!("API 返回错误 ({})", status.as_u16()),
        });
    }

    // 6. Check Content-Length
    if let Some(cl) = resp.content_length() {
        if cl > 50 * 1024 * 1024 {
            return Err("响应体过大（超过 50MB）".into());
        }
    }

    // 7. Parse response & decode base64
    let resp_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("响应解析失败: {}", e))?;

    let b64_data = resp_json["data"][0]["b64_json"]
        .as_str()
        .ok_or_else(|| "API 返回数据格式异常".to_string())?;

    let img_bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    // 8. Determine output directory & file name
    let (out_dir, file_name) = if let Some(ref proj_dir) = args.project_dir {
        let dir = PathBuf::from(proj_dir).join("11-illustrations");
        fs::create_dir_all(&dir).map_err(|e| format!("创建输出目录失败: {}", e))?;

        // Use illustration_lock for sequential numbering within a project
        let _lock = state
            .illustration_lock
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        let mut max_num: u32 = 0;
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                // Match pattern: NNN-slug.png (not thumb)
                if name.ends_with(".png") && !name.contains(".thumb.") {
                    if let Some(num_str) = name.split('-').next() {
                        if let Ok(n) = num_str.parse::<u32>() {
                            if n > max_num {
                                max_num = n;
                            }
                        }
                    }
                }
            }
        }
        let next_num = max_num + 1;
        let slug = slugify(&args.prompt);
        let name = format!("{:03}-{}.png", next_num, slug);
        (dir, name)
    } else {
        let dir = PathBuf::from(&state.config_dir).join("illustrations");
        fs::create_dir_all(&dir).map_err(|e| format!("创建输出目录失败: {}", e))?;

        let ts = chrono::Utc::now().format("%Y%m%d%H%M%S").to_string();
        let slug = slugify(&args.prompt);
        let name = format!("{}-{}.png", ts, slug);
        (dir, name)
    };

    // 9. Write PNG
    let png_path = out_dir.join(&file_name);
    fs::write(&png_path, &img_bytes).map_err(|e| format!("写入图片失败: {}", e))?;

    let size_bytes = img_bytes.len() as u64;

    // 10. Generate 256x256 thumbnail
    let thumb_name = file_name.replace(".png", ".thumb.png");
    let thumb_path = out_dir.join(&thumb_name);
    if let Ok(img) = image::load_from_memory(&img_bytes) {
        let thumb = img.thumbnail(256, 256);
        let _ = thumb.save(&thumb_path);
    }

    // 11. Read actual dimensions
    let (w, h) = image::image_dimensions(&png_path).unwrap_or((0, 0));

    // 12. Write .meta.json
    let meta = IllustrationMeta {
        version: 1,
        prompt: args.prompt,
        style,
        layout,
        provider: saved_provider,
        model: saved_model,
        size,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let meta_name = file_name.replace(".png", ".meta.json");
    let meta_path = out_dir.join(&meta_name);
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| format!("序列化 meta 失败: {}", e))?;
    fs::write(&meta_path, meta_json).map_err(|e| format!("写入 meta 失败: {}", e))?;

    // 13. Return result
    Ok(IllustrationResult {
        file_path: png_path.to_string_lossy().to_string(),
        thumb_path: thumb_path.to_string_lossy().to_string(),
        width: w,
        height: h,
        size_bytes,
    })
}

// ── List Command ────────────────────────────────────────────────

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

    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    let paginated: Vec<IllustrationEntry> = entries.into_iter().skip(offset).take(limit).collect();
    Ok(paginated)
}

// ── Read Local Image Command ────────────────────────────────────

const ALLOWED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "svg"];
const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024;

#[tauri::command]
pub fn read_local_image(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    let home = dirs::home_dir().ok_or("无法确定主目录")?;
    let canonical = file_path.canonicalize().map_err(|_| "图片文件不存在或路径无效")?;
    if !canonical.starts_with(&home) {
        return Err("只能读取主目录下的图片文件".into());
    }
    if path.contains("..") {
        return Err("路径不允许包含 ..".into());
    }

    let ext = file_path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持的图片格式: .{}", ext));
    }

    let metadata = fs::metadata(&canonical).map_err(|_| "图片文件不存在")?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err("图片文件过大（超过 20MB）".into());
    }

    Ok(canonical.to_string_lossy().to_string())
}

// ── Test Key Command ────────────────────────────────────────────

#[tauri::command]
pub async fn test_illustration_key(
    state: tauri::State<'_, AppState>,
    api_key: Option<String>,
) -> Result<TestKeyResult, String> {
    let providers = get_providers();
    let provider = &providers[0];

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

// ── Delete Command ──────────────────────────────────────────────

#[tauri::command]
pub fn delete_illustration(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    let home = dirs::home_dir().ok_or("无法确定主目录")?;
    let canonical = file_path.canonicalize().map_err(|_| "文件不存在")?;
    if !canonical.starts_with(&home) || path.contains("..") {
        return Err("路径不合法".into());
    }

    let stem = canonical.file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无法解析文件名")?;
    let parent = canonical.parent().ok_or("无法确定父目录")?;

    let _ = fs::remove_file(&canonical);
    let _ = fs::remove_file(parent.join(format!("{}.thumb.png", stem)));
    let _ = fs::remove_file(parent.join(format!("{}.meta.json", stem)));
    Ok(())
}

// ── PRD Mermaid 扫描 + 插图嵌入 ─────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MermaidBlock {
    pub index: usize,
    pub code: String,
    pub line_start: usize,
}

/// 扫描 PRD markdown 文件，返回所有 Mermaid 代码块
#[tauri::command]
pub fn scan_prd_mermaid(prd_path: String) -> Result<Vec<MermaidBlock>, String> {
    let path = std::path::Path::new(&prd_path);
    if !path.is_absolute() {
        return Err("PRD 路径必须是绝对路径".to_string());
    }
    if !path.exists() {
        return Err(format!("PRD 文件不存在: {prd_path}"));
    }

    let content = fs::read_to_string(&prd_path)
        .map_err(|e| format!("无法读取 PRD 文件: {e}"))?;

    let mut blocks = Vec::new();
    let mut in_mermaid = false;
    let mut current_code = String::new();
    let mut block_start = 0usize;
    let mut index = 0usize;

    for (line_num, line) in content.lines().enumerate() {
        if !in_mermaid && line.trim() == "```mermaid" {
            in_mermaid = true;
            current_code.clear();
            block_start = line_num;
        } else if in_mermaid && line.trim() == "```" {
            blocks.push(MermaidBlock {
                index,
                code: current_code.trim().to_string(),
                line_start: block_start,
            });
            index += 1;
            in_mermaid = false;
            current_code.clear();
        } else if in_mermaid {
            current_code.push_str(line);
            current_code.push('\n');
        }
    }

    Ok(blocks)
}

/// 在 Mermaid 块后嵌入图片引用。
/// 必须按**倒序**调用（最后一个块先处理），以保持行号正确。
/// image_relative_path 格式必须为 11-illustrations/{name}.png
#[tauri::command]
pub fn embed_illustration_in_prd(
    prd_path: String,
    mermaid_line_start: usize,
    image_relative_path: String,
    alt_text: String,
) -> Result<(), String> {
    use std::io::Write;

    // 安全校验：绝对路径
    let path = std::path::Path::new(&prd_path);
    if !path.is_absolute() {
        return Err("PRD 路径必须是绝对路径".to_string());
    }

    // 安全校验：image_relative_path 格式白名单
    // 只允许 11-illustrations/{lowercase-slug}.png
    if !image_relative_path.starts_with("11-illustrations/")
        || !image_relative_path.ends_with(".png")
        || image_relative_path.contains("..")
        || image_relative_path.matches('/').count() > 1
    {
        return Err(format!("非法图片路径格式: {image_relative_path}"));
    }

    let content = fs::read_to_string(&prd_path)
        .map_err(|e| format!("无法读取 PRD: {e}"))?;

    let lines: Vec<&str> = content.lines().collect();

    // 找到 mermaid_line_start 之后的 ``` 闭合行
    let mut close_line = mermaid_line_start;
    for i in (mermaid_line_start + 1)..lines.len() {
        if lines[i].trim() == "```" {
            close_line = i;
            break;
        }
    }

    let img_ref = format!("![{}]({})", alt_text, image_relative_path);
    let mut new_lines: Vec<String> = lines.iter().map(|l| l.to_string()).collect();
    new_lines.insert(close_line + 1, img_ref);
    new_lines.insert(close_line + 1, String::new()); // 空行

    let new_content = new_lines.join("\n");

    // 原子写入：写 tmp 再 rename
    let tmp_path = path.with_extension("md.tmp");
    {
        let mut f = std::fs::File::create(&tmp_path)
            .map_err(|e| format!("创建临时文件失败: {e}"))?;
        f.write_all(new_content.as_bytes())
            .map_err(|e| format!("写入临时文件失败: {e}"))?;
    }
    std::fs::rename(&tmp_path, &prd_path)
        .map_err(|e| format!("原子替换失败: {e}"))?;

    Ok(())
}
