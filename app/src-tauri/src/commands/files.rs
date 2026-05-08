use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use crate::state::AppState;

/// 校验文件路径在指定基础目录内，防止路径遍历
fn validate_path_within(file_name: &str, base_dir: &str) -> Result<std::path::PathBuf, String> {
    // 1. 拦截绝对路径
    if file_name.starts_with('/') || file_name.starts_with('\\') {
        return Err("文件名不能是绝对路径".to_string());
    }

    let base = std::path::Path::new(base_dir);
    let full_path = base.join(file_name);

    // 2. canonicalize 基础目录
    let canonical_base = std::fs::canonicalize(base)
        .map_err(|e| format!("无法解析基础目录: {e}"))?;

    // 3. 对目标路径 canonicalize（处理不存在的文件/目录）
    let canonical_path = if full_path.exists() {
        std::fs::canonicalize(&full_path)
            .map_err(|e| format!("无法解析文件路径: {e}"))?
    } else {
        // 向上找到第一个已存在的祖先目录
        let mut ancestor = full_path.parent();
        while let Some(a) = ancestor {
            if a.exists() { break; }
            ancestor = a.parent();
        }
        let canonical_ancestor = std::fs::canonicalize(
            ancestor.unwrap_or(base)
        ).map_err(|e| format!("无法解析父目录: {e}"))?;
        let remaining = full_path.strip_prefix(ancestor.unwrap_or(base))
            .unwrap_or(full_path.as_path());
        canonical_ancestor.join(remaining)
    };

    // 4. 验证在基础目录内
    if !canonical_path.starts_with(&canonical_base) {
        return Err("文件路径超出允许范围".to_string());
    }

    Ok(canonical_path)
}

#[tauri::command]
pub fn read_project_file(
    state: State<AppState>,
    project_id: String,
    file_name: String,
) -> Result<Option<String>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ) {
            Ok(dir) => dir,
            Err(_) => return Ok(None),
        }
        // db guard drops here
    };

    let file_path = validate_path_within(&file_name, &output_dir)?;

    match fs::read_to_string(&file_path) {
        Ok(content) if !content.is_empty() => Ok(Some(content)),
        _ => Ok(None),
    }
}

/// 读取二进制文件（图片/视频/字体）返回 base64 + MIME，用于原型 data URI 内联。
/// 供 Prototype.tsx 把 <img src=> / iframe / CSS url() 转成可独立渲染的 data URI。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryFileResult {
    pub mime: String,
    pub base64: String,
    pub size: u64,
}

fn guess_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
pub fn read_project_file_base64(
    state: State<AppState>,
    project_id: String,
    file_name: String,
) -> Result<Option<BinaryFileResult>, String> {
    use base64::Engine;
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ) {
            Ok(dir) => dir,
            Err(_) => return Ok(None),
        }
    };

    let file_path = validate_path_within(&file_name, &output_dir)?;
    if !file_path.exists() || !file_path.is_file() {
        return Ok(None);
    }

    // Cap at 20 MB to avoid loading huge assets into the IPC payload
    const MAX_SIZE: u64 = 20 * 1024 * 1024;
    let metadata = file_path.metadata().map_err(|e| e.to_string())?;
    if metadata.len() > MAX_SIZE {
        return Err(format!(
            "文件过大（{:.1} MB），原型内联限制 20 MB",
            metadata.len() as f64 / 1024.0 / 1024.0
        ));
    }

    let bytes = fs::read(&file_path).map_err(|e| format!("读取失败: {e}"))?;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let mime = guess_mime(&file_path).to_string();
    Ok(Some(BinaryFileResult { mime, base64, size: metadata.len() }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileArgs {
    pub project_id: String,
    pub file_name: String,
    pub content: String,
}

#[tauri::command]
pub fn save_project_file(state: State<AppState>, args: SaveFileArgs) -> Result<(), String> {
    // Fix 1: Drop mutex guard before file I/O
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
        // db guard drops here
    };

    let file_path = validate_path_within(&args.file_name, &output_dir)?;

    // Ensure parent directory exists (for nested paths like 05-prd/05-PRD-v1.0.md)
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, &args.content).map_err(|e| e.to_string())?;

    Ok(())
}

/// 读取任意本地文件（用于 Persona 分析等场景）
/// Only allows reading under the user's home directory for safety.
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    // Reject path traversal attempts
    if path.contains("..") {
        return Err("路径包含非法字符".to_string());
    }
    // Restrict to user's home directory
    let canonical = std::fs::canonicalize(&path).map_err(|e| format!("读取文件失败：{}", e))?;
    if let Some(home) = dirs::home_dir() {
        if !canonical.starts_with(&home) {
            return Err("只允许读取用户主目录下的文件".to_string());
        }
    }
    // Guard against reading huge files (10 MB limit)
    let metadata = std::fs::metadata(&canonical).map_err(|e| format!("读取文件失败：{}", e))?;
    const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10 MB
    if metadata.len() > MAX_SIZE {
        return Err(format!("文件过大（{}MB），最大支持 10MB", metadata.len() / 1024 / 1024));
    }
    std::fs::read_to_string(&canonical).map_err(|e| format!("读取文件失败：{}", e))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextFile {
    /// Filename only, e.g. "ai-pm-interview-2026-03-17.md"
    pub name: String,
    /// First ~200 chars of content for tooltip preview
    pub preview: String,
}

