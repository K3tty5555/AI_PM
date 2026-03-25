import { useState } from "react"
import { cn } from "@/lib/utils"

interface PrdScoreDimension {
  name: string
  score: number
  comment: string
  suggestion: string
}

interface PrdScorePanelProps {
  dimensions: PrdScoreDimension[]
  totalScore: number
  onSendSuggestions: (suggestions: string[]) => void
}

function scoreColor(score: number): string {
  if (score >= 4) return "var(--success)"
  if (score >= 2.5) return "var(--warning)"
  return "var(--destructive)"
}

export function PrdScorePanel({ dimensions, totalScore, onSendSuggestions }: PrdScorePanelProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
      style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-[var(--text-primary)]">质量评分</span>
          <span
            className="text-lg font-bold"
            style={{ color: scoreColor(totalScore) }}
          >
            {totalScore.toFixed(1)}/5
          </span>
        </div>
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        {dimensions.map((dim, idx) => (
          <div key={dim.name} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={selected.has(idx)}
              onChange={() => toggleSelect(idx)}
              className="mt-1 size-3.5 rounded border-[var(--border)] accent-[var(--accent-color)] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-[var(--text-primary)]">{dim.name}</span>
                <span className="text-sm font-semibold" style={{ color: scoreColor(dim.score) }}>
                  {dim.score}
                </span>
              </div>
              {/* Score bar */}
              <div className="h-1.5 rounded-full bg-[var(--secondary)] mb-1.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(dim.score / 5) * 100}%`, background: scoreColor(dim.score) }}
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{dim.comment}</p>
              {dim.suggestion && (
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  建议：{dim.suggestion}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Send suggestions button */}
      {selected.size > 0 && (
        <button
          onClick={() => {
            const suggestions = Array.from(selected).map((i) => dimensions[i].suggestion).filter(Boolean)
            onSendSuggestions(suggestions)
            setSelected(new Set())
          }}
          className={cn(
            "mt-4 w-full rounded-lg py-2 text-sm font-medium text-white transition-colors",
            "bg-[var(--accent-color)] hover:opacity-90 active:scale-[0.98]",
          )}
        >
          发送已选 {selected.size} 条建议到 AI Assist
        </button>
      )}
    </div>
  )
}

export function PrdScoreBadge({
  score,
  loading,
  stale,
  onClick,
}: {
  score: number | null
  loading: boolean
  stale: boolean
  onClick: () => void
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--secondary)] text-xs text-[var(--text-tertiary)] animate-pulse">
        评分中...
      </span>
    )
  }
  if (score === null) return null

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
        stale
          ? "bg-[var(--secondary)] text-[var(--text-tertiary)]"
          : "bg-[var(--secondary)]",
      )}
      style={!stale ? { color: scoreColor(score) } : undefined}
    >
      {stale ? "重新评分" : `${score.toFixed(1)}/5`}
    </button>
  )
}
