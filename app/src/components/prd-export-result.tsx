import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/tauri-api"
import { FILE_MANAGER_LABEL } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrdExportResultProps {
  result: { path: string } | { error: string } | null
  onReset: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PrdExportResult({ result, onReset }: PrdExportResultProps) {
  const navigate = useNavigate()

  if (!result) return null

  if ("error" in result) {
    const err = result.error
    const needsDep =
      err.includes("python3") ||
      err.includes("python-docx") ||
      err.includes("pip3")

    return (
      <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-[var(--destructive)]">{err}</p>
          {needsDep && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 px-2 text-xs text-[var(--accent-color)]"
              onClick={() => navigate("/settings")}
            >
              前往设置安装
            </Button>
          )}
        </div>
        <button onClick={onReset} className="mt-1 text-[12px] text-[var(--text-tertiary)] hover:opacity-70">关闭</button>
      </div>
    )
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--success)]" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
        已导出：{result.path}
      </p>
      <button
        onClick={() => api.revealFile(result.path)}
        className="shrink-0 text-[13px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
      >
        在 {FILE_MANAGER_LABEL} 中显示
      </button>
      <button onClick={onReset} className="shrink-0 text-[12px] text-[var(--text-tertiary)] hover:opacity-70" aria-label="关闭">×</button>
    </div>
  )
}

export { PrdExportResult }
export type { PrdExportResultProps }