#[tauri::command]
pub fn list_project_context(
    state: State<AppState>,
    project_id: String,
) -> Result<Vec<ContextFile>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ) {
            Ok(dir) => dir,
            Err(_) => return Ok(vec![]),
        }
    };

    let context_dir = Path::new(&output_dir).join("context");
    if !context_dir.exists() {
        return Ok(vec![]);
    }

    let mut files: Vec<ContextFile> = fs::read_dir(&context_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_file() && e.path().extension().and_then(|x| x.to_str()) == Some("md")
        })
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let content = fs::read_to_string(e.path()).unwrap_or_default();
            let preview: String = content.chars().take(200).collect();
            if preview.is_empty() {
                None
            } else {
                Some(ContextFile { name, preview })
            }
        })
        .collect();

    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

/// Export PRD Markdown → DOCX via bundled md2docx.py.
/// Returns the absolute path of the generated .docx file.
#[tauri::command]
pub async fn export_prd_docx(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    recipe: Option<String>,
) -> Result<String, String> {
    // Resolve project output directory
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };

    let prd_path = Path::new(&output_dir).join("05-prd").join("05-PRD-v1.0.md");
    if !prd_path.exists() {
        return Err("PRD 文件不存在，请先完成 PRD 生成".to_string());
    }

    let docx_path = Path::new(&output_dir).join("05-prd").join("05-PRD-v1.0.docx");

    // Bundled script path from app resources
    let skills_root = crate::commands::stream::resolve_skills_root(&app)?;
    let script_path = Path::new(&skills_root)
        .join("ai-pm-prd")
        .join("md2docx.py");

    if !script_path.exists() {
        return Err(format!("导出脚本未找到：{}", script_path.display()));
    }

    // Optional manifest for prototype screenshots
    let manifest_path = Path::new(&output_dir).join("06-prototype").join("manifest.json");

    let mut cmd = tokio::process::Command::new("python3");
    cmd.arg(&script_path)
        .arg(&prd_path)
        .arg(&docx_path);
    if manifest_path.exists() {
        cmd.arg(&manifest_path);
    }
    if let Some(r) = &recipe {
        let recipe_file = state.templates_base()
            .join("presets")
            .join("docx-recipes.json");
        if recipe_file.exists() {
            cmd.arg(format!("--recipe={}", r));
            cmd.arg(format!("--recipe-file={}", recipe_file.display()));
        }
    }

    let output = cmd.output().await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 python3，请安装 Python 3 后重试".to_string()
        } else {
            format!("运行导出脚本失败：{}", e)
        }
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = if stderr.contains("ModuleNotFoundError") || stderr.contains("No module named") {
            "缺少 Python 依赖，请运行：pip3 install python-docx".to_string()
        } else if !stderr.trim().is_empty() {
            format!("导出失败：{}", stderr.trim().chars().take(300).collect::<String>())
        } else {
            let stdout = String::from_utf8_lossy(&output.stdout);
            format!("导出失败：{}", stdout.trim().chars().take(300).collect::<String>())
        };
        return Err(msg);
    }

    if !docx_path.exists() {
        return Err("DOCX 文件生成失败（脚本未产生输出）".to_string());
    }

    Ok(docx_path.to_string_lossy().to_string())
}

/// List PRD version numbers by scanning 05-prd/ directory (legacy: only matches 05-PRD-v{N}.0.md).
/// Kept for backward compatibility — prefer `list_prd_files` for business naming support.
#[tauri::command]
pub fn list_prd_versions(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<u32>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };

    let prd_dir = Path::new(&output_dir).join("05-prd");
    if !prd_dir.exists() {
        return Ok(vec![]);
    }

    let mut versions: Vec<u32> = Vec::new();
    if let Ok(entries) = fs::read_dir(&prd_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            // Match pattern: 05-PRD-v{N}.0.md
            if let Some(rest) = name.strip_prefix("05-PRD-v") {
                if let Some(ver_str) = rest.strip_suffix(".0.md") {
                    if let Ok(ver) = ver_str.parse::<u32>() {
                        versions.push(ver);
                    }
                }
            }
        }
    }
    versions.sort();
    Ok(versions)
}

