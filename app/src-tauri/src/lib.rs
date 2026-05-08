mod commands;
mod db;
mod providers;
mod state;

use db::init_db;
use state::AppState;
use std::fs;

#[cfg(desktop)]
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(debug_assertions)]
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
    struct Row {
        id: String,
        name: String,
        output_dir: String,
    }

    let rows: Vec<Row> = db
        .prepare("SELECT id, name, output_dir FROM projects")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| {
                Ok(Row {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    output_dir: row.get(2)?,
                })
            })
            .map(|mapped| {
                mapped
                    .filter_map(|r| r.ok())
                    .filter(|r| {
                        let prefix = format!("{}/", projects_dir);
                        r.output_dir.starts_with(&prefix)
                            && !r
                                .output_dir
                                .starts_with(&format!("{}/projects/", projects_dir))
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
            eprintln!(
                "[migrate_v2] Skipping '{}': source dir not found on disk",
                row.name
            );
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
        illustration_lock: std::sync::Mutex::new(()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::brainstorm::load_brainstorm_messages,
            commands::brainstorm::save_brainstorm_message,
            commands::brainstorm::clear_brainstorm,
            commands::brainstorm::brainstorm_message_count,
            commands::brainstorm::brainstorm_chat,
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
            commands::files::read_project_file_base64,
            commands::files::save_project_file,
            commands::files::read_file,
            commands::files::list_project_context,
            commands::files::export_prd_docx,
            commands::files::export_prd_share_html,
            commands::files::list_prd_versions,
            commands::files::get_latest_prd_version,
            commands::files::list_prd_files,
            commands::files::list_prototype_versions,
            commands::files::set_prd_version_meta,
            commands::files::set_prototype_version_meta,
            commands::files::list_memory_files,
            commands::files::reveal_file,
            commands::files::open_file,
            commands::files::write_file,
            commands::files::upload_reference_file,
            commands::files::list_reference_files,
            commands::files::delete_reference_file,
            commands::files::get_project_design_spec,
            commands::files::set_project_design_spec,
            commands::files::extract_docx_text,
            commands::files::score_prd,
            commands::files::scan_sensitive,
            commands::files::scan_placeholders,
            commands::files::list_docx_recipes,
            commands::files::list_pdf_covers,
            commands::files::export_prd_pdf,
            commands::env::check_env,
            commands::env::install_dep,
            commands::env::check_playwright_mcp,
            commands::env::run_diagnostics,
            commands::env::cancel_diagnostics,
            commands::stream::start_stream,
            commands::tools::run_tool,
            commands::tools::list_weekly_reports,
            commands::tools::get_weekly_report,
            commands::tools::delete_weekly_report,
            commands::tools::list_priority_reports,
            commands::tools::get_priority_report,
            commands::tools::delete_priority_report,
            commands::tools::fetch_url_content,
            commands::knowledge::list_knowledge,
            commands::knowledge::add_knowledge,
            commands::knowledge::delete_knowledge,
            commands::knowledge::cleanup_auto_knowledge,
            commands::knowledge::search_knowledge,
            commands::knowledge::get_knowledge_content,
            commands::knowledge::recommend_knowledge,
            commands::knowledge::extract_knowledge_candidates,
            commands::config::get_projects_dir,
            commands::config::save_projects_dir,
            commands::config::test_cli_config,
            commands::projects::set_team_mode,
            commands::projects::get_agent_errors,
            commands::projects::clear_agent_errors,
            commands::projects::scan_legacy_projects,
            commands::projects::import_legacy_projects,
            commands::projects::migrate_projects_to_app_dir,
            commands::projects::set_project_status,
            commands::projects::batch_delete_projects,
            commands::projects::batch_set_project_status,
            commands::projects::export_projects_zip,
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
            commands::templates::delete_prd_style,
            commands::templates::list_prd_samples,
            commands::templates::get_prd_sample_content,
            commands::projects::check_phase_prerequisites,
            commands::projects::rename_project,
            commands::projects::suggest_skip_phases,
            commands::projects::skip_phases,
            commands::projects::unskip_phase,
            commands::projects::get_project_prompts,
            commands::projects::save_project_prompt,
            commands::projects::clear_project_prompts,
            commands::update::check_update,
            commands::update::download_and_install_update,
            commands::instincts::list_instincts,
            commands::instincts::record_instinct_candidate,
            commands::instincts::confirm_instinct,
            commands::instincts::delete_instinct,
            commands::illustration::get_illustration_config,
            commands::illustration::save_illustration_config,
            commands::illustration::generate_illustration,
            commands::illustration::list_illustrations,
            commands::illustration::read_local_image,
            commands::illustration::test_illustration_key,
            commands::illustration::delete_illustration,
            commands::illustration::scan_prd_mermaid,
            commands::illustration::embed_illustration_in_prd,
            commands::prototype_context::get_codebase_fingerprint,
            commands::prototype_context::extract_codebase_fingerprint,
            commands::plaza::load_plaza_manifest,
            commands::plaza::run_plaza_skill,
            commands::plaza::get_plaza_api_config,
            commands::plaza::save_plaza_api_config,
            commands::tools::analyze_screenshot,
            commands::tools::capture_url_screenshot,
            commands::projects::set_motion_intensity,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/128x128@2x.png"));
            }

            // ── Native macOS menu bar (Windows uses custom titlebar) ─────
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle();

                // File menu
                let file_menu = SubmenuBuilder::new(handle, "文件")
                    .text("new-project", "新建项目")
                    .separator()
                    .close_window()
                    .build()?;

                // Edit menu (standard system items)
                let edit_menu = SubmenuBuilder::new(handle, "编辑")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                // View menu
                let toggle_sidebar = MenuItemBuilder::with_id("toggle-sidebar", "切换侧边栏")
                    .accelerator("CmdOrCtrl+B")
                    .build(handle)?;
                let toggle_theme = MenuItemBuilder::with_id("toggle-theme", "切换主题")
                    .accelerator("CmdOrCtrl+D")
                    .build(handle)?;
                let command_palette = MenuItemBuilder::with_id("command-palette", "命令面板")
                    .accelerator("CmdOrCtrl+K")
                    .build(handle)?;

                let view_menu = SubmenuBuilder::new(handle, "视图")
                    .item(&toggle_sidebar)
                    .item(&toggle_theme)
                    .separator()
                    .item(&command_palette)
                    .build()?;

                // Window menu
                let window_menu = SubmenuBuilder::new(handle, "窗口")
                    .minimize()
                    .maximize()
                    .separator()
                    .close_window()
                    .build()?;

                // Help menu
                let help_menu = SubmenuBuilder::new(handle, "帮助")
                    .text("about", "关于 AI PM")
                    .text("check-update", "检查更新")
                    .build()?;

                let menu = MenuBuilder::new(handle)
                    .items(&[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
                    .build()?;

                app.set_menu(menu)?;

                // Handle custom menu events → emit to frontend
                app.on_menu_event(|app_handle, event| {
                    let id = event.id().as_ref();
                    match id {
                        "new-project" | "toggle-sidebar" | "toggle-theme" | "command-palette"
                        | "check-update" | "about" => {
                            let _ = app_handle.emit("menu-action", id);
                        }
                        _ => {}
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
