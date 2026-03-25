import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, Clock, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ReviewGroupedViewProps {
  markdown: string
  projectId: string
}

interface ReviewOpinion {
  chapter: string
  content: string
  hash: string
}

function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return String(Math.abs(h))
}

function parseChapterOpinions(markdown: string): ReviewOpinion[] {
  const opinions: ReviewOpinion[] = []
  const regex = /\[章节[：:]([^\]]+)\]\s*(.+)/g
  let match
  while ((match = regex.exec(markdown)) !== null) {
    const chapter = match[1].trim()
    const content = match[2].trim()
    opinions.push({ chapter, content, hash: hashStr(content.slice(0, 50)) })
  }
  return opinions
}

const STATUS_KEY = "review-adoption-status"
const QUEUE_KEY = "review-adoption-queue"

type OpinionStatus = "pending" | "adopted" | "dismissed" | "deferred"

function loadStatuses(projectId: string): Record<string, OpinionStatus> {
  try {
    const raw = sessionStorage.getItem(`${STATUS_KEY}-${projectId}`)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveStatuses(projectId: string, statuses: Record<string, OpinionStatus>) {
  sessionStorage.setItem(`${STATUS_KEY}-${projectId}`, JSON.stringify(statuses))
}

export function ReviewGroupedView({ markdown, projectId }: ReviewGroupedViewProps) {
  const navigate = useNavigate()
  const opinions = useMemo(() => parseChapterOpinions(markdown), [markdown])
  const [statuses, setStatuses] = useState<Record<string, OpinionStatus>>(() => loadStatuses(projectId))
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, ReviewOpinion[]>()
    for (const op of opinions) {
      const list = map.get(op.chapter) ?? []
      list.push(op)
      map.set(op.chapter, list)
    }
    return map
  }, [opinions])

  if (opinions.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          评审报告未包含章节标注，请切换到「按角色」视图查看
        </p>
      </div>
    )
  }

  const updateStatus = (hash: string, status: OpinionStatus) => {
    const next = { ...statuses, [hash]: status }
    setStatuses(next)
    saveStatuses(projectId, next)
  }

  const handleAdopt = (opinion: ReviewOpinion, goToPrd = false) => {
    updateStatus(opinion.hash, "adopted")
    // Write to adoption queue for PRD page to pick up
    const queue = JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? "[]")
    queue.push(opinion.content)
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    if (goToPrd) {
      navigate(`/project/${projectId}/prd`)
    }
  }

  const pendingCount = opinions.filter((o) => (statuses[o.hash] ?? "pending") === "pending").length

  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          {pendingCount} 条待处理意见
        </p>
      )}

      {Array.from(grouped.entries()).map(([chapter, ops]) => (
        <div key={chapter} className="rounded-lg border border-[var(--border)]">
          <button
            onClick={() => setExpandedChapter(expandedChapter === chapter ? null : chapter)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--hover-bg)] transition-colors rounded-lg"
          >
            <span className="text-sm font-medium text-[var(--text-primary)]">{chapter}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{ops.length} 条</span>
          </button>

          {expandedChapter === chapter && (
            <div className="px-4 pb-3 space-y-2">
              {ops.map((op) => {
                const status = statuses[op.hash] ?? "pending"
                return (
                  <div
                    key={op.hash}
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-3 py-2.5",
                      status === "adopted" && "bg-[var(--success-light)]",
                      status === "dismissed" && "opacity-50",
                      status === "deferred" && "bg-[var(--secondary)]",
                    )}
                  >
                    <p className={cn(
                      "flex-1 text-sm text-[var(--text-primary)]",
                      status === "adopted" && "line-through text-[var(--text-secondary)]",
                    )}>
                      {op.content}
                    </p>
                    {status === "pending" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleAdopt(op)}
                          className="flex size-6 items-center justify-center rounded-md text-[var(--success)] hover:bg-[var(--success-light)] transition-colors"
                          title="采纳"
                        >
                          <Check className="size-3.5" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => handleAdopt(op, true)}
                          className="flex size-6 items-center justify-center rounded-md text-[var(--accent-color)] hover:bg-[var(--accent-light)] transition-colors"
                          title="采纳并前往 PRD"
                        >
                          <ArrowRight className="size-3.5" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => updateStatus(op.hash, "deferred")}
                          className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
                          title="暂缓"
                        >
                          <Clock className="size-3.5" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => updateStatus(op.hash, "dismissed")}
                          className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
                          title="忽略"
                        >
                          <X className="size-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    )}
                    {status === "adopted" && (
                      <span className="text-[10px] text-[var(--success)] shrink-0">已采纳</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Get pending adoption count for badge display */
export function getAdoptionQueueLength(): number {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw).length : 0
  } catch { return 0 }
}

/** Consume adoption queue (PRD page calls this) */
export function consumeAdoptionQueue(): string[] {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY)
    sessionStorage.removeItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