/// Get the latest PRD version number.
#[tauri::command]
pub fn get_latest_prd_version(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<u32, String> {
    let versions = list_prd_versions(state, project_id)?;
    Ok(versions.last().copied().unwrap_or(1))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdFileEntry {
    /// 文件名（相对 05-prd/）
    pub file: String,
    /// 显示标签：V1.0 / V1.1 / "未版本"
    pub label: String,
    /// 排序键：V1.0=100, V1.1=110, V1.3=130, V2=200, 未识别=0
    pub sort_key: u32,
    /// 是否识别到版本号
    pub recognized: bool,
    /// 父版本 label（来自 _status.json，可空）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    /// 自定义业务标签（来自 _status.json，例如 "V1.1 搜题场景"）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_label: Option<String>,
}

static PRD_VERSION_RE: Lazy<Regex> = Lazy::new(|| {
    // 匹配文件名中的 V/v 后跟数字（可选 .子版本）
    Regex::new(r"[Vv](\d+)(?:\.(\d+))?").expect("PRD_VERSION_RE")
});

/// Extract version label and sort key from a filename.
/// Examples:
///   "05-PRD-v1.0.md"                                   → ("V1.0", 100)
///   "[2026M05上][Agent]V1.1搜题PRD.md"                 → ("V1.1", 110)
///   "[2026M06上][Agent]V1.3 精准教学联动PRD.md"        → ("V1.3", 130)
///   "其他.md"                                          → ("未版本", 0)
fn parse_prd_filename(name: &str) -> (String, u32, bool) {
    if let Some(caps) = PRD_VERSION_RE.captures(name) {
        let major: u32 = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
        let minor: u32 = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
        let label = if minor == 0 {
            format!("V{major}.0")
        } else {
            format!("V{major}.{minor}")
        };
        let sort_key = major * 100 + minor;
        (label, sort_key, true)
    } else {
        ("未版本".to_string(), 0, false)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrototypeVersion {
    /// 相对项目根的目录（含尾斜杠），例：06-prototype/, 06-prototype-v1.3/
    pub dir: String,
    /// 显示标签：默认 / V1.3 / preview
    pub label: String,
    /// 排序键
    pub sort_key: u32,
    /// 是否多文件（含 manifest.json）
    pub has_manifest: bool,
    /// 自定义标签（来自 _status.json）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_label: Option<String>,
}

static PROTOTYPE_DIR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^06-prototype(?:-(.+))?$").expect("PROTOTYPE_DIR_RE"));

/// List prototype version directories (06-prototype, 06-prototype-v1.3, 06-prototype-preview, ...)。
#[tauri::command]
pub fn list_prototype_versions(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<PrototypeVersion>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|_| "项目不存在".to_string())?
    };

    let project_root = Path::new(&output_dir);
    if !project_root.exists() {
        return Ok(vec![]);
    }

    // Read _status.json metadata (T13)
    let status_path = project_root.join("_status.json");
    let status_meta: std::collections::HashMap<String, String> = if status_path.exists() {
        fs::read_to_string(&status_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|json| json.get("prototype_versions").cloned())
            .and_then(|val| val.as_array().cloned())
            .map(|arr| {
                arr.into_iter()
                    .filter_map(|item| {
                        let dir = item.get("dir")?.as_str()?.trim_end_matches('/').to_string();
                        let label = item.get("label")?.as_str()?.to_string();
                        Some((dir, label))
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let mut entries: Vec<PrototypeVersion> = Vec::new();

    if let Ok(read) = fs::read_dir(project_root) {
        for entry in read.filter_map(|e| e.ok()) {
            let ty = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if !ty.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let caps = match PROTOTYPE_DIR_RE.captures(&name) {
                Some(c) => c,
                None => continue,
            };

            let suffix = caps.get(1).map(|m| m.as_str()).unwrap_or("default");
            // Extract version digits from suffix for sorting (e.g., v1.3 → 130)
            let sort_key = if suffix == "default" {
                100
            } else if let Some(vc) = PRD_VERSION_RE.captures(suffix) {
                let major: u32 = vc.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                let minor: u32 = vc.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                major * 100 + minor
            } else {
                0
            };
            let label = if suffix == "default" {
                "默认".to_string()
            } else {
                suffix.to_string()
            };

            // Check for manifest.json
            let manifest_path = entry.path().join("manifest.json");
            let has_manifest = manifest_path.exists();

            // Skip directories with neither manifest nor index.html
            let index_path = entry.path().join("index.html");
            if !has_manifest && !index_path.exists() {
                continue;
            }

            let dir_key = name.clone();
            let custom_label = status_meta.get(&dir_key).cloned();

            entries.push(PrototypeVersion {
                dir: format!("{}/", name),
                label,
                sort_key,
                has_manifest,
                custom_label,
            });
        }
    }

    entries.sort_by(|a, b| a.sort_key.cmp(&b.sort_key).then_with(|| a.dir.cmp(&b.dir)));
    Ok(entries)
}

/// T6: 列出项目 _memory/ 目录下所有 .md 文件
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFile {
    pub name: String,
    pub size: u64,
    pub mtime: String,
}

#[tauri::command]
pub fn list_memory_files(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<MemoryFile>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|_| "项目不存在".to_string())?
    };

    let memory_dir = Path::new(&output_dir).join("_memory");
    if !memory_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<MemoryFile> = Vec::new();
    if let Ok(read) = fs::read_dir(&memory_dir) {
        for entry in read.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".md") {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| {
                    chrono::DateTime::<chrono::Utc>::from(t)
                        .to_rfc3339()
                        .into()
                })
                .unwrap_or_default();
            entries.push(MemoryFile {
                name,
                size: meta.len(),
                mtime,
            });
        }
    }
    // Sort by canonical layered order: L0 → L1 → L2 → others
    let layer_order = |name: &str| -> u8 {
        if name.starts_with("L0-") { 0 }
        else if name.starts_with("L1-") { 1 }
        else if name.starts_with("L2-") { 2 }
        else if name.starts_with("layout-") { 3 }
        else { 4 }
    };
    entries.sort_by(|a, b| {
        layer_order(&a.name).cmp(&layer_order(&b.name)).then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

/// T12: 写入 PRD 版本元数据到 _status.json.prd_versions
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdVersionMetaArgs {
    pub project_id: String,
    pub file: String,
    /// 自定义业务标签；传 null 清除
    pub label: Option<String>,
    /// 父版本 label；传 null 清除
    pub parent: Option<String>,
}

#[tauri::command]
pub fn set_prd_version_meta(
    state: State<'_, AppState>,
    args: PrdVersionMetaArgs,
) -> Result<(), String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| row.get(0),
        )
        .map_err(|_| "项目不存在".to_string())?
    };

    let status_path = Path::new(&output_dir).join("_status.json");
    let mut json: serde_json::Value = if status_path.exists() {
        let raw = fs::read_to_string(&status_path).map_err(|e| format!("读取 _status.json 失败: {e}"))?;
        serde_json::from_str(&raw).map_err(|e| format!("_status.json 不是合法 JSON: {e}"))?
    } else {
        serde_json::json!({})
    };

    // Ensure prd_versions is an array
    if !json.get("prd_versions").map(|v| v.is_array()).unwrap_or(false) {
        json["prd_versions"] = serde_json::json!([]);
    }

    let arr = json.get_mut("prd_versions").and_then(|v| v.as_array_mut()).unwrap();

    // Find or create entry
    let mut found = false;
    for item in arr.iter_mut() {
        if item.get("file").and_then(|f| f.as_str()) == Some(&args.file) {
            if let Some(label) = &args.label {
                item["label"] = serde_json::Value::String(label.clone());
            } else {
                item.as_object_mut().map(|o| o.remove("label"));
            }
            if let Some(parent) = &args.parent {
                item["parent"] = serde_json::Value::String(parent.clone());
            } else {
                item.as_object_mut().map(|o| o.remove("parent"));
            }
            found = true;
            break;
        }
    }
    if !found {
        let mut entry = serde_json::Map::new();
        entry.insert("file".to_string(), serde_json::Value::String(args.file.clone()));
        if let Some(label) = args.label {
            entry.insert("label".to_string(), serde_json::Value::String(label));
        }
        if let Some(parent) = args.parent {
            entry.insert("parent".to_string(), serde_json::Value::String(parent));
        }
        arr.push(serde_json::Value::Object(entry));
    }

    let out = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    fs::write(&status_path, out).map_err(|e| format!("写入 _status.json 失败: {e}"))?;
    Ok(())
}

/// T13: 写入原型版本元数据到 _status.json.prototype_versions
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrototypeVersionMetaArgs {
    pub project_id: String,
    /// 目录路径（相对项目根，含或不含尾斜杠）
    pub dir: String,
    pub label: Option<String>,
}

#[tauri::command]
pub fn set_prototype_version_meta(
    state: State<'_, AppState>,
    args: PrototypeVersionMetaArgs,
) -> Result<(), String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| row.get(0),
        )
        .map_err(|_| "项目不存在".to_string())?
    };

    let dir_key = args.dir.trim_end_matches('/').to_string();
    let status_path = Path::new(&output_dir).join("_status.json");
    let mut json: serde_json::Value = if status_path.exists() {
        let raw = fs::read_to_string(&status_path).map_err(|e| format!("读取 _status.json 失败: {e}"))?;
        serde_json::from_str(&raw).map_err(|e| format!("_status.json 不是合法 JSON: {e}"))?
    } else {
        serde_json::json!({})
    };

    if !json.get("prototype_versions").map(|v| v.is_array()).unwrap_or(false) {
        json["prototype_versions"] = serde_json::json!([]);
    }

    let arr = json.get_mut("prototype_versions").and_then(|v| v.as_array_mut()).unwrap();

    let mut found = false;
    for item in arr.iter_mut() {
        let stored = item
            .get("dir")
            .and_then(|d| d.as_str())
            .map(|s| s.trim_end_matches('/').to_string());
        if stored.as_deref() == Some(&dir_key) {
            if let Some(label) = &args.label {
                item["label"] = serde_json::Value::String(label.clone());
            } else {
                item.as_object_mut().map(|o| o.remove("label"));
            }
            found = true;
            break;
        }
    }
    if !found {
        let mut entry = serde_json::Map::new();
        entry.insert("dir".to_string(), serde_json::Value::String(dir_key));
        if let Some(label) = args.label {
            entry.insert("label".to_string(), serde_json::Value::String(label));
        }
        arr.push(serde_json::Value::Object(entry));
    }

    let out = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    fs::write(&status_path, out).map_err(|e| format!("写入 _status.json 失败: {e}"))?;
    Ok(())
}

