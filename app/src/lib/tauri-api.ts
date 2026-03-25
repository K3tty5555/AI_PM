import { invoke } from "@tauri-apps/api/core"
import { logError } from "@/lib/error-log"

// ─── Error handling ──────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly rawMessage: string
  ) {
    super(rawMessage)
    this.name = "AppError"
  }
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (err) {
    const message = typeof err === "string" ? err : String(err)
    const error = new AppError(cmd, message)
    logError(error)
    throw error
  }
}

// ─── Project Types ──────────────────────────────────────────────────────────

export type ProjectType = "general" | "to-b" | "to-c" | "internal"

export const PROJECT_TYPE_META: Record<ProjectType, { label: string; description: string }> = {
  general: { label: "通用", description: "标准 9 阶段完整流程" },
  "to-b": { label: "To B 企业应用", description: "强调权限、审批流、系统集成" },
  "to-c": { label: "To C 用户产品", description: "强调增长漏斗、留存转化、体验" },
  internal: { label: "内部工具", description: "精简流程，重点效率提升" },
}

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
  projectType?: string
}

export interface ProjectDetail extends Omit<ProjectSummary, 'completedCount' | 'totalPhases' | 'completedPhases'> {
  phases: ProjectPhase[]
  teamMode: boolean
  projectType?: string
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
  source: string  // "manual" | "auto"
}

export interface KnowledgeCandidate {
  category: string
  title: string
  content: string
  source: string
}

export interface BrainstormMessage {
  id: string
  projectId: string
  phase: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  seq: number
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
  // Brainstorm
  loadBrainstormMessages: (projectId: string, phase: string) =>
    safeInvoke<BrainstormMessage[]>("load_brainstorm_messages", { projectId, phase }),
  saveBrainstormMessage: (args: { projectId: string; phase: string; role: "user" | "assistant"; content: string }) =>
    safeInvoke<BrainstormMessage>("save_brainstorm_message", { args }),
  clearBrainstorm: (projectId: string, phase: string) =>
    safeInvoke<void>("clear_brainstorm", { projectId, phase }),
  brainstormMessageCount: (projectId: string, phase: string) =>
    safeInvoke<number>("brainstorm_message_count", { projectId, phase }),
  brainstormChat: (args: { projectId: string; phase: string; messages: Array<{ role: "user" | "assistant"; content: string }> }) =>
    safeInvoke<void>("brainstorm_chat", { args }),

  // Projects
  listProjects: () => safeInvoke<ProjectSummary[]>("list_projects"),
  createProject: (name: string, teamMode?: boolean) =>
    safeInvoke<ProjectDetail>("create_project", { args: { name, teamMode: teamMode ?? false } }),
  getProject: (id: string) => safeInvoke<ProjectDetail | null>("get_project", { id }),
  deleteProject: (id: string) => safeInvoke<void>("delete_project", { id }),
  setProjectStatus: (id: string, status: 'active' | 'completed') =>
    safeInvoke<void>("set_project_status", { id, status }),
  batchDeleteProjects: (ids: string[]) =>
    safeInvoke<{ succeeded: string[]; failed: [string, string][] }>("batch_delete_projects", { ids }),
  batchSetProjectStatus: (ids: string[], status: string) =>
    safeInvoke<{ succeeded: string[]; failed: [string, string][] }>("batch_set_project_status", { ids, status }),
  exportProjectsZip: (ids: string[]) =>
    safeInvoke<string>("export_projects_zip", { ids }),
  advancePhase: (id: string) => safeInvoke<string | null>("advance_phase", { id }),
  suggestSkipPhases: (projectId: string) =>
    safeInvoke<{ phase: string; reason: string }[]>("suggest_skip_phases", { projectId }),
  skipPhases: (projectId: string, phases: string[]) =>
    safeInvoke<void>("skip_phases", { projectId, phases }),
  unskipPhase: (projectId: string, phase: string) =>
    safeInvoke<void>("unskip_phase", { projectId, phase }),
  setTeamMode: (id: string, enabled: boolean) =>
    safeInvoke<void>("set_team_mode", { args: { id, enabled } }),
  updatePhase: (args: { projectId: string; phase: string; status: string; outputFile?: string }) =>
    safeInvoke<void>("update_phase", { args }),

