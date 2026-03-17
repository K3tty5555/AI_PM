import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open: boolean
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "default"
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  open,
  title = "// CONFIRM",
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onCancel() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      style={{ animation: "fadeInUp 0.15s ease-out" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-[400px] border border-[var(--border)] bg-[var(--background)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{ animation: "fadeInUp 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* HUD 标题 */}
        <div className="mb-4">
          <span
            id="confirm-dialog-title"
            className="font-terminal text-xs font-medium uppercase tracking-[3px] text-[var(--text-muted)]"
          >
            {title}
          </span>
        </div>

        {/* 分隔线 */}
        <div className="mb-4 h-px bg-[var(--border)]" />

        {/* 描述文字 */}
        <p className="mb-6 text-sm leading-relaxed text-[var(--dark)]">
          {description}
        </p>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export { ConfirmDialog }
export type { ConfirmDialogProps }
