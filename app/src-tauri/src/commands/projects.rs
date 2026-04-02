use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write as IoWrite;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;
use chrono::Utc;
use crate::state::AppState;

const PHASES: &[&str] = &[
    "office-hours", "requirement", "analysis", "research", "stories", "prd",
    "analytics", "prototype", "review", "retrospective",
];

/// Sanitize legacy phase names. Falls back to "office-hours" for unknown values.
fn sanitize_phase(phase: &str) -> &str {
    match phase {
        "review-modify" => "review",
        p if PHASES.contains(&p) => p,
        _ => "office-hours",
    }
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PhaseCheckpoint {
    pub pending_step: String,
    pub completed_steps: Vec<String>,
    pub total_steps: u32,
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpoint: Option<PhaseCheckpoint>,
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
    pub project_type: String,
    pub industry: String,
    pub motion_intensity: String,
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
    pub project_type: String,
    pub industry: String,
    pub motion_intensity: String,
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
                    GROUP_CONCAT(CASE WHEN pp.status = 'completed' THEN pp.phase END) as completed_phases,
                    COALESCE(p.project_type, 'general') as project_type,
                    COALESCE(p.industry, 'general') as industry,
                    COALESCE(p.motion_intensity, 'medium') as motion_intensity
             FROM projects p
             LEFT JOIN project_phases pp ON pp.project_id = p.id
             GROUP BY p.id
             ORDER BY p.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let projects: Vec<ProjectSummary> = stmt
        .query_map([], |row| {
            let raw_phase: String = row.get(3)?;
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                current_phase: sanitize_phase(&raw_phase).to_string(),
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
                project_type: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "general".to_string()),
                industry: row.get::<_, Option<String>>(11)?.unwrap_or_else(|| "general".to_string()),
                motion_intensity: row.get::<_, Option<String>>(12)?.unwrap_or_else(|| "medium".to_string()),
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
    let project_type = args.project_type.unwrap_or_else(|| "general".to_string());
    let industry = args.industry.unwrap_or_else(|| "general".to_string());

    // Phase 1: Create project directory (no lock needed)
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    // Phase 2: DB operations under the lock
    let phases = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        // Insert project
        db.execute(
            "INSERT INTO projects (id, name, description, current_phase, output_dir, created_at, updated_at, team_mode, project_type, industry)
             VALUES (?1, ?2, NULL, 'office-hours', ?3, ?4, ?4, ?5, ?6, ?7)",
            params![&id, &args.name, &output_dir, &now, &team_mode_int, &project_type, &industry],
        )
        .map_err(|e| e.to_string())?;

        // Insert phase records
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
                checkpoint: None,
            });
        }
        phases
        // db guard drops here
    };

    // Phase 3: Write _status.json for CLI skill compatibility (no lock held)
    write_status_json(&output_dir, &phases, "office-hours");

    Ok(ProjectDetail {
        id,
        name: args.name,
        description: None,
        current_phase: "office-hours".to_string(),
        output_dir,
        created_at: now.clone(),
        updated_at: now,
        team_mode: args.team_mode.unwrap_or(false),
        status: "active".to_string(),
        project_type: project_type,
        industry: industry,
        motion_intensity: "medium".to_string(),
        phases,
    })
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> Result<Option<ProjectDetail>, String> {
    // Phase 1: query DB under the lock
    let (pid, name, description, current_phase, output_dir, created_at, updated_at, team_mode_val, status, project_type_val, industry_val, motion_intensity_val, phases) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        let result: rusqlite::Result<(String, String, Option<String>, String, String, String, String, i64, String, String, String, String)> =
            db.query_row(
                "SELECT id, name, description, current_phase, output_dir, created_at, updated_at, COALESCE(team_mode, 0), COALESCE(status, 'active'), COALESCE(project_type, 'general'), COALESCE(industry, 'general'), COALESCE(motion_intensity, 'medium')
                 FROM projects WHERE id = ?1",
                params![&id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?)),
            );

        let (pid, name, description, current_phase, output_dir, created_at, updated_at, team_mode_val, status, project_type_val, industry_val, motion_intensity_val) = match result {
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
                    checkpoint: None,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        (pid, name, description, current_phase, output_dir, created_at, updated_at, team_mode_val, status, project_type_val, industry_val, motion_intensity_val, phases)
        // db guard drops here
    };

    // Phase 2: file I/O outside the lock
    // Auto-migrate legacy review file (07 → 08)
    migrate_review_file(&output_dir);

    // Read _status.json once, attach checkpoint to in-progress phases
    let status_json = read_status_json(&output_dir);
    let phases = phases
        .into_iter()
        .map(|mut p| {
            if p.status == "in_progress" {
                p.checkpoint = extract_checkpoint(&status_json, &p.phase);
            }
            p
        })
        .collect::<Vec<_>>();

    Ok(Some(ProjectDetail {
        id: pid,
        name,
        description,
        current_phase: sanitize_phase(&current_phase).to_string(),
        output_dir,
        created_at,
        updated_at,
        team_mode: team_mode_val != 0,
        status,
        project_type: project_type_val,
        industry: industry_val,
        motion_intensity: motion_intensity_val,
        phases,
    }))
}

