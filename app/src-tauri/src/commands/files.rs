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
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let output_dir: String = match db.query_row(
        "SELECT output_dir FROM projects WHERE id = ?1",
        params![&project_id],
        |row| row.get(0),
    ) {
        Ok(dir) => dir,
        Err(_) => return Ok(None),
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
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let output_dir: String = db
        .query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let file_path = Path::new(&output_dir).join(&args.file_name);

    // Ensure parent directory exists (for nested paths like 05-prd/05-PRD-v1.0.md)
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, &args.content).map_err(|e| e.to_string())?;

    Ok(())
}
