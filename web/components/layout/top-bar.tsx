"use client"

import { useRouter } from "next/navigation"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function TopBar({ className }: { className?: string }) {
  const router = useRouter()

  return (
    <header
      data-slot="top-bar"
      className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6",
        className
      )}
    >
      {/* Left: Brand */}
      <div
        className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-base font-bold tracking-[2px] text-[var(--dark)]"
      >
        // AI PM
      </div>

      {/* Right: Status + Settings */}
      <div className="flex items-center gap-4">
        {/* Online indicator */}
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 bg-[var(--green)]"
            style={{ animation: "dotPulse 2s ease-in-out infinite" }}
          />
          <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
            online
          </span>
        </div>

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
