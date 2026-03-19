use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json;
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
    pub status: String,
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
    pub status: String,
    pub phases: Vec<ProjectPhase>,
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectSummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Fix 3: Replace N+1 queries with a single JOIN query
    let mut stmt = db
        .prepare(
            "SELECT p.id, p.name, p.description, p.current_phase, p.output_dir, p.created_at, p.updated_at, p.status,
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
                status: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "active".to_string()),
                completed_count: row.get(8)?,
                total_phases: PHASES.len() as i64,
                completed_phases: row.get::<_, Option<String>>(9)?
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
    let output_dir = state.projects_base().join(&args.name).to_string_lossy().to_string();
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
        status: "active".to_string(),
        phases,
    })
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> Result<Option<ProjectDetail>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let result: rusqlite::Result<(String, String, Option<String>, String, String, String, String, i64, String)> =
        db.query_row(
            "SELECT id, name, description, current_phase, output_dir, created_at, updated_at, COALESCE(team_mode, 0), COALESCE(status, 'active')
             FROM projects WHERE id = ?1",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?)),
        );

    let (pid, name, description, current_phase, output_dir, created_at, updated_at, team_mode_val, status) = match result {
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
        status,
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

#[tauri::command]
pub fn rename_project(
    state: State<AppState>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    // Validate: non-empty, no path separators or traversal
    if new_name.is_empty()
        || new_name.contains('/')
        || new_name.contains('\\')
        || new_name.contains('\0')
        || new_name.contains("..")
    {
        return Err(format!("无效的项目名称: {}", new_name));
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // Get current name and output_dir
    let (old_name, old_output_dir): (String, String) = db
        .query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "项目不存在".to_string())?;

    if old_name == new_name {
        return Ok(());
    }

    // Check new name not used by another project
    let count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE name = ?1 AND id != ?2",
            params![&new_name, &id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!("名称「{}」已存在", new_name));
    }

    // Build new output_dir
    let new_output_dir = Path::new(&old_output_dir)
        .parent()
        .ok_or("无法解析项目路径")?
        .join(&new_name)
        .to_string_lossy()
        .to_string();

    if Path::new(&new_output_dir).exists() {
        return Err(format!("目录「{}」已存在", new_name));
    }

    // Phase 1: rename filesystem directory
    fs::rename(&old_output_dir, &new_output_dir).map_err(|e| e.to_string())?;

    // Phase 2: update DB (rollback filesystem on failure)
    let db_result = db.execute(
        "UPDATE projects SET name = ?1, output_dir = ?2, updated_at = ?3 WHERE id = ?4",
        params![&new_name, &new_output_dir, &now, &id],
    );
    if let Err(e) = db_result {
        let _ = fs::rename(&new_output_dir, &old_output_dir); // rollback
        return Err(e.to_string());
    }

    // Phase 3: update _status.json project name (best-effort)
    let status_path = Path::new(&new_output_dir).join("_status.json");
    if let Ok(raw) = fs::read_to_string(&status_path) {
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&raw) {
            v["project"] = serde_json::Value::String(new_name.clone());
            if let Ok(updated) = serde_json::to_string_pretty(&v) {
                let _ = fs::write(&status_path, updated);
            }
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

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_symlink() {
            // skip symlinks — avoid infinite loops on cyclic links
            continue;
        } else if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn import_legacy_projects(
    state: State<AppState>,
    projects: Vec<LegacyProjectImport>,
) -> Result<ImportResult, String> {
    let now = Utc::now().to_rfc3339();

    // ── Phase 1: check duplicates and assign IDs under the lock ───────────
    struct PendingImport {
        id: String,
        project: LegacyProjectImport,
    }

    let (pending, skipped) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut pending: Vec<PendingImport> = Vec::new();
        let mut skipped = 0usize;

        for p in projects {
            let exists: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM projects WHERE name = ?1",
                    params![&p.name],
                    |row| row.get(0),
                )
                .unwrap_or(1);

            if exists > 0 {
                skipped += 1;
                continue;
            }

            pending.push(PendingImport {
                id: Uuid::new_v4().to_string(),
                project: p,
            });
        }
        (pending, skipped)
        // db guard drops here
    };

    // ── Phase 2: file copy (no lock held) ─────────────────────────────────
    struct ReadyImport {
        id: String,
        project: LegacyProjectImport,
        output_dir: String,
    }

    let mut ready: Vec<ReadyImport> = Vec::new();
    let projects_base = state.projects_base();
    let target_base = projects_base.as_path();

    for pi in pending {
        let preferred = target_base.join(&pi.project.name);
        let target_dir_opt: Option<std::path::PathBuf> = if !preferred.exists() {
            Some(preferred)
        } else {
            let fallback = target_base.join(format!("{}-imported", &pi.project.name));
            if fallback.exists() {
                None
            } else {
                Some(fallback)
            }
        };

        let output_dir = match target_dir_opt {
            Some(target_dir) => match copy_dir_recursive(std::path::Path::new(&pi.project.dir), &target_dir) {
                Ok(()) => target_dir.to_string_lossy().to_string(),
                Err(e) => {
                    eprintln!("[import] Failed to copy '{}': {}", pi.project.name, e);
                    let _ = std::fs::remove_dir_all(&target_dir);
                    pi.project.dir.clone()
                }
            },
            None => {
                eprintln!("[import] Target dirs for '{}' already exist, using original path", pi.project.name);
                pi.project.dir.clone()
            }
        };

        ready.push(ReadyImport {
            id: pi.id,
            project: pi.project,
            output_dir,
        });
    }

    // ── Phase 3: DB inserts under the lock ────────────────────────────────
    let mut imported = 0usize;

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        for ri in ready {
            db.execute(
                "INSERT INTO projects (id, name, description, current_phase, output_dir, created_at, updated_at, team_mode)
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5, 0)",
                params![&ri.id, &ri.project.name, &ri.project.last_phase, &ri.output_dir, &now],
            )
            .map_err(|e| e.to_string())?;

            let completed_set: std::collections::HashSet<String> =
                ri.project.completed_phases.iter().cloned().collect();

            for &phase in PHASES {
                let phase_id = Uuid::new_v4().to_string();
                let status = if completed_set.contains(phase) {
                    "completed"
                } else if phase == ri.project.last_phase {
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
                    params![&phase_id, &ri.id, phase, status, output_file, completed_at],
                )
                .map_err(|e| e.to_string())?;
            }

            imported += 1;
        }
        // db guard drops here
    }

    Ok(ImportResult { imported, skipped })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateFailure {
    pub name: String,
    pub error: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub migrated: usize,
    pub skipped: usize,
    pub failed: Vec<MigrateFailure>,
}