/// List PRD files by scanning 05-prd/ directory and parsing version from filename.
/// Supports business naming: V1.1, V1.2, [2026M05]VX等。也合并 _status.json.prd_versions 元数据（如有）。
#[tauri::command]
pub fn list_prd_files(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<PrdFileEntry>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };

    let prd_dir = Path::new(&output_dir).join("05-prd");
    if !prd_dir.exists() {
        return Ok(vec![]);
    }

    // Read _status.json to merge metadata (T12)
    let status_path = Path::new(&output_dir).join("_status.json");
    let status_meta: std::collections::HashMap<String, (Option<String>, Option<String>)> =
        if status_path.exists() {
            fs::read_to_string(&status_path)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|json| json.get("prd_versions").cloned())
                .and_then(|val| val.as_array().cloned())
                .map(|arr| {
                    arr.into_iter()
                        .filter_map(|item| {
                            let file = item.get("file")?.as_str()?.to_string();
                            let custom = item.get("label").and_then(|v| v.as_str()).map(String::from);
                            let parent = item.get("parent").and_then(|v| v.as_str()).map(String::from);
                            Some((file, (custom, parent)))
                        })
                        .collect()
                })
                .unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        };

    let mut entries: Vec<PrdFileEntry> = Vec::new();
    if let Ok(read) = fs::read_dir(&prd_dir) {
        for entry in read.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".md") {
                continue;
            }
            // Skip README
            if name.eq_ignore_ascii_case("README.md") {
                continue;
            }
            let (label, sort_key, recognized) = parse_prd_filename(&name);
            let (custom_label, parent) = status_meta
                .get(&name)
                .cloned()
                .unwrap_or((None, None));
            entries.push(PrdFileEntry {
                file: name,
                label,
                sort_key,
                recognized,
                parent,
                custom_label,
            });
        }
    }

    // Sort: recognized versions by sort_key asc, then unrecognized by filename
    entries.sort_by(|a, b| {
        match (a.recognized, b.recognized) {
            (true, true) => a.sort_key.cmp(&b.sort_key),
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            (false, false) => a.file.cmp(&b.file),
        }
    });

    Ok(entries)
}

