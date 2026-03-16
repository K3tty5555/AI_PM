use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub projects_dir: String,
    pub ai_pm_root: String,
    pub config_dir: String,
}
