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
  status: 'active' | 'completed'
}

export interface ProjectDetail extends Omit<ProjectSummary, 'completedCount' | 'totalPhases' | 'completedPhases'> {
  phases: ProjectPhase[]
  teamMode: boolean
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

export interface KnowledgeCandidate {
  category: string
  title: string
  content: string
  source: string
}

export interface ContextFile {
  name: string
  preview: string
}

export interface LegacyProjectScan {
  name: string
  dir: string
  completedPhases: string[]
  lastPhase: string
  alreadyExists: boolean
}

export interface ImportResult {
  imported: number
  skipped: number
}

export interface MigrateResult {
  migrated: number
  skipped: number
  failed: { name: string; error: string }[]
}

export interface KnowledgeCategoryScan {
  category: string
  total: number
  newCount: number
}

export interface PrdStyleScan {
  name: string
  hasPersona: boolean
  alreadyExists: boolean
}

export interface PrdStyleEntry {
  name: string
  hasPersona: boolean
}

export interface UiSpecScan {
  name: string
  alreadyExists: boolean
}

export interface UiSpecEntry {
  name: string
}

export interface PrdStyleContent {
  config: string
  profile: string | null
  sample: string | null
  hasTemplate: boolean
}

export interface UiSpecContent {
  readme: string | null
  tokensRaw: string | null
}

export interface ReferenceFileEntry {
  name: string
  size: number
}

export interface DepStatus {
  name: string
  label: string
  installed: boolean
  version: string | null
  required: boolean
  autoInstallable: boolean
  manualHint: string | null
  featureHint: string
}

// ─── API functions ─────────────────────────────────────────────────────────

export const api = {
  // Projects
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  createProject: (name: string, teamMode?: boolean) =>
    invoke<ProjectDetail>("create_project", { args: { name, teamMode: teamMode ?? false } }),
  getProject: (id: string) => invoke<ProjectDetail | null>("get_project", { id }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  setProjectStatus: (id: string, status: 'active' | 'completed') =>
    invoke<void>("set_project_status", { id, status }),
  advancePhase: (id: string) => invoke<string | null>("advance_phase", { id }),
  setTeamMode: (id: string, enabled: boolean) =>
    invoke<void>("set_team_mode", { args: { id, enabled } }),
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
  startStream: (args: { projectId: string; phase: string; messages: ChatMessage[]; excludedContext?: string[]; styleId?: string; designSpec?: string }) =>
    invoke<void>("start_stream", { args }),
  runTool: (args: { toolName: string; userInput: string; filePath?: string; projectId?: string; mode?: string }) =>
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
  searchKnowledge: (query: string) => invoke<KnowledgeEntry[]>("search_knowledge", { query }),
  getKnowledgeContent: (category: string, id: string) =>
    invoke<string>("get_knowledge_content", { category, id }),
  recommendKnowledge: (args: { projectId: string; timing: "before_prd" | "before_review" }) =>
    invoke<KnowledgeEntry[]>("recommend_knowledge", { args }),
  extractKnowledgeCandidates: (projectId: string) =>
    invoke<KnowledgeCandidate[]>("extract_knowledge_candidates", { projectId }),

  // Reference files (07-references/)
  uploadReferenceFile: (projectId: string, sourcePath: string) =>
    invoke<string>("upload_reference_file", { projectId, sourcePath }),
  listReferenceFiles: (projectId: string) =>
    invoke<ReferenceFileEntry[]>("list_reference_files", { projectId }),
  deleteReferenceFile: (projectId: string, fileName: string) =>
    invoke<void>("delete_reference_file", { projectId, fileName }),

  // Context files
  listProjectContext: (projectId: string) => invoke<ContextFile[]>("list_project_context", { projectId }),

  // Export
  exportPrdDocx: (projectId: string) => invoke<string>("export_prd_docx", { projectId }),
  revealFile: (path: string) => invoke<void>("reveal_file", { path }),
  openFile: (path: string) => invoke<void>("open_file", { path }),
  writeFile: (path: string, content: string) => invoke<void>("write_file", { path, content }),

  // URL fetch
  fetchUrlContent: (url: string) => invoke<string>("fetch_url_content", { url }),

  // Environment
  checkEnv: () => invoke<DepStatus[]>("check_env"),
  installDep: (dep: string, useMirror: boolean) => invoke<void>("install_dep", { args: { dep, useMirror } }),
  checkPlaywrightMcp: () => invoke<boolean>("check_playwright_mcp"),

  // Legacy import
  scanLegacyProjects: (dir: string) =>
    invoke<LegacyProjectScan[]>("scan_legacy_projects", { dir }),
  importLegacyProjects: (projects: LegacyProjectScan[]) =>
    invoke<ImportResult>("import_legacy_projects", { projects }),

  // Template migration
  scanLegacyKnowledge: (dir: string) =>
    invoke<KnowledgeCategoryScan[]>("scan_legacy_knowledge", { dir }),
  importLegacyKnowledge: (dir: string) =>
    invoke<ImportResult>("import_legacy_knowledge", { dir }),
  listPrdStyles: () => invoke<PrdStyleEntry[]>("list_prd_styles"),
  scanLegacyPrdStyles: (dir: string) =>
    invoke<PrdStyleScan[]>("scan_legacy_prd_styles", { dir }),
  importLegacyPrdStyles: (dir: string) =>
    invoke<ImportResult>("import_legacy_prd_styles", { dir }),
  scanLegacyUiSpecs: (dir: string) =>
    invoke<UiSpecScan[]>("scan_legacy_ui_specs", { dir }),
  importLegacyUiSpecs: (dir: string) =>
    invoke<ImportResult>("import_legacy_ui_specs", { dir }),
  listUiSpecs: () => invoke<UiSpecEntry[]>("list_ui_specs"),
  addUiSpec: (dir: string) => invoke<string>("add_ui_spec", { dir }),
  getPrdStyleContent: (name: string) => invoke<PrdStyleContent>("get_prd_style_content", { name }),
  getUiSpecContent: (name: string) => invoke<UiSpecContent>("get_ui_spec_content", { name }),

  // PRD style active management
  setActivePrdStyle: (name: string) => invoke<void>("set_active_prd_style", { name }),
  getActivePrdStyle: () => invoke<string | null>("get_active_prd_style"),

  migrateProjectsToAppDir: () =>
    invoke<MigrateResult>("migrate_projects_to_app_dir"),

  // Rename
  renamePrdStyle: (oldName: string, newName: string) =>
    invoke<void>("rename_prd_style", { oldName, newName }),
  renameUiSpec: (oldName: string, newName: string) =>
    invoke<void>("rename_ui_spec", { oldName, newName }),
  deleteUiSpec: (name: string) =>
    invoke<void>("delete_ui_spec", { name }),
  deletePrdStyle: (name: string) =>
    invoke<void>("delete_prd_style", { name }),
  renameProject: (id: string, newName: string) =>
    invoke<void>("rename_project", { id, newName }),

  // Project design spec
  getProjectDesignSpec: (projectId: string) =>
    invoke<string | null>("get_project_design_spec", { projectId }),
  setProjectDesignSpec: (projectId: string, specId: string) =>
    invoke<void>("set_project_design_spec", { projectId, specId }),
}

// ─── Updater ────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  available: boolean
  version: string
  notes: string
}

export const checkUpdate = (): Promise<UpdateInfo> =>
  invoke<UpdateInfo>("check_update")

export const downloadAndInstallUpdate = (): Promise<void> =>
  invoke<void>("download_and_install_update")
