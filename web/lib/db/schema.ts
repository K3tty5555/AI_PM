import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// ── Phase 常量 ──────────────────────────────────────────────

export const PHASES = [
  "requirement",
  "analysis",
  "research",
  "stories",
  "prd",
  "prototype",
  "review",
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  prototype: "原型设计",
  review: "评审",
};

// ── projects 表 ─────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  currentPhase: text("current_phase").notNull().default("requirement"),
  outputDir: text("output_dir").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── project_phases 表 ───────────────────────────────────────

export const projectPhases = sqliteTable("project_phases", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  status: text("status").notNull().default("pending"),
  outputFile: text("output_file"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

// ── TypeScript 类型 ─────────────────────────────────────────

export type Project = typeof projects.$inferSelect;
export type ProjectPhase = typeof projectPhases.$inferSelect;