/// Export PRD as a self-contained shareable HTML page.
/// Returns the absolute path of the generated .html file.
#[tauri::command]
pub fn export_prd_share_html(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    // Resolve project info
    let (project_name, output_dir): (String, String) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "项目不存在".to_string())?
    };

    // Read PRD markdown
    let prd_path = Path::new(&output_dir).join("05-prd").join("05-PRD-v1.0.md");
    if !prd_path.exists() {
        return Err("PRD 文件不存在，请先完成 PRD 生成".to_string());
    }
    let markdown = fs::read_to_string(&prd_path)
        .map_err(|e| format!("读取 PRD 失败: {}", e))?;

    // Load HTML template from bundled resources
    let resource_base = app.path().resource_dir()
        .map_err(|e| format!("无法获取资源目录: {}", e))?;
    let template_path = resource_base.join("resources/templates/share-template.html");
    let template_fallback = resource_base.join("templates/share-template.html");
    let template = if template_path.exists() {
        fs::read_to_string(&template_path)
    } else if template_fallback.exists() {
        fs::read_to_string(&template_fallback)
    } else {
        return Err(format!("分享页模板未找到: {}", template_path.display()));
    }.map_err(|e| format!("读取模板失败: {}", e))?;

    // Escape markdown for embedding in <script> tag
    // Replace </script with <\/script to prevent premature tag close
    let escaped_md = markdown.replace("</script", "<\\/script");

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string();
    let html = template
        .replace("{{PROJECT_NAME}}", &html_escape(&project_name))
        .replace("{{GENERATED_AT}}", &now)
        .replace("{{MARKDOWN_CONTENT}}", &escaped_md);

    // Write to output
    let html_path = Path::new(&output_dir).join("05-prd").join("PRD-分享页.html");
    fs::write(&html_path, &html)
        .map_err(|e| format!("写入分享页失败: {}", e))?;

    Ok(html_path.to_string_lossy().to_string())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ── PDF cover templates ──────────────────────────────────────────

#[tauri::command]
pub fn list_docx_recipes(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let path = state.templates_base()
        .join("presets")
        .join("docx-recipes.json");
    let content = fs::read_to_string(&path)
        .map_err(|_| "DOCX 配方文件不存在".to_string())?;
    serde_json::from_str(&content)
        .map_err(|e| format!("DOCX 配方文件格式错误: {}", e))
}

#[tauri::command]
pub fn list_pdf_covers(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let path = state.templates_base()
        .join("presets")
        .join("pdf-covers.json");
    let content = fs::read_to_string(&path)
        .map_err(|_| "PDF 封面配置文件不存在".to_string())?;
    serde_json::from_str(&content)
        .map_err(|e| format!("PDF 封面配置格式错误: {}", e))
}

#[tauri::command]
pub async fn export_prd_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    _cover_style: Option<String>,
    _accent_color: Option<String>,
) -> Result<String, String> {
    // 1. Generate share HTML first
    let html_path = export_prd_share_html(app.clone(), state.clone(), project_id.clone())?;

    // 2. Resolve output PDF path
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };
    let pdf_path = std::path::Path::new(&output_dir)
        .join("05-prd")
        .join("05-PRD-v1.0.pdf");

    // 3. Find Chrome/Chromium for headless PDF generation
    let chrome = find_chrome_binary()
        .ok_or("未找到 Chrome 或 Chromium 浏览器，无法生成 PDF。请安装 Google Chrome 后重试。")?;

    // 4. Convert HTML → PDF via headless Chrome
    let output = tokio::process::Command::new(&chrome)
        .args([
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-software-rasterizer",
            &format!("--print-to-pdf={}", pdf_path.display()),
            "--no-pdf-header-footer",
            &format!("file://{}", html_path),
        ])
        .output()
        .await
        .map_err(|e| format!("Chrome 调用失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PDF 生成失败: {}", stderr.chars().take(300).collect::<String>()));
    }

    if !pdf_path.exists() {
        return Err("PDF 文件未生成，请检查 Chrome 安装".to_string());
    }

    Ok(pdf_path.to_string_lossy().to_string())
}

