import type { CSSProperties } from "react"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { PanelLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/tauri-api"

interface TitleBarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function TitleBar({ sidebarOpen, onToggleSidebar }: TitleBarProps) {
  const navigate = useNavigate()
  const [apiReady, setApiReady] = useState<boolean | null>(null)

  useEffect(() => {
    api.getConfig()
      .then((data) => setApiReady(data.hasConfig))
      .catch(() => setApiReady(false))
  }, [])

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 select-none items-center justify-between border-b border-[var(--border)] bg-[rgba(250,250,250,0.9)] backdrop-blur-sm px-3"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {/* Left: macOS traffic lights space + sidebar toggle */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        {/* macOS traffic lights take ~72px */}
        <div className="w-[72px]" data-tauri-drag-region />
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          className={cn(
            "flex items-center justify-center size-6 rounded-md transition-colors duration-150",
            "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
          )}
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      {/* Brand */}
      <button
        onClick={() => navigate("/")}
        title="返回主页"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        className="text-sm font-semibold text-[var(--text-primary)] tracking-tight hover:opacity-60 transition-opacity"
      >
        AI PM
      </button>

      {/* API status indicator */}
      <div
        className="flex w-[120px] items-center justify-end"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        {apiReady !== null && (
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
            title={apiReady ? "API 已配置" : "点击配置 API"}
          >
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                apiReady ? "bg-[var(--success)]" : "bg-[var(--accent-color)]"
              )}
              style={apiReady ? { animation: "dotPulse 2s ease-in-out infinite" } : undefined}
            />
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {apiReady ? "已配置" : "未配置"}
            </span>
          </button>
        )}
      </div>
    </header>
  )
}
