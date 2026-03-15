import fs from "fs";
import path from "path";
import os from "os";

// ── 项目输出目录解析 ──────────────────────────────────────────

function resolveProjectsDir(): string {
  // 1. 读取 ~/.ai-pm-config
  const configPath = path.join(os.homedir(), ".ai-pm-config");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    if (config.projects_dir && typeof config.projects_dir === "string") {
      return config.projects_dir;
    }
  } catch {
    // 文件不存在或解析失败，走 fallback
  }

  // 2. 环境变量 AI_PM_ROOT
  if (process.env.AI_PM_ROOT) {
    return path.join(process.env.AI_PM_ROOT, "output", "projects");
  }

  // 3. 默认值：当前工作目录
  return path.join(process.cwd(), "output", "projects");
}

export const PROJECTS_DIR: string = resolveProjectsDir();

// ── 文件操作 ─────────────────────────────────────────────────

/**
 * 确保项目目录存在，返回绝对路径
 */
export function ensureProjectDir(projectName: string): string {
  const dir = path.join(PROJECTS_DIR, projectName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 读取项目文件内容，文件不存在返回 null
 */
export function readProjectFile(
  projectName: string,
  fileName: string
): string | null {
  const filePath = path.join(PROJECTS_DIR, projectName, fileName);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * 写入项目文件
 */
export function writeProjectFile(
  projectName: string,
  fileName: string,
  content: string
): void {
  const dir = ensureProjectDir(projectName);
  const filePath = path.join(dir, fileName);

  // 确保子目录存在
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * 列出项目目录下的所有文件（不递归）
 */
export function listProjectFiles(projectName: string): string[] {
  const dir = path.join(PROJECTS_DIR, projectName);
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * 写入 _status.json（与 Claude Code 版兼容格式）
 */
export function writeStatusJson(
  projectName: string,
  phases: Record<string, boolean>,
  lastPhase: string
): void {
  const status = {
    phases,
    lastPhase,
    updatedAt: new Date().toISOString(),
  };
  writeProjectFile(projectName, "_status.json", JSON.stringify(status, null, 2));
}
