import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SensitiveMatch } from "@/lib/tauri-api"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SensitiveScanDialogProps {
  open: boolean
  matches: SensitiveMatch[]
  onRedactExport: () => void
  onRawExport: () => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityLabel(severity: SensitiveMatch["severity"]) {
  return severity === "high" ? "高危" : "中危"
}

function severityDot(severity: SensitiveMatch["severity"]) {
  return severity === "high"
    ? "bg-[var(--destructive)]"
    : "bg-[var(--warning)]"
}

function severityRowBg(severity: SensitiveMatch["severity"]) {
  return severity === "high"
    ? "bg-[var(--destructive)]/5"
    : "bg-[var(--warning)]/5"
}

function severityTextColor(severity: SensitiveMatch["severity"]) {
  return severity === "high"
    ? "text-[var(--destructive)]"
    : "text-[var(--warning)]"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SensitiveScanDialog({
  open,
  matches,
  onRedactExport,
  onRawExport,
  onCancel,
}: SensitiveScanDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onCancel()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensitive-dialog-title"
        className="w-full max-w-[520px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* Title */}
        <h2
          id="sensitive-dialog-title"
          className="mb-2 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]"
        >
          <span className="text-[var(--warning)]">&#x26A0;&#xFE0F;</span>
          发现 {matches.length} 处敏感信息
        </h2>

        {/* Separator */}
        <div className="mb-4 h-px bg-[var(--border)]" />

        {/* Match list */}
        <div className="mb-6 max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {matches.map((m, i) => (
            <div
              key={`${m.line}-${m.column}-${i}`}
              className={cn(
                "rounded-lg px-3 py-2.5",
                severityRowBg(m.severity),
              )}
            >
              {/* Header row: severity dot + line + rule */}
              <div className="flex items-center gap-2 text-[13px]">
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 rounded-full",
                    severityDot(m.severity),
                  )}
                />
                <span className="font-medium text-[var(--text-secondary)]">
                  L{m.line}
                </span>
                <span className="text-[var(--text-tertiary)]">&middot;</span>
                <span className={cn("font-medium", severityTextColor(m.severity))}>
                  {m.ruleName}
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                    severityTextColor(m.severity),
                  )}
                >
                  {severityLabel(m.severity)}
                </span>
              </div>

              {/* Redacted preview */}
              <p className="mt-1 font-mono text-[13px] text-[var(--text-primary)]">
                {m.redacted}
              </p>

              {/* Context */}
              {m.context && (
                <p className="mt-0.5 truncate text-[12px] text-[var(--text-tertiary)]">
                  {m.context}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            取消，我先修改
          </button>
          <Button variant="ghost" size="sm" onClick={onRawExport}>
            直接导出
          </Button>
          <Button variant="primary" size="sm" onClick={onRedactExport}>
            脱敏后导出
          </Button>
        </div>
      </div>
    </div>
  )
}

export { SensitiveScanDialog }
export type { SensitiveScanDialogProps }
