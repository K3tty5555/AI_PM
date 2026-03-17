import { useState, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { ProjectSelector } from "@/components/project-selector"
import { useToolStream } from "@/hooks/use-tool-stream"
import { cn } from "@/lib/utils"

export function ToolDataPage() {
  const [filePath, setFilePath] = useState("")
  const [analysisGoal, setAnalysisGoal] = useState("")
  const [searchParams] = useSearchParams()
  const initialProjectId = searchParams.get("projectId") ?? localStorage.getItem("tool-binding:data") ?? null
  const [boundProjectId, setBoundProjectId] = useState<string | null>(initialProjectId)
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("ai-pm-data", boundProjectId ?? undefined)

  const handleSelectFile = useCallback(async () => {
    const selected = await openDialog({
      filters: [{ name: "数据文件", extensions: ["csv", "txt", "md"] }],
    })
    if (selected && typeof selected === "string") {
      setFilePath(selected)
    }
  }, [])

  const handleRun = useCallback(() => {
    if (!filePath) return
    reset()
    const goal = analysisGoal.trim() || "请对数据进行全面洞察分析，发现关键趋势和问题"
    run(goal, filePath)
  }, [filePath, analysisGoal, run, reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 30)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">数据洞察</h1>
        <span className="text-sm text-[var(--text-secondary)]">数据洞察分析</span>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <ProjectSelector
        toolKey="data"
        value={boundProjectId}
        onChange={setBoundProjectId}
        className="mt-4"
      />

      {!isStreaming && !text && (
        <div className="mt-6 space-y-4">
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">选择数据文件（支持 CSV / TXT）</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                readOnly
                placeholder="未选择文件..."
                className={cn(
                  "flex-1 h-9 px-3 text-sm bg-transparent border border-[var(--border)]",
                  "placeholder:text-[var(--text-muted)] outline-none"
                )}
              />
              <Button variant="ghost" size="sm" onClick={handleSelectFile}>选择文件</Button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">分析目标（可选）</p>
            <input
              type="text"
              value={analysisGoal}
              onChange={(e) => setAnalysisGoal(e.target.value)}
              placeholder="例：找出用户流失的关键节点"
              className={cn(
                "w-full rounded-lg h-9 px-3 text-sm bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-muted)] outline-none",
                "focus:border-[var(--accent-color)] transition-[border-color]"
              )}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleRun} disabled={!filePath}>开始分析</Button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">正在思考···</p>}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => { reset(); setFilePath(""); setAnalysisGoal("") }} className="mt-2">重置</Button>
        </div>
      )}

      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">分析结果</span>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { reset(); setFilePath(""); setAnalysisGoal("") }}>重新分析</Button>
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