  // Files
  readProjectFile: (projectId: string, fileName: string) =>
    safeInvoke<string | null>("read_project_file", { projectId, fileName }),
  saveProjectFile: (args: { projectId: string; fileName: string; content: string }) =>
    safeInvoke<void>("save_project_file", { args }),
  readFile: (path: string) => safeInvoke<string>("read_file", { path }),

  // Config
  getConfig: () => safeInvoke<ConfigState>("get_config"),
  saveConfig: (args: { apiKey?: string; baseUrl?: string; model?: string; backend?: string }) =>
    safeInvoke<{ ok: boolean }>("save_config", { args }),
  testConfig: (args: { apiKey?: string; baseUrl?: string; model?: string }) =>
    safeInvoke<{ ok: boolean; model?: string; error?: string }>("test_config", { args }),
  testCliConfig: () =>
    safeInvoke<{ ok: boolean; version?: string; error?: string }>("test_cli_config"),

  // Stream (fire-and-forget — results come via events)
  startStream: (args: { projectId: string; phase: string; messages: ChatMessage[]; excludedContext?: string[]; styleId?: string; designSpec?: string }) =>
    safeInvoke<void>("start_stream", { args }),
  runTool: (args: { toolName: string; userInput: string; filePath?: string; projectId?: string; mode?: string }) =>
    safeInvoke<void>("run_tool", { args }),

  // Projects dir
  getProjectsDir: () => safeInvoke<string>("get_projects_dir"),
  saveProjectsDir: (path: string) => safeInvoke<{ ok: boolean }>("save_projects_dir", { path }),

  // Knowledge base
  listKnowledge: () => safeInvoke<KnowledgeEntry[]>("list_knowledge"),
  addKnowledge: (args: { category: string; title: string; content: string }) =>
    safeInvoke<KnowledgeEntry>("add_knowledge", { args }),
  deleteKnowledge: (category: string, id: string) =>
    safeInvoke<void>("delete_knowledge", { category, id }),
  searchKnowledge: (query: string) => safeInvoke<KnowledgeEntry[]>("search_knowledge", { query }),
  getKnowledgeContent: (category: string, id: string) =>
    safeInvoke<string>("get_knowledge_content", { category, id }),
  recommendKnowledge: (args: { projectId: string; timing: "before_prd" | "before_review" }) =>
    safeInvoke<KnowledgeEntry[]>("recommend_knowledge", { args }),
  extractKnowledgeCandidates: (projectId: string) =>
    safeInvoke<KnowledgeCandidate[]>("extract_knowledge_candidates", { projectId }),

  // Reference files (07-references/)
  uploadReferenceFile: (projectId: string, sourcePath: string) =>
    safeInvoke<string>("upload_reference_file", { projectId, sourcePath }),
  listReferenceFiles: (projectId: string) =>
    safeInvoke<ReferenceFileEntry[]>("list_reference_files", { projectId }),
  deleteReferenceFile: (projectId: string, fileName: string) =>
    safeInvoke<void>("delete_reference_file", { projectId, fileName }),

  // Context files
  listProjectContext: (projectId: string) => safeInvoke<ContextFile[]>("list_project_context", { projectId }),

  // Export
  exportPrdDocx: (projectId: string) => safeInvoke<string>("export_prd_docx", { projectId }),
  exportPrdShareHtml: (projectId: string) => safeInvoke<string>("export_prd_share_html", { projectId }),
  listPrdVersions: (projectId: string) => safeInvoke<number[]>("list_prd_versions", { projectId }),
  getLatestPrdVersion: (projectId: string) => safeInvoke<number>("get_latest_prd_version", { projectId }),
  revealFile: (path: string) => safeInvoke<void>("reveal_file", { path }),
  openFile: (path: string) => safeInvoke<void>("open_file", { path }),
  writeFile: (path: string, content: string) => safeInvoke<void>("write_file", { path, content }),

