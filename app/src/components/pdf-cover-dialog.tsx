import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoverOption {
  id: string
  label: string
  category: string
  features: string
  bgColor: string
  textColor: string
}

interface PdfCoverDialogProps {
  open: boolean
  projectIndustry?: string
  onConfirm: (coverStyle: string) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Data (static — matches pdf-covers.json)
// ---------------------------------------------------------------------------

const COVERS: CoverOption[] = [
  { id: "fullbleed", label: "深色全幅", category: "general", features: "深色背景 + 点阵网格", bgColor: "#1a1a2e", textColor: "#ffffff" },
  { id: "minimal", label: "极简侧线", category: "general", features: "左侧强调条 + 大量留白", bgColor: "#ffffff", textColor: "#374151" },
  { id: "report", label: "正式报告", category: "general", features: "深色头部横幅", bgColor: "#1e293b", textColor: "#f1f5f9" },
  { id: "split", label: "分栏提案", category: "formal", features: "左色块 + 右内容", bgColor: "#ffffff", textColor: "#1a1a1a" },
  { id: "proposal", label: "商业提案", category: "formal", features: "顶部色带 + 正式排版", bgColor: "#ffffff", textColor: "#1e293b" },
  { id: "frame", label: "边框证书", category: "formal", features: "内缩边框 + 角饰", bgColor: "#fffdf7", textColor: "#44403c" },
  { id: "diagonal", label: "斜切创意", category: "creative", features: "对角切割双色", bgColor: "#ffffff", textColor: "#1a1a1a" },
  { id: "stripe", label: "三色带", category: "creative", features: "三条水平色带", bgColor: "#ffffff", textColor: "#1f2937" },
  { id: "poster", label: "海报风", category: "creative", features: "粗左边栏色块", bgColor: "#ffffff", textColor: "#1a1a1a" },
  { id: "editorial", label: "编辑出版", category: "creative", features: "幽灵首字母装饰", bgColor: "#ffffff", textColor: "#18181b" },
  { id: "typographic", label: "字体主导", category: "academic", features: "超大首词 + 下划线", bgColor: "#fafaf9", textColor: "#292524" },
  { id: "atmospheric", label: "光晕暗调", category: "academic", features: "径向光晕效果", bgColor: "#0f0f1a", textColor: "#e2e8f0" },
  { id: "magazine", label: "杂志风", category: "special", features: "暖奶油底色", bgColor: "#fef9ef", textColor: "#292524" },
  { id: "darkroom", label: "暗房影调", category: "special", features: "海军蓝 + 灰度", bgColor: "#0c1929", textColor: "#cbd5e1" },
  { id: "terminal", label: "极客终端", category: "special", features: "霓虹绿文字", bgColor: "#0a0a0a", textColor: "#22c55e" },
]

const CATEGORIES = [
  { id: "general", label: "通用" },
  { id: "formal", label: "正式" },
  { id: "creative", label: "创意" },
  { id: "academic", label: "学术" },
  { id: "special", label: "特殊" },
]

const INDUSTRY_DEFAULTS: Record<string, string> = {
  general: "minimal",
  finance: "split",
  healthcare: "minimal",
  tech: "fullbleed",
  education: "typographic",
  ecommerce: "poster",
  enterprise: "report",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PdfCoverDialog({ open, projectIndustry, onConfirm, onCancel }: PdfCoverDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const recommended = INDUSTRY_DEFAULTS[projectIndustry || "general"] || "minimal"
  const [selected, setSelected] = useState(recommended)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(recommended)
      setShowAll(false)
    }
  }, [open, recommended])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  const recommendedCover = COVERS.find((c) => c.id === recommended)

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onCancel() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[520px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">PDF 封面样式</h2>

        {/* Recommended */}
        {recommendedCover && (
          <div className="mb-4">
            <p className="mb-2 text-[12px] text-[var(--text-tertiary)]">推荐封面</p>
            <button
              onClick={() => setSelected(recommendedCover.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer",
                selected === recommendedCover.id
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)]"
                  : "border-[var(--border)] hover:border-[var(--accent-color)]/40"
              )}
            >
              <div
                className="size-10 shrink-0 rounded-md border border-[var(--border)]"
                style={{ backgroundColor: recommendedCover.bgColor }}
              >
                <div className="flex h-full items-center justify-center text-[8px] font-bold" style={{ color: recommendedCover.textColor }}>
                  PDF
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{recommendedCover.label}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">{recommendedCover.features}</p>
              </div>
            </button>
          </div>
        )}

        {/* Show all toggle */}
        {!showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="mb-4 text-[13px] text-[var(--accent-color)] hover:opacity-70 transition-opacity cursor-pointer"
          >
            更多选择 ({COVERS.length - 1} 款)
          </button>
        )}

        {/* All covers by category */}
        {showAll && (
          <div className="mb-4 max-h-[320px] overflow-y-auto space-y-3 pr-1">
            {CATEGORIES.map((cat) => {
              const items = COVERS.filter((c) => c.category === cat.id)
              if (items.length === 0) return null
              return (
                <div key={cat.id}>
                  <p className="mb-1.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">{cat.label}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((cover) => (
                      <button
                        key={cover.id}
                        onClick={() => setSelected(cover.id)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border p-2 transition-all cursor-pointer",
                          selected === cover.id
                            ? "border-[var(--accent-color)] bg-[var(--accent-light)]"
                            : "border-[var(--border)] hover:border-[var(--accent-color)]/40"
                        )}
                      >
                        <div
                          className="size-8 rounded border border-[var(--border)]"
                          style={{ backgroundColor: cover.bgColor }}
                        >
                          <div className="flex h-full items-center justify-center text-[6px] font-bold" style={{ color: cover.textColor }}>
                            PDF
                          </div>
                        </div>
                        <span className="text-[10px] text-[var(--text-secondary)] text-center leading-tight">{cover.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            取消
          </button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(selected)}>
            导出 PDF
          </Button>
        </div>
      </div>
    </div>
  )
}

export { PdfCoverDialog }
export type { PdfCoverDialogProps }
