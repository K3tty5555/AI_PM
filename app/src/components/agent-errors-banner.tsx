import { useEffect, useState, useCallback } from "react"
import { AlertTriangle, RefreshCw, X, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, type AgentErrorEntry } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"

interface AgentErrorsBannerProps {
  projectId: string
  /** Trigger that should re-fetch errors (e.g., increment after a stream finishes) */
  refreshKey?: number
  /** Click handler for "重试该 wave"; receives the wave prefix (e.g. "wave1") */
  onRetry?: (wavePrefix: string) => void
}

/** Group entries by wave prefix (wave1_xxx → wave1) */
function groupByWave(entries: AgentErrorEntry[]): Record<string, AgentErrorEntry[]> {
  const grouped: Record<string, AgentErrorEntry[]> = {}
  for (const e of entries) {
    const m = e.key.match(/^(wave\d+)_/)
    const prefix = m ? m[1] : "其他"
    if (!grouped[prefix]) grouped[prefix] = []
    grouped[prefix].push(e)
  }
  return grouped
}

export function AgentErrorsBanner({ projectId, refreshKey, onRetry }: AgentErrorsBannerProps) {
  const { toast } = useToast()
  const [errors, setErrors] = useState<AgentErrorEntry[]>([])
  const [clearing, setClearing] = useState(false)

  const reload = useCallback(async () => {
    try {
      const list = await api.getAgentErrors(projectId)
      setErrors(list)
    } catch (err) {
      console.warn("[AgentErrorsBanner] load:", err)
    }
  }, [projectId])

  useEffect(() => { reload() }, [reload, refreshKey])

  const handleClearOne = useCallback(async (key: string) => {
    setClearing(true)
    try {
      await api.clearAgentErrors(projectId, [key])
      await reload()
    } catch (err) {
      toast(`清除失败：${String(err)}`, "error")
    } finally {
      setClearing(false)
    }
  }, [projectId, reload, toast])

  const handleClearAll = useCallback(async () => {
    setClearing(true)
    try {
      await api.clearAgentErrors(projectId, [])
      setErrors([])
    } catch (err) {
      toast(`清除失败：${String(err)}`, "error")
    } finally {
      setClearing(false)
    }
  }, [projectId, toast])

  if (errors.length === 0) return null

  const grouped = groupByWave(errors)
  const groupKeys = Object.keys(grouped).sort()

  return (
    <div
      className="mb-4 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-3"
      style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="size-4 text-[var(--destructive)]" strokeWidth={1.75} />
        <p className="text-sm font-medium text-[var(--text-primary)]">
          检测到 {errors.length} 个 Agent Wave 失败
        </p>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={clearing}
          className="ml-auto text-[11px] text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors cursor-pointer flex items-center gap-1"
        >
          <Trash2 className="size-3" strokeWidth={1.75} />
          全部清除
        </button>
      </div>

      <div className="space-y-2">
        {groupKeys.map((prefix) => (
          <div key={prefix} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
                {prefix}
              </span>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {grouped[prefix].length} 条失败
              </span>
              {onRetry && grouped[prefix].some((e) => e.retryable) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => onRetry(prefix)}
                >
                  <RefreshCw className="size-3 mr-1" strokeWidth={1.75} />
                  重试
                </Button>
              )}
            </div>
            <ul className="space-y-1">
              {grouped[prefix].map((e) => (
                <li key={e.key} className="flex items-start gap-2 text-[12px]">
                  <span className="font-mono text-[var(--text-tertiary)] truncate min-w-[120px] max-w-[180px]">
                    {e.key.replace(`${prefix}_`, "")}
                  </span>
                  <span className="flex-1 text-[var(--text-secondary)] truncate">
                    {e.error || "（无错误描述）"}
                  </span>
                  {!e.retryable && (
                    <span className="rounded bg-[var(--secondary)] px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                      不可重试
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleClearOne(e.key)}
                    disabled={clearing}
                    className="text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors cursor-pointer"
                    aria-label="清除"
                  >
                    <X className="size-3" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
        提示：客户端可触发整 phase 重新生成；CLI 端可用 <code className="rounded bg-[var(--secondary)] px-1 py-0.5 font-mono">/ai-pm --team --retry=waveN</code> 仅重跑失败的 subagent。
      </p>
    </div>
  )
}
