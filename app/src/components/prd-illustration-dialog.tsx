import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

// ---------------------------------------------------------------------------
// Storage key — 用 localStorage 记住「本项目跳过」偏好
// ---------------------------------------------------------------------------

export const PRD_ILLUSTRATION_SKIP_KEY = "prd_illustration_skip"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onConfirm: (enabled: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrdIllustrationDialog({ open, onConfirm }: Props) {
  const [remember, setRemember] = useState(false)

  // Escape 键 = 跳过
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handle(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  function handle(enabled: boolean) {
    if (remember && !enabled) {
      localStorage.setItem(PRD_ILLUSTRATION_SKIP_KEY, "1")
    }
    onConfirm(enabled)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
      onClick={() => handle(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prd-illustration-dialog-title"
        className="w-full max-w-[420px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)] space-y-4"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--accent-color)]" />
          <h2
            id="prd-illustration-dialog-title"
            className="text-base font-semibold text-[var(--text-primary)]"
          >
            是否开启 AI 配图？
          </h2>
        </div>

        <div className="h-px bg-[var(--border)]" />

        {/* 说明 */}
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          PRD 生成完毕后，自动扫描所有 Mermaid 流程图，调用 Seedream API 渲染为高清插图并嵌入 PRD。
        </p>

        {/* 费用提示 */}
        <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
          ⚠️ 会产生 API 费用，每张约 0.1–0.3 元。
        </p>

        {/* 记住选择 */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-tertiary)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="rounded"
          />
          本项目不再询问（跳过）
        </label>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-1">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => handle(true)}
          >
            开启（推荐）
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => handle(false)}
          >
            跳过
          </Button>
        </div>
      </div>
    </div>
  )
}
