import { eq, desc } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  projects,
  projectPhases,
  PHASES,
  type Phase,
  type Project,
  type ProjectPhase,
} from "./db/schema";
import * as schema from "./db/schema";
import { db as defaultDb } from "./db";
import { ensureProjectDir, writeStatusJson } from "./file-manager";
import crypto from "crypto";

// ── 类型 ─────────────────────────────────────────────────────

export interface ProjectWithPhases extends Project {
  phases: ProjectPhase[];
}

export interface ProjectSummary extends Project {
  completedCount: number;
  totalPhases: number;
}

type Db = BetterSQLite3Database<typeof schema>;

// ── 工厂函数 ─────────────────────────────────────────────────

export function createProjectService(db: Db) {
  function now(): string {
    return new Date().toISOString();
  }

  /**
   * 创建项目：建目录、插 projects + project_phases、写 _status.json
   */
  function createProject(
    name: string,
    description: string
  ): ProjectWithPhases {
    const id = crypto.randomUUID();
    const timestamp = now();
    const outputDir = ensureProjectDir(name);

    // 插入项目
    db.insert(projects)
      .values({
        id,
        name,
        description,
        currentPhase: PHASES[0],
        outputDir,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    // 插入 7 个阶段
    const phaseRecords: ProjectPhase[] = PHASES.map((phase, idx) => {
      const phaseId = crypto.randomUUID();
      const status = idx === 0 ? "in_progress" : "pending";
      const startedAt = idx === 0 ? timestamp : null;
      return {
        id: phaseId,
        projectId: id,
        phase,
        status,
        outputFile: null,
        startedAt,
        completedAt: null,
      };
    });

    for (const record of phaseRecords) {
      db.insert(projectPhases).values(record).run();
    }

    // 写 _status.json
    const phaseMap: Record<string, boolean> = {};
    for (const p of PHASES) {
      phaseMap[p] = false;
    }
    writeStatusJson(name, phaseMap, PHASES[0]);

    return {
      id,
      name,
      description,
      currentPhase: PHASES[0],
      outputDir,
      createdAt: timestamp,
      updatedAt: timestamp,
      phases: phaseRecords,
    };
  }

  /**
   * 获取项目详情（含 phases）
   */
  function getProject(id: string): ProjectWithPhases | null {
    const rows = db.select().from(projects).where(eq(projects.id, id)).all();
    if (rows.length === 0) return null;

    const project = rows[0];
    const phases = db
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, id))
      .all();

    return { ...project, phases };
  }

  /**
   * 列出所有项目（按 updatedAt DESC），附带完成进度
   */
  function listProjects(): ProjectSummary[] {
    const rows = db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt))
      .all();

    return rows.map((project) => {
      const phases = db
        .select()
        .from(projectPhases)
        .where(eq(projectPhases.projectId, project.id))
        .all();

      const completedCount = phases.filter(
        (p) => p.status === "completed"
      ).length;

      return {
        ...project,
        completedCount,
        totalPhases: PHASES.length,
      };
    });
  }

  /**
   * 删除项目（cascade 会自动删除 phases）
   */
  function deleteProject(id: string): void {
    db.delete(projects).where(eq(projects.id, id)).run();
  }

  /**
   * 更新某个阶段的状态
   */
  function updateProjectPhase(
    projectId: string,
    phase: string,
    status: string,
    outputFile?: string
  ): void {
    const rows = db
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId))
      .all();

    const target = rows.find((r) => r.phase === phase);
    if (!target) return;

    const updates: Partial<ProjectPhase> = { status };

    if (status === "in_progress" && !target.startedAt) {
      updates.startedAt = now();
    }

    if (status === "completed") {
      updates.completedAt = now();
      if (outputFile) {
        updates.outputFile = outputFile;
      }
    }

    db.update(projectPhases)
      .set(updates)
      .where(eq(projectPhases.id, target.id))
      .run();

    // 更新项目的 updatedAt
    db.update(projects)
      .set({ updatedAt: now() })
      .where(eq(projects.id, projectId))
      .run();
  }

  /**
   * 推进到下一个阶段：当前阶段标记完成，下一个标记 in_progress
   * 返回下一个阶段名，如果已是最后阶段返回 null
   */
  function advanceToNextPhase(projectId: string): Phase | null {
    const project = getProject(projectId);
    if (!project) return null;

    const currentIdx = PHASES.indexOf(project.currentPhase as Phase);
    if (currentIdx === -1 || currentIdx >= PHASES.length - 1) return null;

    const currentPhase = PHASES[currentIdx];
    const nextPhase = PHASES[currentIdx + 1];

    // 标记当前阶段完成
    updateProjectPhase(projectId, currentPhase, "completed");

    // 标记下一个阶段 in_progress
    updateProjectPhase(projectId, nextPhase, "in_progress");

    // 更新项目 currentPhase
    db.update(projects)
      .set({ currentPhase: nextPhase, updatedAt: now() })
      .where(eq(projects.id, projectId))
      .run();

    // 更新 _status.json
    const phaseMap: Record<string, boolean> = {};
    for (const p of PHASES) {
      const idx = PHASES.indexOf(p);
      phaseMap[p] = idx <= currentIdx + 1 ? idx <= currentIdx : false;
    }
    // 重新计算：已完成的阶段
    const updatedProject = getProject(projectId);
    if (updatedProject) {
      const statusMap: Record<string, boolean> = {};
      for (const p of updatedProject.phases) {
        statusMap[p.phase] = p.status === "completed";
      }
      writeStatusJson(updatedProject.name, statusMap, nextPhase);
    }

    return nextPhase;
  }

  return {
    createProject,
    getProject,
    listProjects,
    deleteProject,
    updateProjectPhase,
    advanceToNextPhase,
  };
}

// ── 默认实例（使用全局 db）────────────────────────────────────

const defaultService = createProjectService(defaultDb as unknown as Db);

export const createProjectFn = defaultService.createProject;
export const getProject = defaultService.getProject;
export const listProjects = defaultService.listProjects;
export const deleteProject = defaultService.deleteProject;
export const updateProjectPhase = defaultService.updateProjectPhase;
export const advanceToNextPhase = defaultService.advanceToNextPhase;
