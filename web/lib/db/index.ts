import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "ai-pm.db");

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  current_phase TEXT NOT NULL DEFAULT 'requirement',
  output_dir TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
`;

function createDb() {
  // 确保 data/ 目录存在
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  // 开启 WAL 模式 & 外键约束
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // 自动建表
  sqlite.exec(INIT_SQL);

  return drizzle(sqlite, { schema });
}

// 处理 Next.js HMR 热重载导致的多次初始化
const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle>;
};

export const db = globalForDb.db || createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
