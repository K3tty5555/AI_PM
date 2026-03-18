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
    "analytics", "review-modify", "retrospective",
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
    pub completed_phases: Vec<String>,
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
    pub team_mode: bool,
    pub phases: Vec<ProjectPhase>,
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectSummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Fix 3: Replace N+1 queries with a single JOIN query
    let mut stmt = db
        .prepare(
            "SELECT p.id, p.name, p.description, p.current_phase, p.output_dir, p.created_at, p.updated_at,
                    COUNT(CASE WHEN pp.status = 'completed' THEN 1 END) as completed_count,
                    GROUP_CONCAT(CASE WHEN pp.status = 'completed' THEN pp.phase END) as completed_phases
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
                completed_phases: row.get::<_, Option<String>>(8)?
                    .unwrap_or_default()
                    .split(',')
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[tauri::command]
pub fn create_project(state: State<AppState>, args: CreateProjectArgs) -> Result<ProjectDetail, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let output_dir = format!("{}/{}", state.projects_dir, args.name);
    let team_mode_int: i64 = if args.team_mode.unwrap_or(false) { 1 } else { 0 };

    // Create project directory
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Insert project
    db.execute(
        "INSERT INTO projects (id, name, description, current_phase, output_dir, created_at, updated_at, team_mode)
         VALUES (?1, ?2, NULL, 'requirement', ?3, ?4, ?4, ?5)",
        params![&id, &args.name, &output_dir, &now, &team_mode_int],
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
        name: args.name,
        description: None,
        current_phase: "requirement".to_string(),
        output_dir,
        created_at: now.clone(),
        updated_at: now,
        team_mode: args.team_mode.unwrap_or(false),
        phases,
    })
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> Result<Option<ProjectDetail>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let result: rusqlite::Result<(String, String, Option<String>, String, String, String, String, i64)> =
        db.query_row(
            "SELECT id, name, description, current_phase, output_dir, created_at, updated_at, COALESCE(team_mode, 0)
             FROM projects WHERE id = ?1",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
        );

    let (pid, name, description, current_phase, output_dir, created_at, updated_at, team_mode_val) = match result {
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
        team_mode: team_mode_val != 0,
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
pub struct CreateProjectArgs {
    pub name: String,
    pub team_mode: Option<bool>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTeamModeArgs {
    pub id: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn set_team_mode(state: State<'_, AppState>, args: SetTeamModeArgs) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE projects SET team_mode = ?1 WHERE id = ?2",
        params![args.enabled as i64, &args.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Legacy import ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyProjectScan {
    pub name: String,
    pub dir: String,
    pub completed_phases: Vec<String>,
    pub last_phase: String,
    pub already_exists: bool,
}

#[tauri::command]
pub fn scan_legacy_projects(
    state: State<AppState>,
    dir: String,
) -> Result<Vec<LegacyProjectScan>, String> {
    let path = std::path::Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    fn map_phase(p: &str) -> &str { if p == "competitor" { "research" } else { p } }

    // Lock held for the full scan; acceptable since project count is small (<50) and scan is user-initiated.
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }

        let status_path = entry_path.join("_status.json");
        if !status_path.exists() {
            continue;
        }

        let raw = match fs::read_to_string(&status_path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let json: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let name = match json["project"].as_str() {
            Some(n) => n.to_string(),
            None => entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        };

        let last_phase_str = json["last_phase"].as_str().unwrap_or("requirement");
        let last_phase = map_phase(last_phase_str).to_string();

        let mut completed_phases = Vec::new();
        if let Some(phases) = json["phases"].as_object() {
            for (phase, done) in phases {
                if done.as_bool().unwrap_or(false) {
                    let mapped = map_phase(phase.as_str());
                    if PHASES.contains(&mapped) {
                        completed_phases.push(mapped.to_string());
                    }
                }
            }
        }

        let already_exists: bool = db
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE name = ?1",
                params![&name],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        results.push(LegacyProjectScan {
            name,
            dir: entry_path.to_string_lossy().to_string(),
            completed_phases,
            last_phase,
            already_exists,
        });
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(results)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyProjectImport {
    pub name: String,
    pub dir: String,
    pub completed_phases: Vec<String>,
    pub last_phase: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

fn phase_output_file(phase: &str) -> Option<&'static str> {
    match phase {
        "requirement" => Some("01-requirement-draft.md"),
        "analysis"    => Some("02-analysis-report.md"),
        "research"    => Some("03-competitor-report.md"),
        "stories"     => Some("04-user-stories.md"),
        "prd"         => Some("05-prd"),
        "prototype"   => Some("06-prototype"),
        "review"      => Some("07-review-report.md"),
        _ => None,
    }
}

#[tauri::command]
pub fn import_legacy_projects(
    state: State<AppState>,
    projects: Vec<LegacyProjectImport>,
) -> Result<ImportResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let mut imported = 0usize;
    let mut skipped = 0usize;

    for p in projects {
        let exists: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE name = ?1",
                params![&p.name],
                |row| row.get(0),
            )
            .unwrap_or(1); // treat DB error as "exists" to avoid duplicate

        if exists > 0 {
            skipped += 1;
            continue;
        }

        let id = Uuid::new_v4().to_string();

        db.execute(
            "INSERT INTO projects (id, name, description, current_phase, output_dir, created_at, updated_at, team_mode)
             VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5, 0)",
            params![&id, &p.name, &p.last_phase, &p.dir, &now],
        )
        .map_err(|e| e.to_string())?;

        let completed_set: std::collections::HashSet<String> =
            p.completed_phases.iter().cloned().collect();

        for &phase in PHASES {
            let phase_id = Uuid::new_v4().to_string();
            let status = if completed_set.contains(phase) {
                "completed"
            } else if phase == p.last_phase {
                "in_progress"
            } else {
                "pending"
            };
            let output_file = if status == "completed" {
                phase_output_file(phase)
            } else {
                None
            };
            let completed_at: Option<&str> = if status == "completed" { Some(&now) } else { None };

            db.execute(
                "INSERT INTO project_phases (id, project_id, phase, status, output_file, completed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![&phase_id, &id, phase, status, output_file, completed_at],
            )
            .map_err(|e| e.to_string())?;
        }

        imported += 1;
    }

    Ok(ImportResult { imported, skipped })
}
