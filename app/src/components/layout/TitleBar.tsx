import type { CSSProperties } from "react"
import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { PanelLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/tauri-api"
import { PHASE_LABELS, TOOL_LABELS } from "@/lib/phase-meta"

interface TitleBarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function TitleBar({ sidebarOpen, onToggleSidebar }: TitleBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [apiReady, setApiReady] = useState<boolean | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)

  useEffect(() => {
    api.getConfig()
      .then((data) => setApiReady(data.hasConfig))
      .catch(() => setApiReady(false))
  }, [])

  // Parse route
  const parts = location.pathname.split("/").filter(Boolean)
  const isProject  = parts[0] === "project" && parts.length >= 3
  const isTool     = parts[0] === "tools" && parts.length >= 2
  const isSettings = parts[0] === "settings"
  const projectId  = isProject ? parts[1] : null
  const phase      = isProject ? parts[2] : null
  const toolSlug   = isTool    ? parts[1] : null

  // Fetch project name when inside a project
  useEffect(() => {
    if (!projectId) { setProjectName(null); return }
    api.getProject(projectId)
      .then((p) => setProjectName(p?.name ?? null))
      .catch(() => setProjectName(null))
  }, [projectId])

  // Build center content
  let center: React.ReactNode

  if (isProject && phase) {
    center = (
      <span className="flex items-center gap-1.5 min-w-0">
        {projectName && (
          <>
            <span className="truncate max-w-[160px] text-[var(--text-tertiary)]">
              {projectName}
            </span>
            <span className="text-[var(--text-tertiary)] opacity-40 shrink-0">›</span>
          </>
        )}
        <span className="text-[var(--text-primary)] shrink-0">
          {PHASE_LABELS[phase] ?? phase}
        </span>
      </span>
    )
  } else if (isTool && toolSlug) {
    center = (
      <span className="text-[var(--text-primary)]">
        {TOOL_LABELS[toolSlug] ?? toolSlug}
      </span>
    )
  } else if (isSettings) {
    center = <span className="text-[var(--text-primary)]">设置</span>
  } else {
    center = (
      <button
        onClick={() => navigate("/")}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        className="text-sm font-semibold text-[var(--text-primary)] tracking-tight hover:opacity-60 transition-opacity"
      >
        AI PM
      </button>
    )
  }

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 select-none items-center border-b border-[var(--border)] bg-[var(--bg-sidebar)] backdrop-blur-sm"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {/* Left: traffic lights space + sidebar toggle */}
      <div
        className="flex items-center gap-1 px-3 shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <div className="w-[72px]" data-tauri-drag-region />
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          className={cn(
            "flex items-center justify-center size-6 rounded-md transition-colors duration-150",
            "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
          )}
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      {/* Center: breadcrumb — absolutely centered in the bar */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-sm font-medium pointer-events-none"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties} className="pointer-events-auto">
          {center}
        </div>
      </div>

      {/* Right: API status */}
      <div
        className="ml-auto flex items-center justify-end px-3 shrink-0"
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
