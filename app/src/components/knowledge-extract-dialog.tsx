import { useEffect, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { api, type KnowledgeCandidate } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X, Loader2, Check, ChevronDown, ChevronRight } from "lucide-react"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Badge category colors
// ---------------------------------------------------------------------------

const CATEGORY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pitfalls: {
    bg: "bg-[rgba(245,158,11,0.1)]",
    text: "text-[var(--warning)]",
    label: "踩坑记录",
  },
  decisions: {
    bg: "bg-[var(--accent-light)]",
    text: "text-[var(--accent-color)]",
    label: "决策记录",
  },
  patterns: {
    bg: "bg-[var(--success-light)]",
    text: "text-[var(--success)]",
    label: "模式沉淀",
  },
}

function categoryStyle(category: string) {
  return (
    CATEGORY_STYLE[category] ?? {
      bg: "bg-[var(--secondary)]",
      text: "text-[var(--text-secondary)]",
      label: category,
    }
  )
}

// ---------------------------------------------------------------------------
// Editable candidate state
// ---------------------------------------------------------------------------

interface CandidateState {
  candidate: KnowledgeCandidate
  selected: boolean
  editing: boolean
  editTitle: string
  editContent: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function KnowledgeExtractDialog({ projectId, open, onClose }: Props) {
  const { toast } = useToast()
  const backdropRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<CandidateState[]>([])
  const [saving, setSaving] = useState(false)

  // Fetch candidates when dialog opens
  useEffect(() => {
    if (!open) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setItems([])

    api
      .extractKnowledgeCandidates(projectId)
      .then((candidates) => {
        if (cancelled) return
        setItems(
          candidates.map((c) => ({
            candidate: c,
            selected: true,
            editing: false,
            editTitle: c.title,
            editContent: c.content,
          }))
        )
      })
      .catch((err) => {
        if (cancelled) return
        setError(typeof err === "string" ? err : err instanceof Error ? err.message : "提取知识点失败")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, projectId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose, saving])

  // Handlers
  const toggleSelect = useCallback((index: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    )
  }, [])

  const toggleEdit = useCallback((index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              editing: !item.editing,
              // Reset edit fields when closing editor
              ...(!item.editing
                ? {}
                : { editTitle: item.editTitle, editContent: item.editContent }),
            }
          : item
      )
    )
  }, [])

  const updateField = useCallback(
    (index: number, field: "editTitle" | "editContent", value: string) => {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
      )
    },
    []
  )

  const selectedCount = items.filter((i) => i.selected).length

  const handleSave = useCallback(async () => {
    const selected = items.filter((i) => i.selected)
    if (selected.length === 0) {
      onClose()
      return
    }

    setSaving(true)
    try {
      for (const item of selected) {
        await api.addKnowledge({
          category: item.candidate.category,
          title: item.editTitle.trim() || item.candidate.title,
          content: item.editContent.trim() || item.candidate.content,
        })
      }
      toast(`已保存 ${selected.length} 条知识到知识库`, "success")
      onClose()
    } catch (err) {
      toast(
        typeof err === "string" ? err : err instanceof Error ? err.message : "保存失败",
        "error"
      )
    } finally {
      setSaving(false)
    }
  }, [items, onClose, toast])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && !saving) {
      onClose()
    }
  }

  if (!open) return null

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-extract-title"
        className="flex w-full max-w-[560px] max-h-[80vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2
            id="knowledge-extract-title"
            className="text-[18px] font-semibold text-[var(--text-primary)]"
          >
            知识沉淀
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-px bg-[var(--border)]" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-color)]" />
              <p className="text-sm text-[var(--text-secondary)]">分析项目产出物中...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
              <Button variant="ghost" size="sm" onClick={onClose}>
                关闭
              </Button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-[var(--text-secondary)]">未发现可提取的知识点</p>
              <Button variant="ghost" size="sm" onClick={onClose}>
                关闭
              </Button>
            </div>
          )}

          {/* Candidate list */}
          {!loading && !error && items.length > 0 && (
            <div className="flex flex-col gap-3">
              {items.map((item, index) => {
                const style = categoryStyle(item.candidate.category)
                return (
                  <div
                    key={index}
                    className={cn(
                      "rounded-lg border p-4 transition-colors",
                      item.selected
                        ? "border-[var(--accent-color)]/20 bg-[var(--accent-light)]"
                        : "border-[var(--border)] bg-[var(--card)]"
                    )}
                  >
                    {/* Top row: checkbox + badge + title */}
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleSelect(index)}
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          item.selected
                            ? "border-[var(--accent-color)] bg-[var(--accent-color)]"
                            : "border-[var(--border)] bg-transparent hover:border-[var(--accent-color)]"
                        )}
                      >
                        {item.selected && <Check className="h-3 w-3 text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            className={cn(style.bg, style.text, "border-0")}
                          >
                            {style.label}
                          </Badge>
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {item.editing ? "" : item.candidate.title}
                          </span>
                        </div>

                        {/* Content preview (when not editing) */}
                        {!item.editing && (
                          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                            {item.candidate.content}
                          </p>
                        )}

                        {/* Editing mode */}
                        {item.editing && (
                          <div className="mt-2 flex flex-col gap-2">
                            <input
                              type="text"
                              value={item.editTitle}
                              onChange={(e) => updateField(index, "editTitle", e.target.value)}
                              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                              placeholder="标题"
                            />
                            <textarea
                              value={item.editContent}
                              onChange={(e) => updateField(index, "editContent", e.target.value)}
                              rows={3}
                              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm leading-relaxed text-[var(--text-primary)] outline-none resize-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                              placeholder="内容"
                            />
                          </div>
                        )}

                        {/* Source + edit toggle */}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[12px] text-[var(--text-tertiary)]">
                            提取自{item.candidate.source}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleEdit(index)}
                            className="flex items-center gap-0.5 text-[12px] text-[var(--accent-color)] hover:underline"
                          >
                            {item.editing ? (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                收起
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-3 w-3" />
                                编辑
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="h-px bg-[var(--border)]" />
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                跳过
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  `保存选中 (${selectedCount})`
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export { KnowledgeExtractDialog }
export type { Props as KnowledgeExtractDialogProps }
