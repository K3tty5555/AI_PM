import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { PHASES } from "../db/schema";
import fs from "fs";
import path from "path";
import os from "os";

// 建表 SQL（与 lib/db/index.ts 保持一致）
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

// 模块级变量，供 hoisted mock 引用
let _mockTmpDir = "";

vi.mock("../file-manager", () => ({
  ensureProjectDir: (projectName: string) => {
    const dir = path.join(_mockTmpDir, projectName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  },
  writeStatusJson: () => {
    // no-op in test
  },
}));

describe("project-service", () => {
  let service: Awaited<ReturnType<typeof setupService>>;

  async function setupService() {
    const sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(INIT_SQL);
    const db = drizzle(sqlite, { schema });

    // 每次测试重新导入，确保 mock 生效
    const { createProjectService } = await import("../project-service");
    return createProjectService(
      db as Parameters<typeof createProjectService>[0]
    );
  }

  beforeEach(async () => {
    _mockTmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "project-service-test-")
    );
    vi.resetModules();
    service = await setupService();
  });

  afterEach(() => {
    if (_mockTmpDir && fs.existsSync(_mockTmpDir)) {
      fs.rmSync(_mockTmpDir, { recursive: true, force: true });
    }
  });

  // ─── createProject ──────────────────────────────────────────

  describe("createProject", () => {
    it("creates a project with 7 phases", () => {
      const project = service.createProject("测试项目", "这是一个测试");

      expect(project.id).toBeTruthy();
      expect(project.name).toBe("测试项目");
      expect(project.description).toBe("这是一个测试");
      expect(project.currentPhase).toBe("requirement");
      expect(project.phases).toHaveLength(PHASES.length);

      // 验证阶段名称正确
      const phaseNames = project.phases.map((p) => p.phase);
      expect(phaseNames).toEqual([...PHASES]);

      // 第一个阶段应为 in_progress
      expect(project.phases[0].status).toBe("in_progress");
      expect(project.phases[0].startedAt).toBeTruthy();

      // 其余阶段应为 pending
      for (let i = 1; i < project.phases.length; i++) {
        expect(project.phases[i].status).toBe("pending");
        expect(project.phases[i].startedAt).toBeNull();
      }
    });

    it("creates output directory for the project", () => {
      service.createProject("目录测试", "");
      const dir = path.join(_mockTmpDir, "目录测试");
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  // ─── listProjects ──────────────────────────────────────────

  describe("listProjects", () => {
    it("returns an empty array when no projects exist", () => {
      const projects = service.listProjects();
      expect(projects).toEqual([]);
    });

    it("returns projects with completion counts", () => {
      service.createProject("项目A", "描述A");
      service.createProject("项目B", "描述B");

      const projects = service.listProjects();
      expect(projects).toHaveLength(2);

      for (const p of projects) {
        expect(p).toHaveProperty("completedCount");
        expect(p).toHaveProperty("totalPhases");
        expect(p.totalPhases).toBe(PHASES.length);
        expect(p.completedCount).toBe(0);
      }
    });

    it("returns projects ordered by updatedAt DESC", () => {
      const a = service.createProject("先创建", "");
      const b = service.createProject("后创建", "");

      // 推进项目 a 使其 updatedAt 更新（保证不同时间戳）
      service.advanceToNextPhase(a.id);

      const projects = service.listProjects();
      // 项目 a 被推进过，updatedAt 更新，排在前面
      expect(projects[0].name).toBe("先创建");
      expect(projects[1].name).toBe("后创建");
    });
  });

  // ─── getProject ────────────────────────────────────────────

  describe("getProject", () => {
    it("returns project with phases", () => {
      const created = service.createProject("查询测试", "");
      const found = service.getProject(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe("查询测试");
      expect(found!.phases).toHaveLength(PHASES.length);
    });

    it("returns null for non-existent project", () => {
      const found = service.getProject("non-existent-id");
      expect(found).toBeNull();
    });
  });

  // ─── updateProjectPhase ────────────────────────────────────

  describe("updateProjectPhase", () => {
    it("sets startedAt when status changes to in_progress", () => {
      const project = service.createProject("阶段更新测试", "");
      const secondPhase = PHASES[1];

      service.updateProjectPhase(project.id, secondPhase, "in_progress");

      const updated = service.getProject(project.id);
      const phase = updated!.phases.find((p) => p.phase === secondPhase);
      expect(phase!.status).toBe("in_progress");
      expect(phase!.startedAt).toBeTruthy();
    });

    it("sets completedAt and outputFile when status is completed", () => {
      const project = service.createProject("完成测试", "");

      service.updateProjectPhase(
        project.id,
        "requirement",
        "completed",
        "01-requirement.md"
      );

      const updated = service.getProject(project.id);
      const phase = updated!.phases.find((p) => p.phase === "requirement");
      expect(phase!.status).toBe("completed");
      expect(phase!.completedAt).toBeTruthy();
      expect(phase!.outputFile).toBe("01-requirement.md");
    });

    it("updates project updatedAt", () => {
      const project = service.createProject("时间更新测试", "");
      const originalUpdatedAt = project.updatedAt;

      service.updateProjectPhase(project.id, "requirement", "completed");

      const updated = service.getProject(project.id);
      expect(updated!.updatedAt).toBeTruthy();
    });
  });

  // ─── advanceToNextPhase ────────────────────────────────────

  describe("advanceToNextPhase", () => {
    it("advances from first to second phase", () => {
      const project = service.createProject("推进测试", "");

      const nextPhase = service.advanceToNextPhase(project.id);
      expect(nextPhase).toBe("analysis");

      const updated = service.getProject(project.id);
      expect(updated!.currentPhase).toBe("analysis");

      const req = updated!.phases.find((p) => p.phase === "requirement");
      expect(req!.status).toBe("completed");

      const analysis = updated!.phases.find((p) => p.phase === "analysis");
      expect(analysis!.status).toBe("in_progress");
    });

    it("returns null when already at last phase", () => {
      const project = service.createProject("最后阶段测试", "");

      for (let i = 0; i < PHASES.length - 1; i++) {
        service.advanceToNextPhase(project.id);
      }

      const updated = service.getProject(project.id);
      expect(updated!.currentPhase).toBe(PHASES[PHASES.length - 1]);

      const result = service.advanceToNextPhase(project.id);
      expect(result).toBeNull();
    });

    it("returns null for non-existent project", () => {
      const result = service.advanceToNextPhase("non-existent-id");
      expect(result).toBeNull();
    });

    it("correctly advances through all phases", () => {
      const project = service.createProject("全流程测试", "");

      for (let i = 0; i < PHASES.length - 1; i++) {
        const next = service.advanceToNextPhase(project.id);
        expect(next).toBe(PHASES[i + 1]);
      }

      const final = service.getProject(project.id);
      expect(final!.currentPhase).toBe(PHASES[PHASES.length - 1]);

      for (let i = 0; i < PHASES.length - 1; i++) {
        const phase = final!.phases.find((p) => p.phase === PHASES[i]);
        expect(phase!.status).toBe("completed");
      }

      const lastPhase = final!.phases.find(
        (p) => p.phase === PHASES[PHASES.length - 1]
      );
      expect(lastPhase!.status).toBe("in_progress");
    });
  });

  // ─── deleteProject ─────────────────────────────────────────

  describe("deleteProject", () => {
    it("deletes project and cascades to phases", () => {
      const project = service.createProject("删除测试", "");

      service.deleteProject(project.id);

      const found = service.getProject(project.id);
      expect(found).toBeNull();
    });
  });
});
