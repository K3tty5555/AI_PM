use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use crate::state::AppState;

#[tauri::command]
pub fn read_project_file(
    state: State<AppState>,
    project_id: String,
    file_name: String,
) -> Result<Option<String>, String> {
    // Fix 4: Reject path traversal attempts
    if file_name.contains("..") {
        return Err("invalid file path".to_string());
    }

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
pub fn save_project_file(state: State<AppState>, args: SaveFileArgs) -> Result<(), String> {
    // Fix 4: Reject path traversal attempts
    if args.file_name.contains("..") {
        return Err("invalid file path".to_string());
    }

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

    let file_path = Path::new(&output_dir).join(&args.file_name);

    // Ensure parent directory exists (for nested paths like 05-prd/05-PRD-v1.0.md)
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, &args.content).map_err(|e| e.to_string())?;

    Ok(())
}

/// 读取任意本地文件（用于 Persona 分析等场景）
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    // Reject path traversal attempts
    if path.contains("..") {
        return Err("路径包含非法字符".to_string());
    }
    // Guard against reading huge files (10 MB limit)
    let metadata = std::fs::metadata(&path).map_err(|e| format!("读取文件失败：{}", e))?;
    const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10 MB
    if metadata.len() > MAX_SIZE {
        return Err(format!("文件过大（{}MB），最大支持 10MB", metadata.len() / 1024 / 1024));
    }
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))
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
    let script_path = app.path().resource_dir()
        .map_err(|e| format!("无法获取资源目录：{}", e))?
        .join("skills")
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

/// Reveal a file in macOS Finder.
#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("无法打开 Finder：{}", e))?;
    Ok(())
}

/// Open a file with the system default program.
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
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
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}