  // URL fetch
  fetchUrlContent: (url: string) => safeInvoke<string>("fetch_url_content", { url }),

  // Environment
  checkEnv: () => safeInvoke<DepStatus[]>("check_env"),
  installDep: (dep: string, useMirror: boolean) => safeInvoke<void>("install_dep", { args: { dep, useMirror } }),
  checkPlaywrightMcp: () => safeInvoke<boolean>("check_playwright_mcp"),

  // Legacy import
  scanLegacyProjects: (dir: string) =>
    safeInvoke<LegacyProjectScan[]>("scan_legacy_projects", { dir }),
  importLegacyProjects: (projects: LegacyProjectScan[]) =>
    safeInvoke<ImportResult>("import_legacy_projects", { projects }),

  // Template migration
  scanLegacyKnowledge: (dir: string) =>
    safeInvoke<KnowledgeCategoryScan[]>("scan_legacy_knowledge", { dir }),
  importLegacyKnowledge: (dir: string) =>
    safeInvoke<ImportResult>("import_legacy_knowledge", { dir }),
  listPrdStyles: () => safeInvoke<PrdStyleEntry[]>("list_prd_styles"),
  scanLegacyPrdStyles: (dir: string) =>
    safeInvoke<PrdStyleScan[]>("scan_legacy_prd_styles", { dir }),
  importLegacyPrdStyles: (dir: string) =>
    safeInvoke<ImportResult>("import_legacy_prd_styles", { dir }),
  scanLegacyUiSpecs: (dir: string) =>
    safeInvoke<UiSpecScan[]>("scan_legacy_ui_specs", { dir }),
  importLegacyUiSpecs: (dir: string) =>
    safeInvoke<ImportResult>("import_legacy_ui_specs", { dir }),
  listUiSpecs: () => safeInvoke<UiSpecEntry[]>("list_ui_specs"),
  addUiSpec: (dir: string) => safeInvoke<string>("add_ui_spec", { dir }),
  getPrdStyleContent: (name: string) => safeInvoke<PrdStyleContent>("get_prd_style_content", { name }),
  getUiSpecContent: (name: string) => safeInvoke<UiSpecContent>("get_ui_spec_content", { name }),

  // PRD style active management
  setActivePrdStyle: (name: string) => safeInvoke<void>("set_active_prd_style", { name }),
  getActivePrdStyle: () => safeInvoke<string | null>("get_active_prd_style"),

  migrateProjectsToAppDir: () =>
    safeInvoke<MigrateResult>("migrate_projects_to_app_dir"),

  // Rename
  renamePrdStyle: (oldName: string, newName: string) =>
    safeInvoke<void>("rename_prd_style", { oldName, newName }),
  renameUiSpec: (oldName: string, newName: string) =>
    safeInvoke<void>("rename_ui_spec", { oldName, newName }),
  deleteUiSpec: (name: string) =>
    safeInvoke<void>("delete_ui_spec", { name }),
  deletePrdStyle: (name: string) =>
    safeInvoke<void>("delete_prd_style", { name }),
  renameProject: (id: string, newName: string) =>
    safeInvoke<void>("rename_project", { id, newName }),

  // Project design spec
  getProjectDesignSpec: (projectId: string) =>
    safeInvoke<string | null>("get_project_design_spec", { projectId }),
  setProjectDesignSpec: (projectId: string, specId: string) =>
    safeInvoke<void>("set_project_design_spec", { projectId, specId }),
}

// ─── Updater ────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  available: boolean
  version: string
  notes: string
}

export const checkUpdate = (): Promise<UpdateInfo> =>
  safeInvoke<UpdateInfo>("check_update")

export const downloadAndInstallUpdate = (): Promise<void> =>
  safeInvoke<void>("download_and_install_update")
