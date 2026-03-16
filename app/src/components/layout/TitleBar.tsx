import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      className="flex h-[52px] shrink-0 select-none items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* macOS traffic lights sit in the left 72px — leave space */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Brand — center */}
      <button
        onClick={() => navigate("/")}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-base font-bold tracking-[2px] text-[var(--dark)] transition-opacity hover:opacity-70"
      >
        // AI PM
      </button>

      {/* Right: API status + settings */}
      <div
        className="flex items-center gap-4"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {apiReady !== null && (
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
            title={apiReady ? "API 已配置" : "点击配置 API"}
          >
            <span
              className={cn(
                "inline-block h-2 w-2",
                apiReady ? "bg-[var(--green)]" : "bg-[var(--yellow)]"
              )}
              style={apiReady ? { animation: "dotPulse 2s ease-in-out infinite" } : undefined}
            />
            <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
              {apiReady ? "API_OK" : "API_UNSET"}
            </span>
          </button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate("/settings")}
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  )
}
