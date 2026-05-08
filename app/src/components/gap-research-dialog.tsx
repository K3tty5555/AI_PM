import { useState, useCallback, useEffect } from "react"
import { X, HelpCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

type MeetingType = "expert" | "user" | "tech-align" | "team-review"

const MEETING_LABELS: Record<MeetingType, string> = {
  expert: "领域专家访谈",
  user: "真实用户调研",
  "tech-align": "技术对齐会",
  "team-review": "团队评审会",
}

interface GapResearchDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  /** 来自页面的上下文，比如 "PRD §4.2 找题场景" 或空字符串 */
  contextHint?: string
}

export function GapResearchDialog({ open, onClose, projectId, contextHint = "" }: GapResearchDialogProps) {
  const [gaps, setGaps] = useState("")
  const [meeting, setMeeting] = useState<MeetingType>("expert")
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("pm-gap-research", { projectId })

  useEffect(() => {
    if (!open) {
      reset()
      setPhase("setup")
      setGaps("")
    } else if (contextHint) {
      // Pre-fill with context if provided
      setGaps((prev) => prev || contextHint)
    }
  }, [open, contextHint, reset])

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
    if (!gaps.trim() || gaps.trim().length < 30) return
    reset()
    setPhase("running")
    const input = `会议场景：${MEETING_LABELS[meeting]}\n\n已知缺口：\n${gaps.trim()}\n\n请基于以上缺口设计讨论提纲（问题清单 + 记录空白）。`
    run(input)
  }, [gaps, meeting, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setPhase("setup")
  }, [reset])

  if (!open) return null

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 25)) : text ? 100 : 0
  const tooShort = gaps.trim().length > 0 && gaps.trim().length < 30

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !isStreaming) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gap-research-dialog-title"
        className="w-full max-w-[760px] max-h-[88vh] overflow-y-auto rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="size-4 text-[var(--accent-color)]" strokeWidth={1.75} />
            <div>
              <h2 id="gap-research-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">
                缺口讨论提纲
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                已知 PRD 盲区，开会前生成针对性问题清单
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
            <div>
              <p className="mb-2 text-sm text-[var(--text-secondary)]">
                本次会议要填补哪些 PRD 盲区或 Skill 参数空白？
              </p>
              <textarea
                value={gaps}
                onChange={(e) => setGaps(e.target.value)}
                placeholder={"例：\n1. 找题场景下，老师对题型筛选的实际诉求（PRD §4.2 留空，待与一线教师对齐）\n2. 多版本 PRD 的版本树父子关系（项目记忆 L1-decisions 待定）\n3. 第三方题库授权的法务边界（合规约束未与法务同步）"}
                rows={8}
                autoFocus
                className={cn(
                  "w-full rounded-lg px-4 py-3 text-sm",
                  "bg-transparent border border-[var(--border)]",
                  "placeholder:text-[var(--text-tertiary)]",
                  "outline-none resize-y",
                  "focus:border-[var(--accent-color)] transition-[border-color]",
                )}
              />
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                {gaps.trim().length} 字符
                {tooShort && (
                  <span className="ml-2 text-[var(--destructive)]">过短，先把盲区写清楚</span>
                )}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm text-[var(--text-secondary)]">会议场景</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MEETING_LABELS) as MeetingType[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMeeting(m)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs transition-all active:scale-[0.97] cursor-pointer",
                      meeting === m
                        ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]",
                    )}
                  >
                    {MEETING_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStart}
                disabled={!gaps.trim() || tooShort}
              >
                生成讨论提纲
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
                    分析缺口结构中...
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
                  <RefreshCw className="size-3.5 mr-1" /> 重新生成
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
