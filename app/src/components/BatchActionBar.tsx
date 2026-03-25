import { Archive, Download, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface BatchActionBarProps {
  selectedCount: number
  totalCount: number
  isAllSelected: boolean
  onToggleSelectAll: () => void
  onArchive: () => void
  onExport: () => void
  onDelete: () => void
  onExit: () => void
  exporting?: boolean
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  isAllSelected,
  onToggleSelectAll,
  onArchive,
  onExport,
  onDelete,
  onExit,
  exporting = false,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "flex items-center justify-between",
        "h-14 px-6",
        "bg-[var(--background)]/80 backdrop-blur-xl",
        "border-t border-[var(--border)]",
        "shadow-[0_-2px_12px_rgba(0,0,0,0.06)]",
      )}
      style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
    >
      {/* Left: select all + count */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onToggleSelectAll}
            className="size-4 rounded border-[var(--border)] accent-[var(--accent-color)]"
          />
          <span className="text-xs text-[var(--text-secondary)]">全选</span>
        </label>
        <span
          className="text-sm font-medium text-[var(--text-primary)]"
          aria-live="polite"
        >
          已选 {selectedCount} 个项目
        </span>
        {selectedCount < totalCount && (
          <span className="text-xs text-[var(--text-tertiary)]">
            / 共 {totalCount} 个
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onArchive}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
            "text-sm text-[var(--text-primary)]",
            "hover:bg-[var(--hover-bg)] transition-all duration-150 active:scale-[0.97]",
          )}
        >
          <Archive className="size-3.5" strokeWidth={1.75} />
          归档
        </button>
        <button
          onClick={onExport}
          disabled={exporting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
            "text-sm text-[var(--text-primary)]",
            "hover:bg-[var(--hover-bg)] transition-all duration-150 active:scale-[0.97]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Download className="size-3.5" strokeWidth={1.75} />
          {exporting ? "导出中..." : "导出"}
        </button>
        <button
          onClick={onDelete}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
            "text-sm text-[var(--destructive)]",
            "hover:bg-[var(--destructive)]/10 transition-all duration-150 active:scale-[0.97]",
          )}
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
          删除
        </button>
        <div className="mx-1 h-5 w-px bg-[var(--border)]" />
        <button
          onClick={onExit}
          className="flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-all duration-150"
          title="退出选择模式"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
