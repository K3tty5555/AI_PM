import type { CSSProperties } from "react"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { api } from "@/lib/tauri-api"

export function TitleBar() {
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
      className="flex h-11 shrink-0 select-none items-center justify-between border-b border-[var(--border)] bg-[rgba(250,250,250,0.9)] backdrop-blur-sm px-5"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {/* macOS traffic lights space */}
      <div className="w-[72px]" data-tauri-drag-region />

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
        className="flex w-[72px] items-center justify-end"
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
