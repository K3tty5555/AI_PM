use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;
use crate::state::AppState;

const PHASES: &[&str] = &[
    "requirement", "analysis", "research", "stories", "prd", "prototype", "review",
];

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPhase {
    pub id: String,
    pub project_id: String,
    pub phase: String,
    pub status: String,
    pub output_file: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_phase: String,
    pub output_dir: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed_count: i64,
    pub total_phases: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_phase: String,
    pub output_dir: String,
    pub created_at: String,
    pub updated_at: String,
    pub phases: Vec<ProjectPhase>,
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectSummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Fix 3: Replace N+1 queries with a single JOIN query
    let mut stmt = db
        .prepare(
            "SELECT p.id, p.name, p.description, p.current_phase, p.output_dir, p.created_at, p.updated_at,
                    COUNT(CASE WHEN pp.status = 'completed' THEN 1 END) as completed_count
             FROM projects p
             LEFT JOIN project_phases pp ON pp.project_id = p.id
             GROUP BY p.id
             ORDER BY p.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let projects: Vec<ProjectSummary> = stmt
        .query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                current_phase: row.get(3)?,
                output_dir: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                completed_count: row.get(7)?,
                total_phases: PHASES.len() as i64,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[tauri::command]
pub fn create_project(state: State<AppState>, name: String) -> Result<ProjectDetail, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let output_dir = format!("{}/{}", state.projects_dir, name);

    // Create project directory
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Insert project
    db.execute(
        "INSERT INTO projects (id, name, description, current_phase, output_dir, created_at, updated_at)
         VALUES (?1, ?2, NULL, 'requirement', ?3, ?4, ?4)",
        params![&id, &name, &output_dir, &now],
    )
    .map_err(|e| e.to_string())?;

    // Insert 7 phase records
    let mut phases = Vec::new();
    for (idx, &phase) in PHASES.iter().enumerate() {
        let phase_id = Uuid::new_v4().to_string();
        let status = if idx == 0 { "in_progress" } else { "pending" };
        let started_at: Option<&str> = if idx == 0 { Some(&now) } else { None };

        db.execute(
            "INSERT INTO project_phases (id, project_id, phase, status, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![&phase_id, &id, phase, status, started_at],
        )
        .map_err(|e| e.to_string())?;

        phases.push(ProjectPhase {
            id: phase_id,
            project_id: id.clone(),
            phase: phase.to_string(),
            status: status.to_string(),
            output_file: None,
            started_at: started_at.map(|s| s.to_string()),
            completed_at: None,
        });
    }

    // Write _status.json for CLI skill compatibility
    write_status_json(&output_dir, &phases, "requirement");

    Ok(ProjectDetail {
        id,
        name,
        description: None,
        current_phase: "requirement".to_string(),
        output_dir,
        created_at: now.clone(),
        updated_at: now,
        phases,
    })
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> Result<Option<ProjectDetail>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let result: rusqlite::Result<(String, String, Option<String>, String, String, String, String)> =
        db.query_row(
            "SELECT id, name, description, current_phase, output_dir, created_at, updated_at
             FROM projects WHERE id = ?1",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        );

    let (pid, name, description, current_phase, output_dir, created_at, updated_at) = match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
        Ok(row) => row,
    };

    let mut stmt = db
        .prepare(
            "SELECT id, project_id, phase, status, output_file, started_at, completed_at
             FROM project_phases WHERE project_id = ?1 ORDER BY rowid",
        )
        .map_err(|e| e.to_string())?;

    let phases: Vec<ProjectPhase> = stmt
        .query_map(params![&pid], |row| {
            Ok(ProjectPhase {
                id: row.get(0)?,
                project_id: row.get(1)?,
                phase: row.get(2)?,
                status: row.get(3)?,
                output_file: row.get(4)?,
                started_at: row.get(5)?,
                completed_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Some(ProjectDetail {
        id: pid,
        name,
        description,
        current_phase,
        output_dir,
        created_at,
        updated_at,
        phases,
    }))
}

#[tauri::command]
pub fn delete_project(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get output_dir before deleting
    let output_dir: Option<String> = db
        .query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&id],
            |row| row.get(0),
        )
        .ok();

    db.execute("DELETE FROM projects WHERE id = ?1", params![&id])
        .map_err(|e| e.to_string())?;

    // Delete project files from disk
    if let Some(dir) = output_dir {
        if Path::new(&dir).exists() {
            fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePhaseArgs {
    pub project_id: String,
    pub phase: String,
    pub status: String,
    pub output_file: Option<String>,
}

#[tauri::command]
pub fn update_phase(state: State<AppState>, args: UpdatePhaseArgs) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let phase_id: String = db
        .query_row(
            "SELECT id FROM project_phases WHERE project_id = ?1 AND phase = ?2",
            params![&args.project_id, &args.phase],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if args.status == "completed" {
        db.execute(
            "UPDATE project_phases SET status = ?1, completed_at = ?2, output_file = ?3 WHERE id = ?4",
            params![&args.status, &now, &args.output_file, &phase_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "UPDATE project_phases SET status = ?1 WHERE id = ?2",
            params![&args.status, &phase_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update project's updated_at
    db.execute(
        "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        params![&now, &args.project_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn advance_phase(state: State<AppState>, id: String) -> Result<Option<String>, String> {
    let now = Utc::now().to_rfc3339();

    // Fix 1: Wrap all DB operations in a block so the mutex guard drops before file I/O
    let (next_phase_owned, output_dir, fake_phases) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        let current_phase: String = db
            .query_row(
                "SELECT current_phase FROM projects WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        let Some(idx) = PHASES.iter().position(|&p| p == current_phase.as_str()) else {
            return Ok(None);
        };

        if idx >= PHASES.len() - 1 {
            return Ok(None);
        }

        let next_phase = PHASES[idx + 1];

        // Mark current phase completed
        db.execute(
            "UPDATE project_phases SET status = 'completed', completed_at = ?1
             WHERE project_id = ?2 AND phase = ?3",
            params![&now, &id, &current_phase],
        )
        .map_err(|e| e.to_string())?;

        // Mark next phase in_progress
        db.execute(
            "UPDATE project_phases SET status = 'in_progress', started_at = ?1
             WHERE project_id = ?2 AND phase = ?3",
            params![&now, &id, next_phase],
        )
        .map_err(|e| e.to_string())?;

        // Update project's current_phase
        db.execute(
            "UPDATE projects SET current_phase = ?1, updated_at = ?2 WHERE id = ?3",
            params![next_phase, &now, &id],
        )
        .map_err(|e| e.to_string())?;

        // Fetch output_dir for _status.json update
        let output_dir: String = db
            .query_row(
                "SELECT output_dir FROM projects WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Build phase status map for _status.json
        let mut phase_statuses: HashMap<String, String> = HashMap::new();
        let mut stmt = db
            .prepare("SELECT phase, status FROM project_phases WHERE project_id = ?1")
            .map_err(|e| e.to_string())?;
        let _ = stmt.query_map(params![&id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .for_each(|(phase, status)| {
            phase_statuses.insert(phase, status);
        });

        let fake_phases: Vec<ProjectPhase> = PHASES
            .iter()
            .map(|&p| {
                let status = phase_statuses
                    .get(p)
                    .cloned()
                    .unwrap_or_else(|| "pending".to_string());
                ProjectPhase {
                    id: String::new(),
                    project_id: id.clone(),
                    phase: p.to_string(),
                    status,
                    output_file: None,
                    started_at: None,
                    completed_at: None,
                }
            })
            .collect();

        (next_phase.to_string(), output_dir, fake_phases)
        // db guard drops here, before file I/O below
    };

    // Fix 1: write_status_json (fs::write) now happens outside the mutex lock
    write_status_json(&output_dir, &fake_phases, &next_phase_owned);

    Ok(Some(next_phase_owned))
}

fn write_status_json(output_dir: &str, phases: &[ProjectPhase], last_phase: &str) {
    let phases_map: serde_json::Map<String, serde_json::Value> = phases
        .iter()
        .map(|p| {
            (
                p.phase.clone(),
                serde_json::Value::Bool(p.status == "completed"),
            )
        })
        .collect();

    let status = serde_json::json!({
        "phases": phases_map,
        "lastPhase": last_phase,
        "updatedAt": Utc::now().to_rfc3339(),
    });

    let path = Path::new(output_dir).join("_status.json");
    // Fix 2: avoid unwrap(), use if let to handle serialization errors gracefully
    if let Ok(json) = serde_json::to_string_pretty(&status) {
        let _ = fs::write(path, json);
    }
}
