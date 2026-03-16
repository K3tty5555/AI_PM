"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function TopBar({ className }: { className?: string }) {
  const router = useRouter()
  const [apiReady, setApiReady] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => setApiReady(!!data.hasConfig))
      .catch(() => setApiReady(false))
  }, [])

  return (
    <header
      data-slot="top-bar"
      className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6",
        className
      )}
    >
      {/* Left: Brand — clickable, goes home */}
      <Link
        href="/"
        className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-base font-bold tracking-[2px] text-[var(--dark)] transition-opacity hover:opacity-70"
      >
        // AI PM
      </Link>

      {/* Right: API Status + Settings */}
      <div className="flex items-center gap-4">
        {/* API status indicator */}
        {apiReady !== null && (
          <button
            onClick={() => router.push("/settings")}
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

        {/* Settings button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/settings")}
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  )
}

export { TopBar }
