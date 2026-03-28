import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api, type PrdSample } from "@/lib/tauri-api"
import { PrdViewer } from "@/components/prd-viewer"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SamplePrdDialogProps {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INDUSTRY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  tech: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", label: "科技" },
  ecommerce: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", label: "电商" },
  enterprise: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "企业" },
  general: { bg: "bg-gray-100 dark:bg-gray-800/50", text: "text-gray-600 dark:text-gray-400", label: "通用" },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SamplePrdDialog({ open, onClose }: SamplePrdDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [samples, setSamples] = useState<PrdSample[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(true)

  // Load sample list on open
  useEffect(() => {
    if (!open) return
    setListLoading(true)
    api.listPrdSamples()
      .then((list) => {
        setSamples(list)
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].id)
        }
      })
      .catch((err) => console.error("[SamplePrdDialog]", err))
      .finally(() => setListLoading(false))
  }, [open])

  // Load content when selection changes
  useEffect(() => {
    if (!selectedId || !open) return
    setLoading(true)
    setContent(null)
    api.getPrdSampleContent(selectedId)
      .then(setContent)
      .catch((err) => console.error("[SamplePrdDialog]", err))
      .finally(() => setLoading(false))
  }, [selectedId, open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex w-[820px] max-w-[90vw] max-h-[80vh] rounded-xl",
          "bg-[var(--background)] border border-[var(--border)]",
          "shadow-[var(--shadow-lg)] overflow-hidden",
        )}
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* Left panel — sample list */}
        <div className="w-[200px] shrink-0 border-r border-[var(--border)] flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              样例 PRD
            </h2>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              参考不同行业的写法
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {listLoading ? (
              <p className="px-4 py-3 text-[12px] text-[var(--text-tertiary)]">加载中...</p>
            ) : samples.length === 0 ? (
              <p className="px-4 py-3 text-[12px] text-[var(--text-tertiary)]">
                暂无样例文件
              </p>
            ) : (
              samples.map((s) => {
                const ic = INDUSTRY_COLORS[s.industry] ?? INDUSTRY_COLORS.general
                const isActive = s.id === selectedId
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 transition-colors",
                      isActive
                        ? "bg-[var(--accent-color)]/8 border-l-2 border-l-[var(--accent-color)]"
                        : "hover:bg-[var(--hover-bg)] border-l-2 border-l-transparent",
                    )}
                  >
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                      {s.label}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium",
                          ic.bg,
                          ic.text,
                        )}
                      >
                        {ic.label}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {s.lineCount} 行
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right panel — content preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">
              {selectedId ? `sample-${selectedId}.md` : "选择左侧样例查看"}
            </span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <p className="text-[13px] text-[var(--text-tertiary)]">加载中...</p>
            ) : content ? (
              <PrdViewer markdown={content} isStreaming={false} editable={false} />
            ) : (
              <p className="text-[13px] text-[var(--text-tertiary)]">
                {samples.length > 0 ? "选择左侧样例查看内容" : "暂无样例文件"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { SamplePrdDialog }
