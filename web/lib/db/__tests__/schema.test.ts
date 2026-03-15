import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  projects,
  projectPhases,
  PHASES,
  PHASE_LABELS,
  type Project,
  type ProjectPhase,
  type Phase,
} from "../schema";
import * as schema from "../schema";

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

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(INIT_SQL);
  return drizzle(sqlite, { schema });
}

describe("PHASES 常量", () => {
  it("包含 7 个阶段", () => {
    expect(PHASES).toHaveLength(7);
  });

  it("每个阶段都有中文标签", () => {
    for (const phase of PHASES) {
      expect(PHASE_LABELS[phase]).toBeDefined();
      expect(typeof PHASE_LABELS[phase]).toBe("string");
    }
  });

  it("阶段顺序正确", () => {
    expect(PHASES).toEqual([
      "requirement",
      "analysis",
      "research",
      "stories",
      "prd",
      "prototype",
      "review",
    ]);
  });
});

describe("projects 表", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("能创建项目", () => {
    const now = new Date().toISOString();
    const inserted = db
      .insert(projects)
      .values({
        id: "proj-001",
        name: "测试项目",
        description: "这是一个测试项目",
        currentPhase: "requirement",
        outputDir: "/output/test",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    expect(inserted.id).toBe("proj-001");
    expect(inserted.name).toBe("测试项目");
    expect(inserted.description).toBe("这是一个测试项目");
    expect(inserted.currentPhase).toBe("requirement");
    expect(inserted.outputDir).toBe("/output/test");
  });

  it("currentPhase 默认值为 requirement", () => {
    const now = new Date().toISOString();
    const inserted = db
      .insert(projects)
      .values({
        id: "proj-002",
        name: "默认阶段项目",
        outputDir: "/output/default",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    expect(inserted.currentPhase).toBe("requirement");
  });

  it("description 可以为 null", () => {
    const now = new Date().toISOString();
    const inserted = db
      .insert(projects)
      .values({
        id: "proj-003",
        name: "无描述项目",
        outputDir: "/output/nodesc",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    expect(inserted.description).toBeNull();
  });
});

describe("project_phases 表", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    // 先插入一个项目
    const now = new Date().toISOString();
    db.insert(projects)
      .values({
        id: "proj-100",
        name: "阶段测试项目",
        outputDir: "/output/phases",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  it("能创建阶段记录", () => {
    const inserted = db
      .insert(projectPhases)
      .values({
        id: "phase-001",
        projectId: "proj-100",
        phase: "requirement",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      })
      .returning()
      .get();

    expect(inserted.id).toBe("phase-001");
    expect(inserted.projectId).toBe("proj-100");
    expect(inserted.phase).toBe("requirement");
    expect(inserted.status).toBe("completed");
  });

  it("status 默认值为 pending", () => {
    const inserted = db
      .insert(projectPhases)
      .values({
        id: "phase-002",
        projectId: "proj-100",
        phase: "analysis",
      })
      .returning()
      .get();

    expect(inserted.status).toBe("pending");
  });

  it("outputFile 可以为 null", () => {
    const inserted = db
      .insert(projectPhases)
      .values({
        id: "phase-003",
        projectId: "proj-100",
        phase: "prd",
      })
      .returning()
      .get();

    expect(inserted.outputFile).toBeNull();
  });
});

describe("项目与阶段的关联查询", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    const now = new Date().toISOString();

    db.insert(projects)
      .values({
        id: "proj-200",
        name: "完整项目",
        description: "含多个阶段的项目",
        outputDir: "/output/full",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 插入多个阶段
    db.insert(projectPhases)
      .values([
        {
          id: "ph-201",
          projectId: "proj-200",
          phase: "requirement",
          status: "completed",
        },
        {
          id: "ph-202",
          projectId: "proj-200",
          phase: "analysis",
          status: "in_progress",
        },
        {
          id: "ph-203",
          projectId: "proj-200",
          phase: "research",
          status: "pending",
        },
      ])
      .run();
  });

  it("能查询项目及其阶段", () => {
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, "proj-200"))
      .get();

    expect(project).toBeDefined();
    expect(project!.name).toBe("完整项目");

    const phases = db
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, "proj-200"))
      .all();

    expect(phases).toHaveLength(3);
    expect(phases.map((p) => p.phase)).toEqual([
      "requirement",
      "analysis",
      "research",
    ]);
  });

  it("能按状态过滤阶段", () => {
    const completedPhases = db
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.status, "completed"))
      .all();

    expect(completedPhases).toHaveLength(1);
    expect(completedPhases[0].phase).toBe("requirement");
  });
});

describe("TypeScript 类型", () => {
  it("Project 类型字段正确", () => {
    const project: Project = {
      id: "test",
      name: "test",
      description: null,
      currentPhase: "requirement",
      outputDir: "/test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(project.id).toBe("test");
  });

  it("ProjectPhase 类型字段正确", () => {
    const phase: ProjectPhase = {
      id: "test",
      projectId: "proj-1",
      phase: "prd",
      status: "pending",
      outputFile: null,
      startedAt: null,
      completedAt: null,
    };
    expect(phase.phase).toBe("prd");
  });

  it("Phase 类型约束正确", () => {
    const p: Phase = "requirement";
    expect(PHASES.includes(p)).toBe(true);
  });
});
