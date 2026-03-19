import type { CSSProperties } from "react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { ActivityBar } from "@/components/layout/ActivityBar"
import { CommandPalette } from "@/components/command-palette"
import { Tooltip } from "@/components/ui/tooltip"
import { checkUpdate, downloadAndInstallUpdate } from "@/lib/tauri-api"
import type { UpdateInfo } from "@/lib/tauri-api"
import { useTheme } from "@/hooks/use-theme"
import { useHotkeys } from "@/hooks/use-hotkeys"
import type { HotkeyDef } from "@/hooks/use-hotkeys"
import { useNavigationHistory } from "@/hooks/use-navigation-history"
import { useRecent } from "@/hooks/use-recent"

export type { ThemePreference, ResolvedTheme } from "@/hooks/use-theme"

type BannerState = "idle" | "available" | "downloading" | "ready" | "error"

const PHASE_ORDER = [
  "requirement", "analysis", "research", "stories", "prd",
  "analytics", "prototype", "review", "retrospective",
]

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  analytics: "埋点设计",
  prototype: "原型设计",
  review: "需求评审",
  retrospective: "项目复盘",
}

const TOOL_LABELS: Record<string, string> = {
  priority: "优先级评估",
  weekly: "工作周报",
  data: "数据洞察",
  interview: "调研访谈",
  knowledge: "知识库",
  persona: "产品分身",
  "design-spec": "设计规范",
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: projectId } = useParams()
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory()
  const { recordVisit } = useRecent()

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("sidebar-open")
    return stored === null ? true : stored === "true"
  })

  const { preference: themePreference, resolved: theme, cycleTheme } = useTheme()

  // Auto-record recent visits for project pages and tool pages
  useEffect(() => {
    const path = location.pathname

    // Project pages: /project/:id/:phase
    const projectMatch = path.match(/^\/project\/([^/]+)\/([^/]+)$/)
    if (projectMatch) {
      const [, , phase] = projectMatch
      const phaseLabel = PHASE_LABELS[phase]
      if (phaseLabel) {
        // We need the project name — read it from the document title or sidebar
        // For simplicity, we use a deferred approach: read from the DOM after render
        requestAnimationFrame(() => {
          const sidebarNameEl = document.querySelector('[data-slot="sidebar"] button span.truncate')
          const projectName = sidebarNameEl?.textContent ?? "项目"
          recordVisit(path, `${projectName} \u203A ${phaseLabel}`)
        })
      }
      return
    }

    // Tool pages: /tools/:tool
    const toolMatch = path.match(/^\/tools\/([^/?]+)/)
    if (toolMatch) {
      const [, tool] = toolMatch
      const toolLabel = TOOL_LABELS[tool]
      if (toolLabel) {
        recordVisit(path.split("?")[0], toolLabel)
      }
    }
  }, [location.pathname, recordVisit])

  const [cmdOpen, setCmdOpen] = useState(false)
  const [bannerState, setBannerState] = useState<BannerState>("idle")
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const checkDoneRef = useRef(false)

  // Startup update check (runs once)
  useEffect(() => {
    if (checkDoneRef.current) return
    checkDoneRef.current = true

    checkUpdate()
      .then((info) => {
        if (info.available) {
          setUpdateInfo(info)
          setBannerState("available")
        }
      })
      .catch((err) => {
        console.error("[Updater] check failed", err)
      })
  }, [])

  const handleDownload = async () => {
    setBannerState("downloading")
    try {
      await downloadAndInstallUpdate()
      setBannerState("ready")
    } catch (err) {
      console.error("[Updater] download failed", err)
      setBannerState("error")
    }
  }

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-open", String(next))
      return next
    })
  }, [])

  const closeCommandPalette = useCallback(() => setCmdOpen(false), [])

  // Global keyboard shortcuts
  const hotkeys: HotkeyDef[] = useMemo(
    () => {
      const base: HotkeyDef[] = [
        { key: "k", meta: true, handler: () => setCmdOpen((prev) => !prev), description: "打开命令面板", group: "操作" },
        { key: "b", meta: true, handler: toggleSidebar, description: "切换侧边栏", group: "视图" },
        { key: ",", meta: true, handler: () => { closeCommandPalette(); navigate("/settings") }, description: "打开设置", group: "导航" },
        { key: "d", meta: true, handler: () => { closeCommandPalette(); cycleTheme() }, description: "切换主题", group: "视图" },
        { key: "[", meta: true, handler: goBack, description: "后退", group: "导航" },
        { key: "]", meta: true, handler: goForward, description: "前进", group: "导航" },
        { key: "Escape", handler: closeCommandPalette, description: "关闭命令面板", group: "操作" },
      ]

      // ⌘1-9: phase shortcuts (only active inside a project)
      if (projectId) {
        PHASE_ORDER.forEach((phase, i) => {
          base.push({
            key: String(i + 1),
            meta: true,
            handler: () => navigate(`/project/${projectId}/${phase}`),
            description: `跳转到阶段 ${i + 1}`,
            group: "阶段",
          })
        })
      }

      return base
    },
    [toggleSidebar, cycleTheme, navigate, closeCommandPalette, projectId, goBack, goForward]
  )

  useHotkeys(hotkeys)

  const showBanner =
    !bannerDismissed && bannerState !== "idle"

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-[var(--background)]">
      <ActivityBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      <div
        data-tauri-drag-region
        className="fixed top-0 right-0 h-[44px] z-10"
        style={{
          left: sidebarOpen ? "252px" : "72px",
          WebkitAppRegion: "drag",
          transition: "left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      />

      <SidebarShell
        open={sidebarOpen}
        onToggle={toggleSidebar}
        themePreference={themePreference}
        resolvedTheme={theme}
        onCycleTheme={cycleTheme}
      />

      <main
        className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 relative"
        style={{
          marginLeft: sidebarOpen ? 252 : 72,
          paddingTop: "44px",
          transition: "margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      >
        {/* Back / Forward navigation */}
        <div className="flex items-center gap-1 pt-2 pb-1 px-1">
          <Tooltip content="后退" shortcut="⌘[" side="bottom">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
              aria-label="后退"
            >
              <ChevronLeft className="size-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip content="前进" shortcut="⌘]" side="bottom">
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
              aria-label="前进"
            >
              <ChevronRight className="size-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>

        {/* Update banner */}
        {showBanner && (
          <div
            className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-2 text-sm"
            style={{
              background:
                bannerState === "error"
                  ? "var(--error-light, rgba(239, 68, 68, 0.12))"
                  : "var(--accent-light, #DBEAFE)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span className="text-[var(--text-primary)]">
              {bannerState === "available" &&
                `有新版本 v${updateInfo?.version} 可用`}
              {bannerState === "downloading" && "正在下载更新…"}
              {bannerState === "ready" &&
                "✅ 更新已下载，下次启动时自动安装"}
              {bannerState === "error" && "更新下载失败，请稍后重试"}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {bannerState === "available" && (
                <button
                  onClick={handleDownload}
                  disabled={bannerState !== "available"}
                  className="rounded-md bg-[var(--accent-color)] px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                >
                  下载更新
                </button>
              )}
              {bannerState !== "downloading" && (
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-base leading-none"
                  aria-label="关闭"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}

        <Outlet />
      </main>

      <CommandPalette
        open={cmdOpen}
        onClose={closeCommandPalette}
        onToggleSidebar={toggleSidebar}
        onCycleTheme={cycleTheme}
      />
    </div>
  )
}
