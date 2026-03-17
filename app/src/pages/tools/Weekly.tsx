import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

export function ToolWeeklyPage() {
  const [input, setInput] = useState("")
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-weekly")

  const handleRun = useCallback((mode: "brief" | "detail") => {
    if (!input.trim()) return
    reset()
    const modeHint = mode === "brief"
      ? "\n\n请生成向上汇报版周报（简洁版，--brief 模式）"
      : "\n\n请生成团队同步版周报（详细版，--detail 模式）"
    run(input.trim() + modeHint)
  }, [input, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">工作周报</h1>
        <span className="text-sm text-[var(--text-secondary)]">工作周报生成</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {!isStreaming && !text && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            随意描述本周工作内容，不需要特定格式
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"这周主要跟进了 NPS 量表需求，和运营对齐了触发策略，修复了一个登录 bug，前端联调了 2 个接口。下周要推进用户故事评审。"}
            rows={6}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-secondary)]",
              "outline-none resize-none",
              "focus:border-[var(--accent-color)] transition-[border-color]"
            )}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleRun("brief")} disabled={!input.trim()}>
              向上汇报版
            </Button>
            <Button variant="primary" onClick={() => handleRun("detail")} disabled={!input.trim()}>
              团队同步版
            </Button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && (
            <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">正在思考···</p>
          )}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">重置</Button>
        </div>
      )}

      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">结果</span>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset}>重新生成</Button>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text)}>复制</Button>
              </div>
            )}
          </div>
          <PrdViewer markdown={text} isStreaming={isStreaming} />
          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