#[tauri::command]
pub fn delete_project(state: State<AppState>, id: String) -> Result<(), String> {
    // Phase 1: query + delete from DB under the lock
    let output_dir: Option<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        let dir: Option<String> = db
            .query_row(
                "SELECT output_dir FROM projects WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .ok();

        db.execute("DELETE FROM projects WHERE id = ?1", params![&id])
            .map_err(|e| e.to_string())?;

        dir
        // db guard drops here
    };

    // Phase 2: delete project files from disk (no lock held)
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

    // Phase 1: query DB under the lock
    let (old_name, old_output_dir, new_output_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

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

        let new_output_dir = Path::new(&old_output_dir)
            .parent()
            .ok_or("无法解析项目路径")?
            .join(&new_name)
            .to_string_lossy()
            .to_string();

        (old_name, old_output_dir, new_output_dir)
        // db guard drops here
    };

    if old_name == new_name {
        return Ok(());
    }

    if Path::new(&new_output_dir).exists() {
        return Err(format!("目录「{}」已存在", new_name));
    }

    // Phase 2: rename filesystem directory (no lock held)
    fs::rename(&old_output_dir, &new_output_dir).map_err(|e| e.to_string())?;

    // Phase 3: update DB under the lock (rollback filesystem on failure)
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        let db_result = db.execute(
            "UPDATE projects SET name = ?1, output_dir = ?2, updated_at = ?3 WHERE id = ?4",
            params![&new_name, &new_output_dir, &now, &id],
        );
        if let Err(e) = db_result {
            let _ = fs::rename(&new_output_dir, &old_output_dir); // rollback
            return Err(e.to_string());
        }
        // db guard drops here
    }

    // Phase 4: update _status.json project name (best-effort, no lock needed)
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
    pub project_type: Option<String>,
    pub industry: Option<String>,
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

        let effective_phase = sanitize_phase(&current_phase);

        let Some(idx) = PHASES.iter().position(|&p| p == effective_phase) else {
            return Ok(None);
        };

        if idx >= PHASES.len() - 1 {
            return Ok(None);
        }

        // Mark current phase completed
        db.execute(
            "UPDATE project_phases SET status = 'completed', completed_at = ?1
             WHERE project_id = ?2 AND phase = ?3",
            params![&now, &id, &current_phase],
        )
        .map_err(|e| e.to_string())?;

        // Find next non-skipped phase
        let mut next_idx = idx + 1;
        while next_idx < PHASES.len() {
            let candidate = PHASES[next_idx];
            let candidate_status: String = db
                .query_row(
                    "SELECT status FROM project_phases WHERE project_id = ?1 AND phase = ?2",
                    params![&id, candidate],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "pending".to_string());
            if candidate_status != "skipped" {
                break;
            }
            next_idx += 1;
        }

        // All remaining phases are skipped — flow complete
        if next_idx >= PHASES.len() {
            return Ok(None);
        }

        let next_phase = PHASES[next_idx];

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
                    checkpoint: None,
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
                if p.status == "skipped" {
                    serde_json::Value::String("skipped".to_string())
                } else {
                    serde_json::Value::Bool(p.status == "completed")
                },
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

