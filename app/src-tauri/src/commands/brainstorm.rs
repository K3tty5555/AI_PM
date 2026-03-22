use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrainstormMessage {
    pub id: String,
    pub project_id: String,
    pub phase: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub seq: i64,
}

#[tauri::command]
pub fn load_brainstorm_messages(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<Vec<BrainstormMessage>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, project_id, phase, role, content, created_at, seq \
             FROM brainstorm_messages \
             WHERE project_id = ?1 AND phase = ?2 \
             ORDER BY seq ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![&project_id, &phase], |row| {
            Ok(BrainstormMessage {
                id: row.get(0)?,
                project_id: row.get(1)?,
                phase: row.get(2)?,
                role: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                seq: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| e.to_string())?);
    }
    Ok(messages)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBrainstormMessageArgs {
    pub project_id: String,
    pub phase: String,
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub fn save_brainstorm_message(
    state: State<'_, AppState>,
    args: SaveBrainstormMessageArgs,
) -> Result<BrainstormMessage, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Calculate next seq
    let next_seq: i64 = db
        .query_row(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM brainstorm_messages \
             WHERE project_id = ?1 AND phase = ?2",
            params![&args.project_id, &args.phase],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let id = format!(
        "bs-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let now = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO brainstorm_messages (id, project_id, phase, role, content, created_at, seq) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![&id, &args.project_id, &args.phase, &args.role, &args.content, &now, &next_seq],
    )
    .map_err(|e| e.to_string())?;

    Ok(BrainstormMessage {
        id,
        project_id: args.project_id,
        phase: args.phase,
        role: args.role,
        content: args.content,
        created_at: now,
        seq: next_seq,
    })
}

#[tauri::command]
pub fn clear_brainstorm(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        params![&project_id, &phase],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn brainstorm_message_count(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT COUNT(*) FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        params![&project_id, &phase],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}
