import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// ExportDropdown
// ---------------------------------------------------------------------------

export interface ExportDropdownProps {
  onCopyMd: () => void
  copied: boolean
  onPrint: () => void
  onExportDocx: () => void
  onExportPdf?: () => void
  onExportPptx?: () => void
  onExportShareHtml: () => void
  exporting: boolean
}

function ExportDropdown({
  onCopyMd,
  copied,
  onPrint,
  onExportDocx,
  onExportPdf,
  onExportPptx,
  onExportShareHtml,
  exporting,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleItem = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
        className="gap-1"
      >
        {exporting ? "导出中..." : "导出"}
        <ChevronDown className="size-3" strokeWidth={2} />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50",
            "w-44 rounded-lg border border-[var(--border)] bg-[var(--background)]",
            "shadow-[var(--shadow-lg)] py-1",
          )}
          style={{ animation: "fadeInUp 120ms var(--ease-decelerate)" }}
        >
          <button
            onClick={() => handleItem(onCopyMd)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            {copied ? "已复制 \u2713" : "复制 Markdown"}
          </button>
          <button
            onClick={() => handleItem(onPrint)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            打印 / PDF
          </button>
          <button
            onClick={() => handleItem(onExportDocx)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            导出 DOCX
          </button>
          {onExportPdf && (
            <button
              onClick={() => handleItem(onExportPdf)}
              className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              导出 PDF
            </button>
          )}
          {onExportPptx && (
            <button
              onClick={() => handleItem(onExportPptx)}
              className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              导出 PPT
            </button>
          )}
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            onClick={() => handleItem(onExportShareHtml)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            生成分享页
          </button>
        </div>
      )}
    </div>
  )
}

export { ExportDropdown }
