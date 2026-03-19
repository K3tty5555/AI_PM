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

fn migrate_dir_structure_v2(projects_dir: &str, config_dir: &str, db: &rusqlite::Connection) {
    let marker = std::path::Path::new(config_dir).join("migrated_v2");
    if marker.exists() {
        return;
    }

    let root = std::path::Path::new(projects_dir);
    let projects_base = root.join("projects");
    let templates_base = root.join("templates");

    // Create new subdirectory structure
    let _ = fs::create_dir_all(&projects_base);
    let _ = fs::create_dir_all(&templates_base);

    // Migrate flat template directories
    for name in &["knowledge-base", "prd-styles", "ui-specs"] {
        let old = root.join(name);
        let new = templates_base.join(name);
        if old.exists() && !new.exists() {
            if let Err(e) = fs::rename(&old, &new) {
                eprintln!("[migrate_v2] Failed to move {}: {}", name, e);
            }
        }
    }

    // Migrate project directories via DB
    struct Row { id: String, name: String, output_dir: String }

    let rows: Vec<Row> = db
        .prepare("SELECT id, name, output_dir FROM projects")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| Ok(Row {
                id: row.get(0)?,
                name: row.get(1)?,
                output_dir: row.get(2)?,
            }))
            .map(|mapped| {
                mapped
                    .filter_map(|r| r.ok())
                    .filter(|r| {
                        let prefix = format!("{}/", projects_dir);
                        r.output_dir.starts_with(&prefix)
                            && !r.output_dir.starts_with(&format!("{}/projects/", projects_dir))
                    })
                    .collect()
            })
        })
        .unwrap_or_default();

    for row in rows {
        let new_dir = projects_base.join(&row.name);
        let new_path = new_dir.to_string_lossy().to_string();

        // Move files on disk
        let old_path = std::path::Path::new(&row.output_dir);
        if old_path.exists() {
            if new_dir.exists() {
                // destination already exists (partial migration?), skip disk move but update DB
            } else if let Err(e) = fs::rename(old_path, &new_dir) {
                eprintln!("[migrate_v2] Failed to move project '{}': {}", row.name, e);
                continue; // don't update DB if move failed
            }
        } else {
            // Source doesn't exist on disk — skip both disk move and DB update
            eprintln!("[migrate_v2] Skipping '{}': source dir not found on disk", row.name);
            continue;
        }

        // Update DB (only reached if move succeeded or destination already existed)
        let _ = db.execute(
            "UPDATE projects SET output_dir = ?1 WHERE id = ?2",
            rusqlite::params![&new_path, &row.id],
        );
    }

    // Write marker so this never runs again
    let _ = fs::write(&marker, "v2");
    eprintln!("[migrate_v2] Migration complete");
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

    // One-time directory structure migration (flat → projects/ + templates/)
    migrate_dir_structure_v2(&projects_dir, &config_dir, &conn);

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
            commands::files::export_prd_docx,
            commands::files::reveal_file,
            commands::files::open_file,
            commands::files::write_file,
            commands::env::check_env,
            commands::env::install_dep,
            commands::env::check_playwright_mcp,
            commands::stream::start_stream,
            commands::tools::run_tool,
            commands::tools::fetch_url_content,
            commands::knowledge::list_knowledge,
            commands::knowledge::add_knowledge,
            commands::knowledge::delete_knowledge,
            commands::knowledge::search_knowledge,
            commands::knowledge::get_knowledge_content,
            commands::config::get_projects_dir,
            commands::config::save_projects_dir,
            commands::config::test_cli_config,
            commands::projects::set_team_mode,
            commands::projects::scan_legacy_projects,
            commands::projects::import_legacy_projects,
            commands::projects::migrate_projects_to_app_dir,
            commands::projects::set_project_status,
            commands::templates::scan_legacy_knowledge,
            commands::templates::import_legacy_knowledge,
            commands::templates::list_prd_styles,
            commands::templates::scan_legacy_prd_styles,
            commands::templates::import_legacy_prd_styles,
            commands::templates::scan_legacy_ui_specs,
            commands::templates::import_legacy_ui_specs,
            commands::templates::list_ui_specs,
            commands::templates::add_ui_spec,
            commands::templates::set_active_prd_style,
            commands::templates::get_active_prd_style,
            commands::templates::get_prd_style_content,
            commands::templates::get_ui_spec_content,
            commands::templates::rename_prd_style,
            commands::templates::rename_ui_spec,
            commands::templates::delete_ui_spec,
            commands::projects::rename_project,
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
