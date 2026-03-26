import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { HistoryList } from "@/components/history-list"
import { useToolStream } from "@/hooks/use-tool-stream"
import { TemplateUpload } from "@/components/template-upload"
import { useToast, type ToastVariant } from "@/hooks/use-toast"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn, copyRichText } from "@/lib/utils"
import { api, type WeeklyReportMeta } from "@/lib/tauri-api"

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "generate" | "history"

// ─── Main Component ─────────────────────────────────────────────────────────

export function ToolWeeklyPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>("generate")
  const [refreshKey, setRefreshKey] = useState(0)

  const handleGenerated = useCallback(() => {
    // Bump refresh key so history tab reloads when switched to
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">工作周报</h1>
        <span className="text-sm text-[var(--text-secondary)]">AI 辅助整理本周工作</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Segmented control tabs */}
      <SegmentedControl
        value={tab}
        onChange={setTab}
        items={[
          { key: "generate", label: "生成周报" },
          { key: "history", label: "历史记录" },
        ]}
        className="mt-4"
      />

      <div role="tabpanel">
        {tab === "generate" ? (
          <GenerateTab toast={toast} onGenerated={handleGenerated} setTab={setTab} />
        ) : (
          <HistoryTab key={refreshKey} toast={toast} />
        )}
      </div>
    </div>
  )
}

// ─── Generate Tab ────────────────────────────────────────────────────────────

function GenerateTab({
  toast,
  onGenerated,
  setTab,
}: {
  toast: (msg: string, variant?: ToastVariant) => void
  onGenerated: () => void
  setTab: (t: Tab) => void
}) {
  const [input, setInput] = useState("")
  const [templatePath, setTemplatePath] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-weekly")

  const handleRun = useCallback((mode: "brief" | "detail") => {
    if (!input.trim()) return
    reset()
    setSaved(false)
    const modeHint = mode === "brief"
      ? "\n\n请生成向上汇报版周报（简洁版）"
      : "\n\n请生成团队同步版周报（详细版）"
    let userInput = input.trim() + modeHint
    if (templatePath) {
      userInput += `\n\n---\n\n请严格按照以下模板的格式和结构输出周报。模板文件路径：${templatePath}`
    }
    // Pass mode as 3rd arg — forwarded to Rust RunToolArgs.mode for frontmatter
    run(userInput, undefined, mode)
  }, [input, templatePath, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
    setTemplatePath(null)
    setSaved(false)
  }, [reset])

  // Show "已自动保存" after generation completes
  useEffect(() => {
    if (!isStreaming && text && streamMeta) {
      setSaved(true)
      onGenerated()
    }
  }, [isStreaming, text, streamMeta, onGenerated])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <>
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
          <div className="mt-3 flex items-center gap-3">
            <TemplateUpload label="周报模板" storageKey="weekly" value={templatePath} onSelect={setTemplatePath} />
          </div>
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
            <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">思考中...</p>
          )}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">重置</Button>
        </div>
      )}

      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--text-secondary)]">结果</span>
              {saved && (
                <>
                  <span className="text-[12px] text-[var(--text-tertiary)]">· 已自动保存</span>
                  <button
                    onClick={() => setTab("history")}
                    className="text-[12px] text-[var(--accent-color)] hover:underline"
                  >
                    查看历史
                  </button>
                </>
              )}
            </div>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset}>重新生成</Button>
                <Button variant="ghost" size="sm" onClick={() => copyRichText(text).then(() => toast("已复制富文本", "success"))}>复制</Button>
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
    </>
  )
}

// ─── History Tab ─────────────────────────────────────────────────────────────

const modeLabel = (mode: string) => mode === "brief" ? "向上汇报版" : "团队同步版"

function HistoryTab({ toast }: { toast: (msg: string, variant?: ToastVariant) => void }) {
  return (
    <HistoryList<WeeklyReportMeta>
      loadItems={api.listWeeklyReports}
      getContent={api.getWeeklyReport}
      deleteItem={api.deleteWeeklyReport}
      getFilename={(r) => r.filename}
      renderHeader={(r) => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-primary)]">
            {r.date.replace("T", " ").slice(0, 16)}
          </span>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            r.mode === "brief"
              ? "bg-[var(--accent-light)] text-[var(--accent-color)]"
              : "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]"
          )}>
            {modeLabel(r.mode)}
          </span>
        </div>
      )}
      toast={toast}
      emptyMessage="还没有生成过周报"
    />
  )
}
