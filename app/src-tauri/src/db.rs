use rusqlite::{Connection, Result};

pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            current_phase TEXT NOT NULL DEFAULT 'requirement',
            output_dir TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            team_mode INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS project_phases (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            phase TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            output_file TEXT,
            started_at TEXT,
            completed_at TEXT
        );

        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
    ")?;

    // Migration: add team_mode if not exists (for existing databases)
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN team_mode INTEGER NOT NULL DEFAULT 0", []);

    // Migration: add status if not exists
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'", []);

    Ok(conn)
}
