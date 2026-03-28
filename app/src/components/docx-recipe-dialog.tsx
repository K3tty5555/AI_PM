import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecipeOption {
  id: string
  label: string
  category: "business" | "academic"
  description: string
}

interface DocxRecipeDialogProps {
  open: boolean
  projectIndustry?: string
  onConfirm: (recipe: string) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const RECIPES: RecipeOption[] = [
  { id: "ModernCorporate", label: "现代企业", category: "business", description: "简洁商务风格，适用大多数企业场景" },
  { id: "ExecutiveBrief", label: "高管简报", category: "business", description: "精炼紧凑，适合向高层汇报" },
  { id: "MinimalProposal", label: "极简提案", category: "business", description: "轻量排版，适合内部方案" },
  { id: "ChineseGovernment", label: "中国公文", category: "business", description: "GB/T 9704 标准，仿宋三号字" },
  { id: "HBR", label: "哈佛商业评论", category: "business", description: "Georgia 衬线字体，学术商务" },
  { id: "AcademicThesis", label: "学术论文", category: "academic", description: "Times New Roman 12pt，双倍行距" },
  { id: "IEEE", label: "IEEE", category: "academic", description: "IEEE 会议论文格式，10pt" },
  { id: "ACM", label: "ACM", category: "academic", description: "ACM 计算机协会格式" },
  { id: "APA7", label: "APA 第7版", category: "academic", description: "心理学/社科标准引用格式" },
  { id: "MLA9", label: "MLA 第9版", category: "academic", description: "人文学科引用格式" },
  { id: "ChicagoTurabian", label: "芝加哥格式", category: "academic", description: "历史/艺术学科标准" },
  { id: "SpringerLNCS", label: "Springer LNCS", category: "academic", description: "计算机科学讲义丛书" },
  { id: "Nature", label: "Nature", category: "academic", description: "Nature 期刊投稿格式" },
]

const INDUSTRY_DEFAULTS: Record<string, string[]> = {
  general: ["ModernCorporate"],
  finance: ["ExecutiveBrief", "ChineseGovernment"],
  healthcare: ["ModernCorporate"],
  tech: ["ModernCorporate", "MinimalProposal"],
  education: ["AcademicThesis", "APA7"],
  ecommerce: ["HBR"],
  enterprise: ["ChineseGovernment", "ModernCorporate"],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DocxRecipeDialog({ open, projectIndustry, onConfirm, onCancel }: DocxRecipeDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const defaults = INDUSTRY_DEFAULTS[projectIndustry || "general"] || ["ModernCorporate"]
  const [selected, setSelected] = useState(defaults[0])

  useEffect(() => {
    if (open) setSelected(defaults[0])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel() }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  const recommended = RECIPES.filter(r => defaults.includes(r.id))
  const business = RECIPES.filter(r => r.category === "business" && !defaults.includes(r.id))
  const academic = RECIPES.filter(r => r.category === "academic" && !defaults.includes(r.id))

  const renderItem = (recipe: RecipeOption) => (
    <button
      key={recipe.id}
      onClick={() => setSelected(recipe.id)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-all cursor-pointer",
        selected === recipe.id
          ? "border-[var(--accent-color)] bg-[var(--accent-light)]"
          : "border-[var(--border)] hover:border-[var(--accent-color)]/40"
      )}
    >
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", selected === recipe.id ? "text-[var(--accent-color)]" : "text-[var(--text-primary)]")}>
          {recipe.label}
        </p>
        <p className="text-[11px] text-[var(--text-secondary)] leading-snug mt-0.5">{recipe.description}</p>
      </div>
    </button>
  )

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
        className="w-full max-w-[480px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">DOCX 排版配方</h2>

        <div className="mb-4 max-h-[400px] overflow-y-auto space-y-3 pr-1">
          {/* Recommended */}
          {recommended.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-[var(--accent-color)]">推荐</p>
              <div className="space-y-1.5">{recommended.map(renderItem)}</div>
            </div>
          )}

          {/* Business */}
          {business.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">商务通用</p>
              <div className="space-y-1.5">{business.map(renderItem)}</div>
            </div>
          )}

          {/* Academic */}
          {academic.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">学术规范</p>
              <div className="space-y-1.5">{academic.map(renderItem)}</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
            取消
          </button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(selected)}>
            导出 DOCX
          </Button>
        </div>
      </div>
    </div>
  )
}

export { DocxRecipeDialog }
export type { DocxRecipeDialogProps }
