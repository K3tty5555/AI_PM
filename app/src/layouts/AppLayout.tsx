import type { CSSProperties } from "react"
import { useState, useEffect } from "react"
import { Outlet } from "react-router-dom"
import { PanelLeft } from "lucide-react"
import { SidebarShell } from "@/components/layout/SidebarShell"

export type Theme = "light" | "dark"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("sidebar-open")
    return stored === null ? true : stored === "true"
  })

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("app-theme") as Theme) ?? "light"
  })

  // Sync theme class to <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove("theme-light", "theme-dark")
    html.classList.add(`theme-${theme}`)
    localStorage.setItem("app-theme", theme)
  }, [theme])

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-open", String(next))
      return next
    })
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"))
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Drag strip — covers main content top */}
      <div
        data-tauri-drag-region
        className="fixed top-0 right-0 h-[44px] z-10"
        style={{
          left: sidebarOpen ? "220px" : "0",
          WebkitAppRegion: "drag",
          transition: "left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      >
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as CSSProperties}
            className="absolute top-[9px] left-[80px] flex items-center justify-center size-6 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors duration-150"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
      </div>

      <SidebarShell
        open={sidebarOpen}
        onToggle={toggleSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main
        className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 relative"
        style={{
          marginLeft: sidebarOpen ? 220 : 0,
          paddingTop: sidebarOpen ? "32px" : "52px",
          transition: "margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1), padding-top 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        } as CSSProperties}
      >
        <Outlet />
      </main>
    </div>
  )
}
