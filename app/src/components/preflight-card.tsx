import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react"
import { api, type PrerequisiteItem } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PreflightCardProps {
  projectId: string
  phaseId: string // "prd" | "prototype"
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PreflightCard({ projectId, phaseId, className }: PreflightCardProps) {
  const [items, setItems] = useState<PrerequisiteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})

  const fetchPrerequisites = useCallback(async () => {
    try {
      const result = await api.checkPhasePrerequisites(projectId, phaseId)
      setItems(result)
      // Auto-expand if any item is not passed
      const hasUnpassed = result.some(r => !r.passed && r.checkType === "auto")
      setExpanded(hasUnpassed)
    } catch (err) {
      console.error("[PreflightCard]", err)
    } finally {
      setLoading(false)
    }
  }, [projectId, phaseId])

  // Initial fetch
  useEffect(() => {
    fetchPrerequisites()
  }, [fetchPrerequisites])

  // Refresh on page visibility change (user navigates back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchPrerequisites()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [fetchPrerequisites])

  if (loading || items.length === 0) return null

  const allPassed = items.every(
    (item) => item.passed || (item.checkType === "manual" && manualChecks[item.id])
  )

  const toggleManual = (id: string) => {
    setManualChecks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--card)]", className)}>
      {/* Header — clickable accordion */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-[var(--text-tertiary)]" strokeWidth={2} />
        ) : (
          <ChevronRight className="size-3.5 text-[var(--text-tertiary)]" strokeWidth={2} />
        )}
        <span className="text-[13px] font-medium text-[var(--text-primary)]">
          {allPassed ? "预检通过" : "前置检查"}
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium",
            allPassed
              ? "bg-[var(--success)]/10 text-[var(--success)]"
              : "bg-[var(--warning)]/10 text-[var(--warning)]"
          )}
        >
          {allPassed ? "✅ 全部通过" : `${items.filter(i => i.passed).length}/${items.length}`}
        </span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-3 py-2 space-y-1.5">
          {items.map((item) => {
            const passed = item.checkType === "manual"
              ? manualChecks[item.id] ?? false
              : item.passed

            return (
              <div key={item.id} className="flex items-start gap-2 text-[13px]">
                {item.checkType === "manual" ? (
                  <button
                    onClick={() => toggleManual(item.id)}
                    className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border border-[var(--border)] cursor-pointer transition-colors hover:border-[var(--accent-color)]"
                    style={
                      manualChecks[item.id]
                        ? { backgroundColor: "var(--accent-color)", borderColor: "var(--accent-color)" }
                        : undefined
                    }
                  >
                    {manualChecks[item.id] && (
                      <span className="block size-1.5 bg-white rounded-[1px]" />
                    )}
                  </button>
                ) : (
                  <span className={cn(
                    "mt-0.5 inline-block size-3.5 shrink-0 rounded-full text-center text-[10px] leading-[14px] font-bold",
                    passed
                      ? "bg-[var(--success)]/15 text-[var(--success)]"
                      : "bg-[var(--warning)]/15 text-[var(--warning)]"
                  )}>
                    {passed ? "✓" : "!"}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <span className={cn(
                    "font-medium",
                    passed ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
                  )}>
                    {item.label}
                  </span>

                  {!passed && item.hint && (
                    <p className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{item.hint}</p>
                  )}
                </div>

                {!passed && item.navigateTo && (
                  <a
                    href={`/project/${projectId}/${item.navigateTo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 shrink-0 text-[var(--accent-color)] hover:opacity-70 transition-opacity"
                    title="前往补充"
                  >
                    <ExternalLink className="size-3" strokeWidth={2} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { PreflightCard }
export type { PreflightCardProps }
