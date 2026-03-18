mod providers;
mod commands;
mod db;
mod state;

use db::init_db;
use state::AppState;
use std::fs;
use tauri::Manager;

fn resolve_app_paths() -> (String, String) {
    let home = dirs::home_dir().unwrap_or_default();
    let config_dir = home
        .join(".config")
        .join("ai-pm")
        .to_string_lossy()
        .to_string();

    // Default projects dir: ~/Documents/AI PM
    let default_projects_dir = home
        .join("Documents")
        .join("AI PM")
        .to_string_lossy()
        .to_string();

    // Priority 1: app config.json (projectsDir key)
    let app_config_path = format!("{}/config.json", config_dir);
    let projects_dir: String = if let Ok(raw) = fs::read_to_string(&app_config_path) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            cfg["projectsDir"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| default_projects_dir.clone())
        } else {
            default_projects_dir.clone()
        }
    } else {
        default_projects_dir.clone()
    };

    (projects_dir, config_dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (projects_dir, config_dir) = resolve_app_paths();

    // Ensure data directories exist
    fs::create_dir_all(&projects_dir).ok();
    fs::create_dir_all(&config_dir).ok();

    // Init SQLite database
    let db_path = format!("{}/ai_pm.db", config_dir);
    let conn = init_db(&db_path).expect("Failed to initialize database");

    let state = AppState {
        db: std::sync::Mutex::new(conn),
        projects_dir,
        config_dir,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
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
            commands::files::read_file,
            commands::files::list_project_context,
            commands::stream::start_stream,
            commands::tools::run_tool,
            commands::knowledge::list_knowledge,
            commands::knowledge::add_knowledge,
            commands::knowledge::delete_knowledge,
            commands::config::get_projects_dir,
            commands::config::save_projects_dir,
            commands::config::test_cli_config,
            commands::projects::scan_legacy_projects,
            commands::projects::import_legacy_projects,
            commands::templates::scan_legacy_knowledge,
            commands::templates::import_legacy_knowledge,
            commands::templates::scan_legacy_design_specs,
            commands::templates::import_legacy_design_specs,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/128x128@2x.png"));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
