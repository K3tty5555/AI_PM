import type { CSSProperties } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Settings, PanelLeftClose, PanelLeftOpen, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActivityBarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ActivityBar({ sidebarOpen, onToggleSidebar }: ActivityBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isSettings = location.pathname === "/settings"

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-30 flex w-[72px] flex-col items-center border-r border-[var(--border)] bg-[var(--bg-sidebar)]"
      style={{ WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)" } as CSSProperties}
    >
      {/* Traffic lights drag zone — 40px, nothing here */}
      <div
        data-tauri-drag-region
        className="h-[40px] w-full shrink-0"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      />

      {/* Top icons */}
      <div className="flex flex-1 flex-col items-center gap-1 pt-2">
        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          className="flex size-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors duration-150 active:scale-95"
        >
          {sidebarOpen
            ? <PanelLeftClose className="size-[15px]" strokeWidth={1.75} />
            : <PanelLeftOpen className="size-[15px]" strokeWidth={1.75} />
          }
        </button>

        {/* Home — back to project list */}
        <button
          type="button"
          onClick={() => navigate("/")}
          title="项目总览"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
            location.pathname === "/"
              ? "bg-[var(--accent-light)] text-[var(--accent-color)]"
              : "text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          )}
        >
          <Home className="size-[15px]" strokeWidth={1.75} />
        </button>
      </div>

      {/* Bottom: Settings */}
      <div className="mb-3 flex flex-col items-center">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          title="设置"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
            isSettings
              ? "bg-[var(--accent-light)] text-[var(--accent-color)]"
              : "text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          )}
        >
          <Settings className="size-[15px]" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  )
}
