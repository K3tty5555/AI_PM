mod commands;
mod db;
mod state;

use db::init_db;
use state::AppState;
use std::fs;
use std::path::Path;

fn resolve_app_paths() -> (String, String, String) {
    let home = dirs::home_dir().unwrap_or_default();
    let config_path = home.join(".ai-pm-config");

    let projects_dir: String;
    let ai_pm_root: String;

    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(pd) = config["projects_dir"].as_str() {
                projects_dir = pd.to_string();
                // Derive ai_pm_root by going up 2 levels from output/projects
                let p = Path::new(pd);
                ai_pm_root = p
                    .parent() // output/
                    .and_then(|p| p.parent()) // AI_PM/
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| pd.to_string());
            } else {
                projects_dir = format!("{}/output/projects", home.display());
                ai_pm_root = format!("{}/AI_PM", home.display());
            }
        } else {
            projects_dir = format!("{}/output/projects", home.display());
            ai_pm_root = format!("{}/AI_PM", home.display());
        }
    } else {
        projects_dir = format!("{}/output/projects", home.display());
        ai_pm_root = format!("{}/AI_PM", home.display());
    }

    let config_dir = home
        .join(".config")
        .join("ai-pm")
        .to_string_lossy()
        .to_string();

    (projects_dir, ai_pm_root, config_dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (projects_dir, ai_pm_root, config_dir) = resolve_app_paths();

    // Ensure data directories exist
    fs::create_dir_all(&projects_dir).ok();
    fs::create_dir_all(&config_dir).ok();

    // Init SQLite database
    let db_path = format!("{}/ai_pm.db", config_dir);
    let conn = init_db(&db_path).expect("Failed to initialize database");

    let state = AppState {
        db: std::sync::Mutex::new(conn),
        projects_dir,
        ai_pm_root,
        config_dir,
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::save_config,
            commands::config::test_config,
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::get_project,
            commands::projects::delete_project,
            commands::projects::advance_phase,
            commands::projects::update_phase,
            commands::files::read_project_file,
            commands::files::save_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