/// Find Chrome or Chromium binary on macOS
fn find_chrome_binary() -> Option<String> {
    let candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // Try Playwright's Chromium cache
    if let Some(home) = dirs::home_dir() {
        let playwright_dir = home.join("Library/Caches/ms-playwright");
        if let Ok(entries) = std::fs::read_dir(&playwright_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("chromium-") {
                    let bin = entry.path()
                        .join("chrome-mac")
                        .join("Chromium.app")
                        .join("Contents")
                        .join("MacOS")
                        .join("Chromium");
                    if bin.exists() {
                        return Some(bin.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    None
}

/// Reveal a file in macOS Finder.
#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    // canonicalize + 限制在用户主目录下
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("路径无效: {e}"))?;
    let home = dirs::home_dir()
        .ok_or("无法获取用户主目录".to_string())?;
    if !canonical.starts_with(&home) {
        return Err("只能打开用户目录下的文件".to_string());
    }

    std::process::Command::new("open")
        .args(["-R", &canonical.to_string_lossy()])
        .spawn()
        .map_err(|e| format!("无法打开 Finder：{}", e))?;
    Ok(())
}

/// Open a file with the system default program.
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    // canonicalize + 限制在用户主目录下
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("路径无效: {e}"))?;
    let home = dirs::home_dir()
        .ok_or("无法获取用户主目录".to_string())?;
    if !canonical.starts_with(&home) {
        return Err("只能打开用户目录下的文件".to_string());
    }

    // 扩展名白名单
    let allowed_exts = ["md", "pdf", "docx", "html", "txt", "json", "csv", "xlsx", "png", "jpg"];
    if let Some(ext) = canonical.extension().and_then(|e| e.to_str()) {
        if !allowed_exts.contains(&ext.to_lowercase().as_str()) {
            return Err(format!("不支持打开 .{ext} 类型的文件"));
        }
    } else {
        return Err("文件缺少扩展名，无法确定类型".to_string());
    }

    std::process::Command::new("open")
        .arg(&canonical.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Write arbitrary content to an absolute file path.
/// Only allows writing under the user's home directory for safety.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    // Basic safety: reject path traversal
    if path.contains("..") {
        return Err("路径包含非法字符".to_string());
    }
    // Restrict to user's home directory
    if let Some(home) = dirs::home_dir() {
        let p = std::path::Path::new(&path);
        // For new files, canonicalize the parent directory
        let check_path = if p.exists() {
            std::fs::canonicalize(p).map_err(|e| e.to_string())?
        } else if let Some(parent) = p.parent() {
            if parent.exists() {
                std::fs::canonicalize(parent).map_err(|e| e.to_string())?.join(p.file_name().unwrap_or_default())
            } else {
                p.to_path_buf()
            }
        } else {
            p.to_path_buf()
        };
        if !check_path.starts_with(&home) {
            return Err("只允许写入用户主目录下的文件".to_string());
        }
    }
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

// ── Reference files (07-references/) ────────────────────────────────

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceFileEntry {
    pub name: String,
    pub size: u64,
}

/// Upload (copy) a local file into the project's 07-references/ directory.
/// Returns the destination file name on success.
#[tauri::command]
pub fn upload_reference_file(
    state: State<AppState>,
    project_id: String,
    source_path: String,
) -> Result<String, String> {
    // Reject path traversal
    if source_path.contains("..") {
        return Err("路径包含非法字符".to_string());
    }

    // Phase 1: lock DB → query output_dir
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("项目不存在：{}", e))?
        // db guard drops here
    };

    // Phase 2: file I/O without holding the lock
    let src = Path::new(&source_path);
    if !src.exists() || !src.is_file() {
        return Err("源文件不存在".to_string());
    }
    let file_name = src
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();

    let refs_dir = Path::new(&output_dir).join("07-references");
    fs::create_dir_all(&refs_dir).map_err(|e| format!("创建目录失败：{}", e))?;

    let dest = refs_dir.join(&file_name);
    fs::copy(&src, &dest).map_err(|e| format!("复制文件失败：{}", e))?;

    Ok(file_name)
}

/// List all non-hidden files in the project's 07-references/ directory.
#[tauri::command]
pub fn list_reference_files(
    state: State<AppState>,
    project_id: String,
) -> Result<Vec<ReferenceFileEntry>, String> {
    // Phase 1: lock DB → query output_dir
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ) {
            Ok(dir) => dir,
            Err(_) => return Ok(vec![]),
        }
        // db guard drops here
    };

    // Phase 2: read directory without holding the lock
    let refs_dir = Path::new(&output_dir).join("07-references");
    if !refs_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<ReferenceFileEntry> = fs::read_dir(&refs_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let path = e.path();
            path.is_file()
                && !e
                    .file_name()
                    .to_string_lossy()
                    .starts_with('.')
        })
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            ReferenceFileEntry { name, size }
        })
        .collect();

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Delete a single file from the project's 07-references/ directory.
#[tauri::command]
pub fn delete_reference_file(
    state: State<AppState>,
    project_id: String,
    file_name: String,
) -> Result<(), String> {
    // Reject path traversal
    if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
        return Err("文件名包含非法字符".to_string());
    }

    // Phase 1: lock DB → query output_dir
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("项目不存在：{}", e))?
        // db guard drops here
    };

    // Phase 2: delete file without holding the lock
    let file_path = Path::new(&output_dir).join("07-references").join(&file_name);
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("删除文件失败：{}", e))?;
    }

    Ok(())
}

/// Get the project's selected design spec.
#[tauri::command]
pub fn get_project_design_spec(
    state: State<AppState>,
    project_id: String,
) -> Result<Option<String>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ) {
            Ok(dir) => dir,
            Err(_) => return Ok(None),
        }
    };

    let spec_file = Path::new(&output_dir).join(".design-spec");
    match fs::read_to_string(&spec_file) {
        Ok(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { Ok(None) } else { Ok(Some(trimmed)) }
        }
        Err(_) => Ok(None),
    }
}

/// Set the project's selected design spec.
#[tauri::command]
pub fn set_project_design_spec(
    state: State<AppState>,
    project_id: String,
    spec_id: String,
) -> Result<(), String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?
    };

    let spec_file = Path::new(&output_dir).join(".design-spec");
    fs::write(&spec_file, &spec_id).map_err(|e| e.to_string())
}

