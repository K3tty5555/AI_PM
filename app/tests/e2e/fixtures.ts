import { test as base, type Page } from "@playwright/test"

/**
 * Inject Tauri IPC mock before page loads.
 * All @tauri-apps/api calls go through window.__TAURI_INTERNALS__.invoke,
 * which we intercept here with mock handlers.
 */
async function injectTauriMock(page: Page) {
  await page.addInitScript(() => {
    const projects: any[] = []
    let counter = 0

    const PHASES = [
      "requirement", "analysis", "research", "stories", "prd",
      "analytics", "prototype", "review", "retrospective",
    ]

    function makeProject(name: string) {
      const id = `mock-${++counter}`
      const now = new Date().toISOString()
      return {
        id, name, description: null,
        currentPhase: "requirement",
        outputDir: `/tmp/ai-pm-test/${name}`,
        createdAt: now, updatedAt: now,
        completedCount: 0, totalPhases: 9,
        completedPhases: [] as string[],
        status: "active", teamMode: false,
        phases: PHASES.map((p, i) => ({
          id: `ph-${id}-${p}`, projectId: id, phase: p,
          status: i === 0 ? "in_progress" : "pending",
          outputFile: null, startedAt: i === 0 ? now : null, completedAt: null,
        })),
      }
    }

    const handlers: Record<string, (args: any) => any> = {
      list_projects: () => projects.map(({ phases, teamMode, ...r }) => r),
      create_project: ({ args }: any) => {
        const p = makeProject(args.name)
        projects.push(p)
        return p
      },
      get_project: ({ id }: any) => projects.find((p) => p.id === id) ?? null,
      delete_project: ({ id }: any) => {
        const idx = projects.findIndex((p) => p.id === id)
        if (idx !== -1) projects.splice(idx, 1)
      },
      advance_phase: ({ id }: any) => {
        const p = projects.find((pr) => pr.id === id)
        if (!p) return null
        const idx = PHASES.indexOf(p.currentPhase)
        if (idx >= PHASES.length - 1) return null
        p.completedPhases.push(PHASES[idx])
        p.completedCount++
        p.currentPhase = PHASES[idx + 1]
        if (p.phases) {
          p.phases[idx].status = "completed"
          p.phases[idx + 1].status = "in_progress"
        }
        return PHASES[idx + 1]
      },
      set_project_status: ({ id, status }: any) => {
        const p = projects.find((pr) => pr.id === id)
        if (p) p.status = status
      },
      update_phase: () => {},
      rename_project: () => {},
      get_config: () => ({ hasConfig: true, configSource: "mock", apiKey: "sk-mock", baseUrl: "https://api.mock", model: "mock", backend: "api" }),
      save_config: () => ({ ok: true }),
      test_config: () => ({ ok: true, model: "mock" }),
      test_cli_config: () => ({ ok: true, version: "1.0" }),
      get_projects_dir: () => "/tmp/ai-pm-test",
      save_projects_dir: () => ({ ok: true }),
      read_project_file: () => null,
      save_project_file: () => {},
      read_file: () => "",
      list_project_context: () => [],
      reveal_file: () => {},
      open_file: () => {},
      write_file: () => {},
      export_prd_docx: () => "/tmp/mock.docx",
      export_prd_share_html: () => "/tmp/mock.html",
      list_prd_versions: () => [1],
      get_latest_prd_version: () => 1,
      start_stream: () => {},
      run_tool: () => {},
      list_knowledge: () => [],
      add_knowledge: () => ({ id: "m", category: "patterns", title: "M", content: "c", source: "manual" }),
      delete_knowledge: () => {},
      search_knowledge: () => [],
      get_knowledge_content: () => "",
      recommend_knowledge: () => [],
      extract_knowledge_candidates: () => [],
      check_env: () => [],
      install_dep: () => {},
      check_playwright_mcp: () => false,
      upload_reference_file: () => "f",
      list_reference_files: () => [],
      delete_reference_file: () => {},
      list_prd_styles: () => [],
      get_active_prd_style: () => null,
      set_active_prd_style: () => {},
      list_ui_specs: () => [],
      get_prd_style_content: () => ({}),
      get_ui_spec_content: () => ({}),
      scan_legacy_projects: () => [],
      import_legacy_projects: () => ({ imported: 0, skipped: 0 }),
      scan_legacy_knowledge: () => [],
      import_legacy_knowledge: () => ({ imported: 0, skipped: 0 }),
      scan_legacy_prd_styles: () => [],
      import_legacy_prd_styles: () => ({ imported: 0, skipped: 0 }),
      scan_legacy_ui_specs: () => [],
      import_legacy_ui_specs: () => ({ imported: 0, skipped: 0 }),
      migrate_projects_to_app_dir: () => ({ migrated: 0, skipped: 0, failed: [] }),
      set_team_mode: () => {},
      get_project_design_spec: () => null,
      set_project_design_spec: () => {},
      add_ui_spec: () => "m",
      rename_prd_style: () => {},
      rename_ui_spec: () => {},
      delete_ui_spec: () => {},
      delete_prd_style: () => {},
      fetch_url_content: () => "<html></html>",
      check_update: () => ({ available: false, version: "0.2.3", notes: "" }),
      download_and_install_update: () => {},
      suggest_skip_phases: () => [],
      skip_phases: () => {},
      unskip_phase: () => {},
      batch_delete_projects: ({ ids }: any) => ({ succeeded: ids, failed: [] }),
      batch_set_project_status: ({ ids }: any) => ({ succeeded: ids, failed: [] }),
      export_projects_zip: () => "/tmp/mock.zip",
      load_brainstorm_messages: () => [],
      save_brainstorm_message: () => ({ id: "1", projectId: "", phase: "", role: "user", content: "", seq: 1 }),
      clear_brainstorm: () => {},
      brainstorm_message_count: () => 0,
      brainstorm_chat: () => {},
    }

    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (handlers[cmd]) return handlers[cmd](args)
        console.warn(`[tauri-mock] unhandled command: ${cmd}`)
        return null
      },
      transformCallback: (cb: any) => {
        const id = ((window as any).__TAURI_CB_ID__ = ((window as any).__TAURI_CB_ID__ || 0) + 1)
        ;(window as any)[`_${id}`] = cb
        return id
      },
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    }

    // Mock window progress bar API
    ;(window as any).__TAURI_INTERNALS__.invoke.__wry_ipc__ = () => {}
  })
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await injectTauriMock(page)
    await use(page)
  },
})

export { expect } from "@playwright/test"
