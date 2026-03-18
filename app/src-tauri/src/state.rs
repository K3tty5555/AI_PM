use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub projects_dir: String,
    pub config_dir: String,
}

impl AppState {
    /// {projects_dir}/projects/ — where project file directories live
    pub fn projects_base(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.projects_dir).join("projects")
    }

    /// {projects_dir}/templates/ — where knowledge-base, prd-styles, ui-specs live
    pub fn templates_base(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.projects_dir).join("templates")
    }
}