/// Score PRD quality using non-streaming AI call.
#[tauri::command]
pub async fn score_prd(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    // Phase 1: read PRD under lock, then release
    let (prd_content, config_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let output_dir: String = db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?;

        let prd_dir = Path::new(&output_dir).join("05-prd");
        // Find latest version
        let mut versions: Vec<u32> = Vec::new();
        if let Ok(entries) = fs::read_dir(&prd_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Some(rest) = name.strip_prefix("05-PRD-v") {
                    if let Some(ver_str) = rest.strip_suffix(".0.md") {
                        if let Ok(ver) = ver_str.parse::<u32>() { versions.push(ver); }
                    }
                }
            }
        }
        let ver = versions.iter().max().copied().unwrap_or(1);
        let prd_path = prd_dir.join(format!("05-PRD-v{}.0.md", ver));
        let content = fs::read_to_string(&prd_path)
            .map_err(|_| "PRD 文件不存在".to_string())?;
        (content, state.config_dir.clone())
        // db guard drops here
    };

    let truncated = crate::commands::knowledge::truncate_to_chars(&prd_content, 8000);

    let prompt = format!(
        "你是一位资深产品评审专家。请对以下 PRD 进行质量评分。\n\n\
         评分维度（每项 1-5 分）：\n\
         1. 完整性：是否覆盖了目标用户、核心功能、非功能需求、验收标准\n\
         2. 清晰度：描述是否无歧义，开发可直接理解\n\
         3. 可执行性：功能描述是否足够详细，能否直接转化为开发任务\n\
         4. 一致性：各章节之间是否矛盾\n\
         5. 边界定义：是否明确了「不做什么」、异常处理、边界条件\n\n\
         请直接输出 JSON，格式：\n\
         {{\"dimensions\":[{{\"name\":\"完整性\",\"score\":4,\"comment\":\"...\",\"suggestion\":\"...\"}},...],\"totalScore\":4.2}}\n\n\
         不要输出 JSON 以外的任何内容。\n\nPRD 内容：\n{}", truncated
    );

    // Phase 2: AI call (no lock held)
    let raw = crate::providers::ai_call::call_ai_non_streaming(&config_dir, &prompt).await?;

    // Parse JSON — try direct parse, then extract between { }
    let trimmed = raw.trim();
    let stripped = if trimmed.starts_with("```") {
        trimmed.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim()
    } else { trimmed };

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(stripped) {
        return Ok(v);
    }
    if let Some(start) = stripped.find('{') {
        if let Some(end) = stripped.rfind('}') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stripped[start..=end]) {
                return Ok(v);
            }
        }
    }
    Err(format!("AI 返回的评分格式无法解析：{}", stripped.chars().take(200).collect::<String>()))
}

/// Extract plain text from a DOCX file (zip + XML parsing).
#[tauri::command]
pub fn extract_docx_text(path: String) -> Result<String, String> {
    use std::io::Read as _;

    let file = fs::File::open(&path).map_err(|e| format!("打开文件失败: {}", e))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if metadata.len() > 50 * 1024 * 1024 {
        return Err("文件大小超过 50MB 限制".to_string());
    }

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("无效的 DOCX 文件: {}", e))?;

    // Security: check for path traversal
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.contains("..") || name.starts_with('/') || name.starts_with('\\') {
            return Err("DOCX 文件包含非法路径".to_string());
        }
    }

    let mut doc_xml = archive.by_name("word/document.xml")
        .map_err(|_| "DOCX 中未找到 document.xml".to_string())?;

    let mut xml_content = String::new();
    doc_xml.read_to_string(&mut xml_content)
        .map_err(|e| format!("读取 document.xml 失败: {}", e))?;

    // Parse XML and extract <w:t> text nodes
    let mut reader = quick_xml::Reader::from_str(&xml_content);
    let mut text = String::new();
    let mut in_paragraph = false;
    let mut in_text = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e)) | Ok(quick_xml::events::Event::Empty(ref e)) => {
                let local = e.local_name();
                if local.as_ref() == b"p" {
                    if in_paragraph && !text.ends_with('\n') {
                        text.push('\n');
                    }
                    in_paragraph = true;
                } else if local.as_ref() == b"t" {
                    in_text = true;
                }
            }
            Ok(quick_xml::events::Event::End(ref e)) => {
                let local = e.local_name();
                if local.as_ref() == b"t" {
                    in_text = false;
                } else if local.as_ref() == b"p" {
                    in_paragraph = false;
                }
            }
            Ok(quick_xml::events::Event::Text(ref e)) => {
                if in_text {
                    if let Ok(t) = e.unescape() {
                        text.push_str(&t);
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(text.trim().to_string())
}

// ── Sensitive info scanning ────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveMatch {
    pub line: usize,
    pub column: usize,
    pub matched_preview: String,
    pub context: String,
    pub rule_name: String,
    pub severity: String,
    pub redacted: String,
}

struct ScanRule {
    name: &'static str,
    pattern: Regex,
    severity: &'static str,
}

static SAFE_EMAIL_DOMAINS: &[&str] = &[
    "example.com", "example.org", "test.com", "localhost",
    "placeholder.com", "foo.com", "bar.com",
];

static SCAN_RULES: Lazy<Vec<ScanRule>> = Lazy::new(|| vec![
    ScanRule { name: "api_key", pattern: Regex::new(r"\b(?:sk-|key-|token-)[a-zA-Z0-9_\-]{20,}\b").unwrap(), severity: "high" },
    ScanRule { name: "db_connection", pattern: Regex::new(r"(?:postgres|mysql|mongodb|redis)://[^\s]+").unwrap(), severity: "high" },
    ScanRule { name: "password", pattern: Regex::new(r"(?i)password\s*[:=]\s*['\x22][^'\x22]+['\x22]").unwrap(), severity: "high" },
    ScanRule { name: "private_key", pattern: Regex::new(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----").unwrap(), severity: "high" },
    ScanRule { name: "internal_ip", pattern: Regex::new(r"\b(?:192\.168|10\.|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+\b").unwrap(), severity: "medium" },
    ScanRule { name: "internal_domain", pattern: Regex::new(r"[a-z0-9\-]+\.(?:internal|local|corp|intranet)\b").unwrap(), severity: "medium" },
    ScanRule { name: "phone", pattern: Regex::new(r"\b1[3-9]\d{9}\b").unwrap(), severity: "medium" },
    ScanRule { name: "id_card", pattern: Regex::new(r"\b\d{17}[\dXx]\b").unwrap(), severity: "medium" },
    ScanRule { name: "email", pattern: Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").unwrap(), severity: "medium" },
]);

/// Helper: safely take the first `n` chars from a string.
fn take_chars(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// Helper: safely take the last `n` chars from a string.
fn take_chars_end(s: &str, n: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= n {
        s.to_string()
    } else {
        chars[chars.len() - n..].iter().collect()
    }
}

fn scan_prd_sensitive(content: &str) -> Vec<SensitiveMatch> {
    let mut matches = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        for rule in SCAN_RULES.iter() {
            for mat in rule.pattern.find_iter(line) {
                let matched_text = mat.as_str();

                // Email whitelist check
                if rule.name == "email" {
                    if SAFE_EMAIL_DOMAINS.iter().any(|d| matched_text.ends_with(d)) {
                        continue;
                    }
                }

                // Generate preview (first 4 + last 4 chars)
                let char_count = matched_text.chars().count();
                let preview = if char_count > 12 {
                    format!("{}****{}", take_chars(matched_text, 4), take_chars_end(matched_text, 4))
                } else {
                    "****".to_string()
                };

                // Context (up to 20 bytes before and after, clamped to line)
                let start = mat.start().saturating_sub(20);
                let end = (mat.end() + 20).min(line.len());
                // Adjust to char boundaries
                let ctx_start = line.floor_char_boundary(start);
                let ctx_end = line.ceil_char_boundary(end);
                let context = line[ctx_start..ctx_end].to_string();

                // Redacted replacement text
                let redacted = match rule.name {
                    "api_key" => "[API_KEY_REDACTED]".to_string(),
                    "db_connection" => "[DB_CONNECTION_REDACTED]".to_string(),
                    "password" => "[PASSWORD_REDACTED]".to_string(),
                    "private_key" => "[PRIVATE_KEY_REDACTED]".to_string(),
                    "internal_ip" => "[INTERNAL_IP]".to_string(),
                    "internal_domain" => "[INTERNAL_DOMAIN]".to_string(),
                    "phone" if char_count == 11 => {
                        format!("{}****{}", take_chars(matched_text, 3), take_chars_end(matched_text, 4))
                    }
                    "id_card" if char_count == 18 => {
                        format!("{}**************{}", take_chars(matched_text, 3), take_chars_end(matched_text, 4))
                    }
                    "email" => {
                        if let Some(at) = matched_text.find('@') {
                            let domain = &matched_text[at..];
                            format!("{}**{}", take_chars(matched_text, 1), domain)
                        } else {
                            "[REDACTED]".to_string()
                        }
                    }
                    _ => "[REDACTED]".to_string(),
                };

                matches.push(SensitiveMatch {
                    line: line_idx + 1,
                    column: mat.start() + 1,
                    matched_preview: preview,
                    context,
                    rule_name: rule.name.to_string(),
                    severity: rule.severity.to_string(),
                    redacted,
                });
            }
        }
    }
    matches
}

#[tauri::command]
pub fn scan_sensitive(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<SensitiveMatch>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };

    let prd_path = std::path::PathBuf::from(&output_dir)
        .join("05-prd")
        .join("05-PRD-v1.0.md");

    if !prd_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&prd_path).map_err(|e| e.to_string())?;
    Ok(scan_prd_sensitive(&content))
}

// ── Placeholder scanning ─────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderMatch {
    pub line: usize,
    pub column: usize,
    pub matched_text: String,
    pub context: String,
    pub rule_name: String,
}

struct PlaceholderRule {
    name: &'static str,
    pattern: Regex,
}

static PLACEHOLDER_RULES: Lazy<Vec<PlaceholderRule>> = Lazy::new(|| {
    vec![
        PlaceholderRule {
            name: "chinese_placeholder",
            pattern: Regex::new(r"\[(?:待补充|此处填写|待确认|待定|请填写|待更新)[^\]]*\]").unwrap(),
        },
        PlaceholderRule {
            name: "english_placeholder",
            pattern: Regex::new(r"(?i)\b(?:TBD|TODO|FIXME|Lorem\s+ipsum)\b").unwrap(),
        },
        PlaceholderRule {
            name: "template_variable",
            pattern: Regex::new(r"\{\{[^}]+\}\}").unwrap(),
        },
        PlaceholderRule {
            name: "generic_placeholder",
            pattern: Regex::new(r"\[(?:Feature Name|产品名|公司名|产品名称|项目名称)\]").unwrap(),
        },
        PlaceholderRule {
            name: "xxxx_placeholder",
            pattern: Regex::new(r"\bxxxx\b").unwrap(),
        },
    ]
});

/// Regex to detect Markdown links — matches inside these should be excluded
static MD_LINK_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[[^\]]*\]\([^)]+\)").unwrap()
});

