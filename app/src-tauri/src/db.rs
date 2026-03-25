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

        CREATE TABLE IF NOT EXISTS brainstorm_messages (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            phase TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            seq INTEGER NOT NULL
        );

        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
    ")?;

    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_bs_proj_phase ON brainstorm_messages(project_id, phase, seq)", []);

    // ── Schema version management ───────────────────────────────────────
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);"
    )?;

    let current_version: i32 = conn.query_row(
        "SELECT version FROM schema_version WHERE id = 1",
        [],
        |row| row.get(0),
    )?;

    // Version 1: add team_mode + status columns (ignore errors for backward compat)
    if current_version < 1 {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN team_mode INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'", []);
        conn.execute("UPDATE schema_version SET version = 1 WHERE id = 1", [])?;
    }

    // Version 2: add project_type column
    if current_version < 2 {
        conn.execute("ALTER TABLE projects ADD COLUMN project_type TEXT DEFAULT 'general'", [])
            .map_err(|e| {
                eprintln!("Migration v2 failed (project_type): {e}");
                e
            })?;
        conn.execute("UPDATE schema_version SET version = 2 WHERE id = 1", [])?;
    }

    // Version 3: create project_prompt_overrides table
    if current_version < 3 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS project_prompt_overrides (
                project_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                prompt_text TEXT NOT NULL,
                PRIMARY KEY (project_id, phase)
            );"
        ).map_err(|e| {
            eprintln!("Migration v3 failed (project_prompt_overrides): {e}");
            e
        })?;
        conn.execute("UPDATE schema_version SET version = 3 WHERE id = 1", [])?;
    }

    Ok(conn)
}
