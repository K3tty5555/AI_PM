import type { CSSProperties } from "react"
import { useState, useEffect, useRef } from "react"
import { Outlet } from "react-router-dom"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { ActivityBar } from "@/components/layout/ActivityBar"
import { checkUpdate, downloadAndInstallUpdate } from "@/lib/tauri-api"
import type { UpdateInfo } from "@/lib/tauri-api"
import { useTheme } from "@/hooks/use-theme"

export type { ThemePreference, ResolvedTheme } from "@/hooks/use-theme"

type BannerState = "idle" | "available" | "downloading" | "ready" | "error"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("sidebar-open")
    return stored === null ? true : stored === "true"
  })

  const { preference: themePreference, resolved: theme, cycleTheme } = useTheme()

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

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-open", String(next))
      return next
    })
  }

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
    </div>
  )
}