/// 读取 _status.json 并反序列化为 Value（失败时返回 None，不影响主流程）
fn read_status_json(output_dir: &str) -> Option<serde_json::Value> {
    let path = Path::new(output_dir).join("_status.json");
    let raw = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 从已解析的 status_json 中提取指定 phase 的 checkpoint
fn extract_checkpoint(status_json: &Option<serde_json::Value>, phase: &str) -> Option<PhaseCheckpoint> {
    let v = status_json.as_ref()?;
    let cp = v.get("checkpoints")?.get(phase)?;
    let pending_step = cp.get("pending_step")?.as_str()?.to_string();
    let completed_steps: Vec<String> = cp
        .get("completed_steps")?
        .as_array()?
        .iter()
        .filter_map(|s| s.as_str().map(String::from))
        .collect();
    let total_steps = match phase {
        "prd" => 9u32,
        "prototype" => 8u32,
        _ => 0u32,
    };
    if pending_step.is_empty() || total_steps == 0 {
        return None;
    }
    Some(PhaseCheckpoint { pending_step, completed_steps, total_steps })
}

/// 从 _status.json 读取 cost.total_estimate
fn read_total_tokens_from_status(output_dir: &str) -> Option<u64> {
    let v = read_status_json(output_dir)?;
    v.get("cost")?.get("total_estimate")?.as_u64().filter(|&n| n > 0)
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMotionIntensityArgs {
    pub id: String,
    pub intensity: String, // "low" | "medium" | "high"
}

#[tauri::command]
pub fn set_motion_intensity(state: State<'_, AppState>, args: SetMotionIntensityArgs) -> Result<(), String> {
    let valid = ["low", "medium", "high"];
    if !valid.contains(&args.intensity.as_str()) {
        return Err(format!("无效的动效档位: {}", args.intensity));
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE projects SET motion_intensity = ?1 WHERE id = ?2",
        params![&args.intensity, &args.id],
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
        "office-hours" => Some("00-office-hours.md"),
        "requirement" => Some("01-requirement-draft.md"),
        "analysis"    => Some("02-analysis-report.md"),
        "research"    => Some("03-competitor-report.md"),
        "stories"     => Some("04-user-stories.md"),
        "prd"         => Some("05-prd"),
        "prototype"   => Some("06-prototype"),
        "review"      => Some("08-review-report.md"),
        _ => None,
    }
}

/// Migrate legacy 07-review-report.md → 08-review-report.md
fn migrate_review_file(output_dir: &str) {
    let old_path = std::path::Path::new(output_dir).join("07-review-report.md");
    let new_path = std::path::Path::new(output_dir).join("08-review-report.md");
    if old_path.exists() && !new_path.exists() {
        let _ = std::fs::rename(&old_path, &new_path);
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

// ── Batch operations ──────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub succeeded: Vec<String>,
    pub failed: Vec<(String, String)>,
}

#[tauri::command]
pub fn batch_delete_projects(state: State<AppState>, ids: Vec<String>) -> Result<BatchResult, String> {
    if ids.is_empty() {
        return Ok(BatchResult { succeeded: vec![], failed: vec![] });
    }

    // Phase 1: DB transaction — collect output_dirs and delete records
    let mut dirs_to_delete: Vec<(String, String)> = Vec::new();
    let mut succeeded: Vec<String> = Vec::new();
    let mut failed: Vec<(String, String)> = Vec::new();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute("BEGIN IMMEDIATE", []).map_err(|e| e.to_string())?;

        for id in &ids {
            let dir: Option<String> = db
                .query_row(
                    "SELECT output_dir FROM projects WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .ok();

            match db.execute("DELETE FROM projects WHERE id = ?1", params![id]) {
                Ok(_) => {
                    if let Some(d) = dir {
                        dirs_to_delete.push((id.clone(), d));
                    }
                    succeeded.push(id.clone());
                }
                Err(e) => {
                    failed.push((id.clone(), e.to_string()));
                }
            }
        }

        db.execute("COMMIT", []).map_err(|e| e.to_string())?;
        // db guard drops here
    }

    // Phase 2: delete filesystem directories (best-effort, no lock held)
    for (id, dir) in dirs_to_delete {
        if Path::new(&dir).exists() {
            if let Err(e) = fs::remove_dir_all(&dir) {
                eprintln!("[batch_delete] Failed to remove dir for {}: {}", id, e);
            }
        }
    }

    Ok(BatchResult { succeeded, failed })
}

#[tauri::command]
pub fn batch_set_project_status(
    state: State<AppState>,
    ids: Vec<String>,
    status: String,
) -> Result<BatchResult, String> {
    if status != "active" && status != "completed" && status != "archived" {
        return Err(format!("无效状态: {}", status));
    }
    if ids.is_empty() {
        return Ok(BatchResult { succeeded: vec![], failed: vec![] });
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut succeeded: Vec<String> = Vec::new();
    let mut failed: Vec<(String, String)> = Vec::new();

    db.execute("BEGIN IMMEDIATE", []).map_err(|e| e.to_string())?;

    for id in &ids {
        match db.execute(
            "UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![&status, &now, id],
        ) {
            Ok(_) => succeeded.push(id.clone()),
            Err(e) => failed.push((id.clone(), e.to_string())),
        }
    }

    db.execute("COMMIT", []).map_err(|e| e.to_string())?;

    Ok(BatchResult { succeeded, failed })
}

#[tauri::command]
pub async fn export_projects_zip(state: State<'_, AppState>, ids: Vec<String>) -> Result<String, String> {
    if ids.is_empty() {
        return Err("没有选中的项目".to_string());
    }

    // Phase 1: collect output dirs under the lock
    let home_dir = dirs::home_dir().unwrap_or_default();
    let mut dirs_to_zip: Vec<(String, PathBuf)> = Vec::new();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for id in &ids {
            let result: Option<(String, String)> = db
                .query_row(
                    "SELECT name, output_dir FROM projects WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok();

            if let Some((name, dir)) = result {
                let dir_path = PathBuf::from(&dir);
                // Path traversal protection: must be under home directory
                let canonical = dir_path.canonicalize().map_err(|e| e.to_string())?;
                if !canonical.starts_with(&home_dir) {
                    return Err(format!("项目目录不在用户主目录下: {}", name));
                }
                if canonical.exists() {
                    dirs_to_zip.push((name, canonical));
                }
            }
        }
        // db guard drops here
    }

    if dirs_to_zip.is_empty() {
        return Err("选中的项目没有可导出的文件".to_string());
    }

    // Phase 2: create zip file in a blocking task
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let zip_name = format!("AI_PM_导出_{}.zip", timestamp);
    let downloads_dir = dirs::download_dir()
        .or_else(dirs::desktop_dir)
        .unwrap_or_else(|| home_dir.join("Downloads"));
    let zip_path = downloads_dir.join(&zip_name);
    let zip_path_clone = zip_path.clone();

    tokio::task::spawn_blocking(move || {
        let file = fs::File::create(&zip_path_clone)
            .map_err(|e| format!("创建 zip 文件失败: {}", e))?;
        let mut zip_writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for (project_name, dir) in &dirs_to_zip {
            for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() {
                    let relative = path.strip_prefix(dir).unwrap_or(path);
                    let archive_path = format!("{}/{}", project_name, relative.to_string_lossy());
                    zip_writer.start_file(&archive_path, options)
                        .map_err(|e| format!("zip 写入失败: {}", e))?;
                    let data = fs::read(path)
                        .map_err(|e| format!("读取文件失败: {}", e))?;
                    zip_writer.write_all(&data)
                        .map_err(|e| format!("zip 写入失败: {}", e))?;
                }
            }
        }

        zip_writer.finish().map_err(|e| format!("zip 完成失败: {}", e))?;
        Ok::<String, String>(zip_path_clone.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("导出任务失败: {}", e))?
}

// ── Phase skip ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkipSuggestion {
    pub phase: String,
    pub reason: String,
}

#[tauri::command]
pub fn suggest_skip_phases(
    state: State<AppState>,
    project_id: String,
) -> Result<Vec<SkipSuggestion>, String> {
    // Read analysis report content
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&project_id],
            |row| row.get(0),
        )
        .map_err(|_| "项目不存在".to_string())?
    };

    let analysis_path = Path::new(&output_dir).join("02-analysis-report.md");
    let content = fs::read_to_string(&analysis_path).unwrap_or_default().to_lowercase();

    let mut suggestions = Vec::new();

    // Rule 1: no competitor/market keywords → skip research
    let has_market_keywords = ["竞品", "竞争", "市场", "行业", "同类", "友商", "对手"]
        .iter()
        .any(|kw| content.contains(kw));
    if !has_market_keywords {
        suggestions.push(SkipSuggestion {
            phase: "research".to_string(),
            reason: "当前需求面向内部或已知领域，无需竞品分析".to_string(),
        });
    }

    // Rule 2: few features → skip stories
    let feature_count = content.matches("功能").count()
        + content.matches("模块").count()
        + content.matches("feature").count();
    if feature_count <= 3 {
        suggestions.push(SkipSuggestion {
            phase: "stories".to_string(),
            reason: "功能点较少，可直接撰写 PRD".to_string(),
        });
    }

    // Rule 3: no data/analytics keywords → skip analytics
    let has_data_keywords = ["数据", "埋点", "指标", "转化", "追踪", "漏斗", "analytics", "tracking"]
        .iter()
        .any(|kw| content.contains(kw));
    if !has_data_keywords {
        suggestions.push(SkipSuggestion {
            phase: "analytics".to_string(),
            reason: "当前需求以功能实现为主，未涉及数据追踪，建议跳过埋点设计".to_string(),
        });
    }

    // Rule 4: no UI/interaction keywords → skip prototype
    let has_ui_keywords = ["界面", "交互", "ui", "ux", "页面", "原型", "布局", "样式", "前端"]
        .iter()
        .any(|kw| content.contains(kw));
    if !has_ui_keywords {
        suggestions.push(SkipSuggestion {
            phase: "prototype".to_string(),
            reason: "当前需求以后端/API 为主，无需原型设计".to_string(),
        });
    }

    Ok(suggestions)
}

#[tauri::command]
pub fn skip_phases(
    state: State<AppState>,
    project_id: String,
    phases: Vec<String>,
) -> Result<(), String> {
    if phases.is_empty() {
        return Ok(());
    }

    // Reject skipping required phases
    let required = ["office-hours", "requirement", "prd"];
    for phase in &phases {
        if required.contains(&phase.as_str()) {
            return Err(format!("「{}」是核心阶段，不可跳过", phase));
        }
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    db.execute("BEGIN IMMEDIATE", []).map_err(|e| e.to_string())?;

    for phase in &phases {
        db.execute(
            "UPDATE project_phases SET status = 'skipped'
             WHERE project_id = ?1 AND phase = ?2 AND status = 'pending'",
            params![&project_id, phase],
        )
        .map_err(|e| e.to_string())?;
    }

    db.execute(
        "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        params![&now, &project_id],
    )
    .map_err(|e| e.to_string())?;

    db.execute("COMMIT", []).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn unskip_phase(
    state: State<AppState>,
    project_id: String,
    phase: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE project_phases SET status = 'pending'
         WHERE project_id = ?1 AND phase = ?2 AND status = 'skipped'",
        params![&project_id, &phase],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Prompt overrides ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_project_prompts(
    state: State<AppState>,
    project_id: String,
) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT phase, prompt_text FROM project_prompt_overrides WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let map: HashMap<String, String> = stmt
        .query_map(params![&project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(map)
}

#[tauri::command]
pub fn save_project_prompt(
    state: State<AppState>,
    project_id: String,
    phase: String,
    prompt_text: String,
) -> Result<(), String> {
    if prompt_text.len() > 4000 {
        return Err("补充指令不能超过 4000 字符".to_string());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if prompt_text.trim().is_empty() {
        db.execute(
            "DELETE FROM project_prompt_overrides WHERE project_id = ?1 AND phase = ?2",
            params![&project_id, &phase],
        ).map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT OR REPLACE INTO project_prompt_overrides (project_id, phase, prompt_text) VALUES (?1, ?2, ?3)",
            params![&project_id, &phase, &prompt_text],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_project_prompts(
    state: State<AppState>,
    project_id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM project_prompt_overrides WHERE project_id = ?1",
        params![&project_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Phase prerequisites check ────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrerequisiteItem {
    pub id: String,
    pub label: String,
    pub passed: bool,
    pub check_type: String,  // "auto" | "manual"
    pub hint: Option<String>,
    pub navigate_to: Option<String>,
}

#[tauri::command]
pub fn check_phase_prerequisites(
    state: State<'_, AppState>,
    project_id: String,
    phase_id: String,
) -> Result<Vec<PrerequisiteItem>, String> {
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            rusqlite::params![&project_id],
            |row| row.get(0),
        ).map_err(|_| "项目不存在".to_string())?
    };

    let dir = PathBuf::from(&output_dir);
    let mut items = Vec::new();

    match phase_id.as_str() {
        "prd" => {
            // Check analysis report exists
            let analysis_exists = dir.join("02-analysis-report.md").exists();
            items.push(PrerequisiteItem {
                id: "analysis".to_string(),
                label: "需求分析报告".to_string(),
                passed: analysis_exists,
                check_type: "auto".to_string(),
                hint: if analysis_exists { None } else { Some("建议先完成需求分析（Phase 2）".to_string()) },
                navigate_to: Some("analysis".to_string()),
            });

            // Check competitor report exists
            let competitor_exists = dir.join("03-competitor-report.md").exists();
            items.push(PrerequisiteItem {
                id: "research".to_string(),
                label: "竞品研究报告".to_string(),
                passed: competitor_exists,
                check_type: "auto".to_string(),
                hint: if competitor_exists { None } else { Some("建议先完成竞品研究（Phase 3）".to_string()) },
                navigate_to: Some("research".to_string()),
            });

            // Check user stories exists
            let stories_exists = dir.join("04-user-stories.md").exists();
            items.push(PrerequisiteItem {
                id: "stories".to_string(),
                label: "用户故事".to_string(),
                passed: stories_exists,
                check_type: "auto".to_string(),
                hint: if stories_exists { None } else { Some("建议先完成用户故事（Phase 4）".to_string()) },
                navigate_to: Some("stories".to_string()),
            });
        }
        "prototype" => {
            // Check PRD exists
            let prd_exists = dir.join("05-prd").join("05-PRD-v1.0.md").exists();
            items.push(PrerequisiteItem {
                id: "prd".to_string(),
                label: "PRD 文档".to_string(),
                passed: prd_exists,
                check_type: "auto".to_string(),
                hint: if prd_exists { None } else { Some("需要先生成 PRD（Phase 5）".to_string()) },
                navigate_to: Some("prd".to_string()),
            });
        }
        _ => {
            // Other phases: no prerequisites
        }
    }

    Ok(items)
}
