import type { CSSProperties } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Settings, PanelLeftClose, PanelLeftOpen, Home } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip } from "@/components/ui/tooltip"

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
      data-tauri-drag-region
      className="fixed top-0 left-0 bottom-0 z-30 flex w-[72px] flex-col items-center border-r border-[var(--border)] bg-[var(--bg-activity-bar)]"
      style={{ WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)", WebkitAppRegion: "drag" } as CSSProperties}
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
        <Tooltip content="切换侧边栏" shortcut="⌘B" side="right">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="切换侧边栏"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-all duration-[var(--dur-base)] active:scale-[0.97] active:duration-[var(--dur-fast)]"
          >
            {sidebarOpen
              ? <PanelLeftClose className="size-[15px]" strokeWidth={1.75} />
              : <PanelLeftOpen className="size-[15px]" strokeWidth={1.75} />
            }
          </button>
        </Tooltip>

        {/* Home — back to project list */}
        <Tooltip content="首页" side="right">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="首页"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-all duration-[var(--dur-base)] active:scale-[0.97] active:duration-[var(--dur-fast)]",
              location.pathname === "/"
                ? "bg-[var(--accent-light)] text-[var(--accent-color)] hover:bg-[var(--accent-color)]/15"
                : "text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            )}
          >
            <Home className="size-[15px]" strokeWidth={1.75} />
          </button>
        </Tooltip>
      </div>

      {/* Bottom: Settings */}
      <div className="mb-3 flex flex-col items-center">
        <Tooltip content="设置" shortcut="⌘," side="right">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label="设置"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-all duration-[var(--dur-base)] active:scale-[0.97] active:duration-[var(--dur-fast)]",
              isSettings
                ? "bg-[var(--accent-light)] text-[var(--accent-color)] hover:bg-[var(--accent-color)]/15"
                : "text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            )}
          >
            <Settings className="size-[15px]" strokeWidth={1.75} />
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
