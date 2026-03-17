use rusqlite::params;
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
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))
}
