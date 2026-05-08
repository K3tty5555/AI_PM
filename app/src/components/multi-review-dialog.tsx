import { useState, useCallback, useEffect } from "react"
import { X, Microscope, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

type Scope = "auto" | "fullstack" | "frontend" | "backend"

const SCOPE_LABELS: Record<Scope, string> = {
  auto: "自动识别",
  fullstack: "全栈",
  frontend: "纯前端",
  backend: "纯后端",
}

interface MultiReviewDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  /** 预填的待审视文档内容（来自当前 PRD/原型/分析页） */
  initialContent: string
  /** 文档来源描述（例 "PRD V1.1" / "原型 默认版本" / "需求分析报告"），仅用于标题 */
  sourceLabel: string
}

export function MultiReviewDialog({
  open,
  onClose,
  projectId,
  initialContent,
  sourceLabel,
}: MultiReviewDialogProps) {
  const [scope, setScope] = useState<Scope>("auto")
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("multi-perspective-review", { projectId })

  useEffect(() => {
    if (!open) {
      reset()
      setPhase("setup")
    }
  }, [open, reset])

  useEffect(() => {
    if (!isStreaming && phase === "running" && text) {
      setPhase("done")
    }
  }, [isStreaming, phase, text])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !isStreaming) onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, isStreaming, onClose])

  const handleStart = useCallback(() => {
    if (!initialContent || initialContent.trim().length < 50) return
    reset()
    setPhase("running")
    const prefix = scope === "auto"
      ? ""
      : `（请直接按"${SCOPE_LABELS[scope]}"范围派发审视者，跳过自动识别。）\n\n`
    run(prefix + initialContent.trim())
  }, [initialContent, scope, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setPhase("setup")
  }, [reset])

  if (!open) return null

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 25)) : text ? 100 : 0
  const charCount = initialContent.trim().length
  const tooShort = charCount < 50

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !isStreaming) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-review-dialog-title"
        className="w-full max-w-[760px] max-h-[88vh] overflow-y-auto rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Microscope className="size-4 text-[var(--accent-color)]" strokeWidth={1.75} />
            <div>
              <h2 id="multi-review-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">
                多视角审视
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                目标：{sourceLabel} · {charCount} 字符
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isStreaming}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="h-px bg-[var(--border)] mb-4" />

        {/* Setup */}
        {phase === "setup" && (
          <div className="space-y-4">
            {tooShort ? (
              <div className="rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
                <p className="text-sm text-[var(--destructive)]">
                  当前内容过短（&lt; 50 字符），不值得审视。先生成内容再来。
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                将拿当前页面内容派发给多个角色（架构师 / 后端 / 前端 / UI/UX）并行审视，汇总问题清单。
              </p>
            )}

            <div>
              <p className="mb-2 text-sm text-[var(--text-secondary)]">审视范围</p>
              <div className="flex gap-2">
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs transition-all active:scale-[0.97] cursor-pointer",
                      scope === s
                        ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]",
                    )}
                  >
                    {SCOPE_LABELS[s]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                {scope === "auto"
                  ? "由 skill 根据文档关键词自动判定（推荐）"
                  : `跳过自动识别，强制按"${SCOPE_LABELS[scope]}"派发审视者`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
              <Button variant="primary" size="sm" onClick={handleStart} disabled={tooShort}>
                开始审视
              </Button>
            </div>
          </div>
        )}

        {/* Running / Done */}
        {phase !== "setup" && (
          <div>
            {isStreaming && (
              <div className="mb-4">
                <ProgressBar value={progressValue} animated />
                {isThinking && (
                  <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">
                    并行派发审视者中...
                  </p>
                )}
                <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
                  {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                  {String(elapsedSeconds % 60).padStart(2, "0")}
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
                <p className="text-sm text-[var(--destructive)]">{error}</p>
              </div>
            )}

            <PrdViewer markdown={text} isStreaming={isStreaming} />

            {!isStreaming && phase === "done" && streamMeta && (
              <p className="mt-4 text-xs text-[var(--text-tertiary)]">
                {streamMeta.inputTokens != null
                  ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                  : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
              </p>
            )}

            {!isStreaming && phase === "done" && (
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RefreshCw className="size-3.5 mr-1" /> 重新审视
                </Button>
                <Button variant="primary" size="sm" onClick={onClose}>关闭</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