#[tauri::command]
pub fn migrate_projects_to_app_dir(state: State<AppState>) -> Result<MigrateResult, String> {
    let projects_base = state.projects_base();

    // ── Phase 1: collect rows under the lock, then release it ──────────────
    let rows = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        struct Row {
            id: String,
            name: String,
            output_dir: String,
        }

        let mut stmt = db
            .prepare("SELECT id, name, output_dir FROM projects")
            .map_err(|e| e.to_string())?;

        let collected = stmt.query_map([], |row| {
                Ok(Row {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    output_dir: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter(|r| !std::path::Path::new(&r.output_dir).starts_with(&projects_base))
            .collect::<Vec<_>>();
        collected
        // db guard drops here
    };

    // ── Phase 2: filesystem work (no lock held) ────────────────────────────
    let mut migrated = 0usize;
    let mut skipped = 0usize;
    let mut failed: Vec<MigrateFailure> = Vec::new();
    // Collect (id, new_path) pairs for successful copies
    let mut updates: Vec<(String, String)> = Vec::new();

    let target_base = projects_base.as_path();

    for row in &rows {
        let src = std::path::Path::new(&row.output_dir);
        if !src.exists() {
            skipped += 1;
            continue;
        }

        let preferred = target_base.join(&row.name);
        let target_dir_opt: Option<std::path::PathBuf> = if !preferred.exists() {
            Some(preferred)
        } else {
            let fallback = target_base.join(format!("{}-imported", &row.name));
            if fallback.exists() {
                None
            } else {
                Some(fallback)
            }
        };

        let target_dir = match target_dir_opt {
            None => {
                failed.push(MigrateFailure {
                    name: row.name.clone(),
                    error: "Target directory already exists".to_string(),
                });
                continue;
            }
            Some(d) => d,
        };

        match copy_dir_recursive(src, &target_dir) {
            Ok(()) => {
                updates.push((row.id.clone(), target_dir.to_string_lossy().to_string()));
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&target_dir);
                failed.push(MigrateFailure {
                    name: row.name.clone(),
                    error: e.to_string(),
                });
            }
        }
    }

    // ── Phase 3: DB updates under the lock ────────────────────────────────
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for (id, new_path) in updates {
            // Find the name for error reporting
            let name = rows.iter()
                .find(|r| r.id == id)
                .map(|r| r.name.clone())
                .unwrap_or_else(|| id.clone());
            match db.execute(
                "UPDATE projects SET output_dir = ?1 WHERE id = ?2",
                params![&new_path, &id],
            ) {
                Ok(_) => migrated += 1,
                Err(e) => {
                    // rollback the copied directory
                    let _ = std::fs::remove_dir_all(&new_path);
                    failed.push(MigrateFailure {
                        name,
                        error: e.to_string(),
                    });
                }
            }
        }
    }

    Ok(MigrateResult { migrated, skipped, failed })
}

#[tauri::command]
pub fn set_project_status(state: State<AppState>, id: String, status: String) -> Result<(), String> {
    if status != "active" && status != "completed" {
        return Err(format!("无效状态: {}", status));
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![&status, &now, &id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
