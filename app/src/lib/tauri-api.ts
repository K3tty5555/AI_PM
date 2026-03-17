import { invoke } from "@tauri-apps/api/core"

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProjectPhase {
  id: string
  projectId: string
  phase: string
  status: string
  outputFile: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  currentPhase: string
  outputDir: string
  createdAt: string
  updatedAt: string
  completedCount: number
  totalPhases: number
  completedPhases: string[]
}

export interface ProjectDetail extends Omit<ProjectSummary, 'completedCount' | 'totalPhases'> {
  phases: ProjectPhase[]
}

export interface ConfigState {
  hasConfig: boolean
  configSource: string
  apiKey: string | null
  baseUrl: string | null
  model: string
  backend: "api" | "claude_cli"
}

export interface ChatMessage {
  role: string
  content: string
}

export interface KnowledgeEntry {
  id: string
  category: string
  title: string
  content: string
}

export interface ContextFile {
  name: string
  preview: string
}

// ─── API functions ─────────────────────────────────────────────────────────

export const api = {
  // Projects
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  createProject: (name: string, teamMode?: boolean) =>
    invoke<ProjectDetail>("create_project", { args: { name, teamMode: teamMode ?? false } }),
  getProject: (id: string) => invoke<ProjectDetail | null>("get_project", { id }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  advancePhase: (id: string) => invoke<string | null>("advance_phase", { id }),
  updatePhase: (args: { projectId: string; phase: string; status: string; outputFile?: string }) =>
    invoke<void>("update_phase", { args }),

  // Files
  readProjectFile: (projectId: string, fileName: string) =>
    invoke<string | null>("read_project_file", { projectId, fileName }),
  saveProjectFile: (args: { projectId: string; fileName: string; content: string }) =>
    invoke<void>("save_project_file", { args }),
  readFile: (path: string) => invoke<string>("read_file", { path }),

  // Config
  getConfig: () => invoke<ConfigState>("get_config"),
  saveConfig: (args: { apiKey?: string; baseUrl?: string; model?: string; backend?: string }) =>
    invoke<{ ok: boolean }>("save_config", { args }),
  testConfig: (args: { apiKey?: string; baseUrl?: string; model?: string }) =>
    invoke<{ ok: boolean; model?: string; error?: string }>("test_config", { args }),
  testCliConfig: () =>
    invoke<{ ok: boolean; version?: string; error?: string }>("test_cli_config"),

  // Stream (fire-and-forget — results come via events)
  startStream: (args: { projectId: string; phase: string; messages: ChatMessage[]; excludedContext?: string[] }) =>
    invoke<void>("start_stream", { args }),
  runTool: (args: { toolName: string; userInput: string; filePath?: string; projectId?: string }) =>
    invoke<void>("run_tool", { args }),

  // Projects dir
  getProjectsDir: () => invoke<string>("get_projects_dir"),
  saveProjectsDir: (path: string) => invoke<{ ok: boolean }>("save_projects_dir", { path }),

  // Knowledge base
  listKnowledge: () => invoke<KnowledgeEntry[]>("list_knowledge"),
  addKnowledge: (args: { category: string; title: string; content: string }) =>
    invoke<KnowledgeEntry>("add_knowledge", { args }),
  deleteKnowledge: (category: string, id: string) =>
    invoke<void>("delete_knowledge", { category, id }),

  // Context files
  listProjectContext: (projectId: string) => invoke<ContextFile[]>("list_project_context", { projectId }),
}
