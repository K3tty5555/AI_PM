import { useMemo } from "react"
import { diffLines } from "diff"
import { cn } from "@/lib/utils"

interface PrdDiffViewerProps {
  oldText: string
  newText: string
  oldLabel: string
  newLabel: string
}

export function PrdDiffViewer({ oldText, newText, oldLabel, newLabel }: PrdDiffViewerProps) {
  const changes = useMemo(() => diffLines(oldText, newText), [oldText, newText])

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const c of changes) {
      const lines = c.value.split("\n").filter(Boolean).length
      if (c.added) added += lines
      if (c.removed) removed += lines
    }
    return { added, removed }
  }, [changes])

  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--secondary)] border-b border-[var(--border)]">
        <span className="text-sm text-[var(--text-secondary)]">
          {oldLabel} → {newLabel}
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--diff-add-text)]">+{stats.added}</span>
          <span className="text-[var(--diff-del-text)]">-{stats.removed}</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-x-auto text-sm font-mono leading-relaxed">
        {changes.map((change, i) => {
          const lines = change.value.split("\n")
          // Remove trailing empty line from split
          if (lines[lines.length - 1] === "") lines.pop()

          return lines.map((line, j) => (
            <div
              key={`${i}-${j}`}
              className={cn(
                "px-4 py-0.5 min-h-[1.5em] whitespace-pre-wrap break-words",
                change.added && "bg-[var(--diff-add-bg)]",
                change.removed && "bg-[var(--diff-del-bg)] line-through",
              )}
            >
              <span className="inline-block w-4 mr-3 text-[var(--text-tertiary)] select-none text-right">
                {change.added ? "+" : change.removed ? "-" : " "}
              </span>
              {line}
            </div>
          ))
        })}
      </div>
    </div>
  )
}
