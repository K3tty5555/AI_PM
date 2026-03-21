import type { CSSProperties } from "react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { ActivityBar } from "@/components/layout/ActivityBar"
import { CommandPalette } from "@/components/command-palette"
import { checkUpdate, downloadAndInstallUpdate } from "@/lib/tauri-api"
import { open as openUrl } from "@tauri-apps/plugin-shell"
import type { UpdateInfo } from "@/lib/tauri-api"
import { useTheme } from "@/hooks/use-theme"
import { useHotkeys } from "@/hooks/use-hotkeys"
import type { HotkeyDef } from "@/hooks/use-hotkeys"
import { useRecent } from "@/hooks/use-recent"
import { listen } from "@tauri-apps/api/event"

export type { ThemePreference, ResolvedTheme } from "@/hooks/use-theme"

import { PHASE_ORDER, PHASE_LABELS, TOOL_LABELS } from "@/lib/phase-meta"

type BannerState = "idle" | "available" | "downloading" | "ready" | "error"

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: projectId } = useParams()
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
  const [updateError, setUpdateError] = useState("")
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
    setUpdateError("")
    try {
      await downloadAndInstallUpdate()
      setBannerState("ready")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[Updater] download failed", msg)
      setUpdateError(msg)
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
    [toggleSidebar, cycleTheme, navigate, closeCommandPalette, projectId]
  )

  useHotkeys(hotkeys)

  // ─── Native menu bar event listener (Task 24) ────────────────────
  useEffect(() => {
    const unlisten = listen<string>("menu-action", (event) => {
      switch (event.payload) {
        case "new-project":
          window.dispatchEvent(new Event("open-new-project-dialog"))
          break
        case "toggle-sidebar":
          toggleSidebar()
          break
        case "toggle-theme":
          cycleTheme()
          break
        case "command-palette":
          setCmdOpen((prev) => !prev)
          break
        case "check-update":
          navigate("/settings")
          break
        case "about":
          // no-op for now
          break
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [toggleSidebar, cycleTheme, navigate])

  // ─── Responsive: auto-collapse sidebar on small windows (Task 26) ─
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 900px)")
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false)
    }
    // Initial check
    if (mql.matches) setSidebarOpen(false)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

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

      {/* Update notification — Toast style, fixed top-right per design spec */}
      {showBanner && (
        <div
          className="pointer-events-auto fixed z-50 flex items-center gap-3 overflow-hidden rounded-lg bg-[var(--card)] shadow-[var(--shadow-lg)] border border-[var(--border)] min-w-[320px] max-w-[420px] animate-[slideInRight_300ms_ease_both]"
          style={{ top: 56, right: 24 }}
        >
          {/* Left color bar */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[3px]"
            style={{
              background:
                bannerState === "error"
                  ? "var(--destructive)"
                  : bannerState === "ready"
                    ? "var(--success)"
                    : "var(--accent-color)",
            }}
          />

          {/* Content */}
          <div className="ml-4 flex-1 py-3">
            <p className="text-sm text-[var(--text-primary)]">
              {bannerState === "available" &&
                `有新版本 v${updateInfo?.version} 可用`}
              {bannerState === "downloading" && "正在下载更新…"}
              {bannerState === "ready" && "更新已下载，下次启动时自动安装"}
              {bannerState === "error" && (updateError || "更新下载失败")}
            </p>
            {bannerState === "error" && (
              <button
                onClick={() => openUrl("https://github.com/K3tty5555/AI_PM/releases/latest")}
                className="text-xs text-[var(--accent-color)] hover:underline mt-0.5 inline-block cursor-pointer bg-transparent border-none p-0"
              >
                前往 GitHub 手动下载
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pr-3 shrink-0">
            {bannerState === "available" && (
              <button
                onClick={handleDownload}
                className="rounded-md bg-[var(--accent-color)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)] active:scale-[0.97] transition-all cursor-pointer"
              >
                下载更新
              </button>
            )}
            {bannerState === "error" && (
              <button
                onClick={handleDownload}
                className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--hover-bg)] active:scale-[0.97] transition-all cursor-pointer"
              >
                重试
              </button>
            )}
            {bannerState !== "downloading" && (
              <button
                onClick={() => setBannerDismissed(true)}
                className="rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
                aria-label="关闭"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <main
        className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 relative"
        style={{
          marginLeft: sidebarOpen ? 252 : 72,
          paddingTop: "44px",
          transition: "margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      >
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