fn scan_prd_placeholders(content: &str) -> Vec<PlaceholderMatch> {
    let mut matches = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        // Collect Markdown link ranges to exclude
        let link_ranges: Vec<(usize, usize)> = MD_LINK_RE
            .find_iter(line)
            .map(|m| (m.start(), m.end()))
            .collect();

        for rule in PLACEHOLDER_RULES.iter() {
            for mat in rule.pattern.find_iter(line) {
                // Skip if match is inside a Markdown link
                let in_link = link_ranges.iter().any(|(s, e)| mat.start() >= *s && mat.end() <= *e);
                if in_link {
                    continue;
                }

                let ctx_start = line.floor_char_boundary(mat.start().saturating_sub(30));
                let ctx_end = line.ceil_char_boundary((mat.end() + 30).min(line.len()));
                let context = line[ctx_start..ctx_end].to_string();

                matches.push(PlaceholderMatch {
                    line: line_idx + 1,
                    column: mat.start() + 1,
                    matched_text: mat.as_str().to_string(),
                    context,
                    rule_name: rule.name.to_string(),
                });
            }
        }
    }
    matches
}

#[tauri::command]
pub fn scan_placeholders(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<PlaceholderMatch>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };

    let prd_path = std::path::PathBuf::from(&output_dir)
        .join("05-prd")
        .join("05-PRD-v1.0.md");

    if !prd_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&prd_path).map_err(|e| e.to_string())?;
    Ok(scan_prd_placeholders(&content))
}
