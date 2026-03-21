import { useEffect, useState, useCallback } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { api, type KnowledgeEntry } from "@/lib/tauri-api"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Category label mapping
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  pitfalls: "踩坑经验",
  decisions: "决策记录",
  patterns: "最佳模式",
  metrics: "指标设计",
  playbooks: "打法手册",
  insights: "产品洞察",
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectId: string
  timing: "before_prd" | "before_review"
  visible: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeRecommendPanel({ projectId, timing, visible }: Props) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(`kb-recommend-${projectId}-${timing}`)
      return stored === "true"
    } catch {
      return false
    }
  })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Fetch recommendations when visible
  useEffect(() => {
    if (!visible || !projectId) return
    api
      .recommendKnowledge({ projectId, timing })
      .then((result) => {
        if (result.length > 0) setEntries(result)
      })
      .catch((err) => console.error("[KnowledgeRecommendPanel]", err))
  }, [visible, projectId, timing])

  // Persist collapsed state
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`kb-recommend-${projectId}-${timing}`, String(next))
      } catch { /* ignore */ }
      return next
    })
  }, [projectId, timing])

  // Toggle individual entry expansion
  const toggleEntry = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Don't render if no results or not visible
  if (!visible || entries.length === 0) return null

  const isPrd = timing === "before_prd"
  const title = isPrd ? "相关知识" : "历史踩坑提醒"
  const accentColor = isPrd ? "var(--accent-color)" : "var(--warning)"

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden mb-6">
      <div className="flex">
        {/* Left color bar */}
        <div
          className="w-[3px] shrink-0"
          style={{ backgroundColor: accentColor }}
        />

        <div className="flex-1 min-w-0">
          {/* Header — clickable to collapse */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3",
              "transition-colors duration-200",
              "hover:bg-[var(--secondary)]/50",
            )}
          >
            <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              {title}
              <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                {entries.length}
              </Badge>
            </span>
            {collapsed ? (
              <ChevronRight className="size-4 text-[var(--text-tertiary)]" />
            ) : (
              <ChevronDown className="size-4 text-[var(--text-tertiary)]" />
            )}
          </button>

          {/* Entries list */}
          {!collapsed && (
            <div className="border-t border-[var(--border)] px-4 pb-3">
              {entries.map((entry) => {
                const isExpanded = expandedIds.has(entry.id)
                const categoryLabel =
                  CATEGORY_LABELS[entry.category] ?? entry.category

                return (
                  <div
                    key={entry.id}
                    className="py-2 border-b border-[var(--border)] last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => toggleEntry(entry.id)}
                      className={cn(
                        "w-full flex items-center gap-2 text-left",
                        "transition-colors duration-200",
                        "hover:opacity-80",
                      )}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                      )}
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0 shrink-0">
                        {categoryLabel}
                      </Badge>
                      <span className="text-[13px] text-[var(--text-primary)] truncate">
                        {entry.title}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 ml-[22px] text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                        {entry.content.replace(/^#[^\n]+\n+/, "")}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
