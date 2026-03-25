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

/// List PRD version numbers by scanning 05-prd/ directory.
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
