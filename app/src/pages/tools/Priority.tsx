import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { HistoryList } from "@/components/history-list"
import { useToolStream } from "@/hooks/use-tool-stream"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { TemplateUpload } from "@/components/template-upload"
import { useToast, type ToastVariant } from "@/hooks/use-toast"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn, copyRichText } from "@/lib/utils"
import { api, type PriorityReportMeta } from "@/lib/tauri-api"

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseReplyTemplates(text: string): Array<{ name: string; content: string }> {
  const match = text.match(/\[REPLY_TEMPLATES\]([\s\S]*?)\[\/REPLY_TEMPLATES\]/)
  if (!match) return []
  const block = match[1].trim()
  const sections = block.split(/(?=^### )/m).filter(Boolean)
  return sections
    .map((section) => {
      const lines = section.trim().split("\n")
      const name = lines[0].replace(/^### /, "").trim()
      const content = lines.slice(1).join("\n").trim()
      return { name, content }
    })
    .filter((t) => t.name && t.content)
}

function stripReplyTemplates(text: string): string {
  return text.replace(/\[REPLY_TEMPLATES\][\s\S]*?\[\/REPLY_TEMPLATES\]/g, "").trimEnd()
}

/** Count requirement lines from user input (numbered lines or non-empty lines) */
function countRequirements(input: string): number {
  const lines = input.trim().split("\n").filter((l) => l.trim())
  // If lines start with numbers (1. 2. 3. ...), count numbered lines
  const numbered = lines.filter((l) => /^\d+[.)、．]\s*/.test(l.trim()))
  return numbered.length > 0 ? numbered.length : lines.length
}

type Tab = "generate" | "history"
type TimeFilter = "all" | "week" | "month" | "quarter"

const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "week", label: "近一周" },
  { key: "month", label: "近一月" },
  { key: "quarter", label: "近三月" },
]

function getTimeFilterDate(filter: TimeFilter): Date | null {
  if (filter === "all") return null
  const now = new Date()
  const days = filter === "week" ? 7 : filter === "month" ? 30 : 90
  now.setDate(now.getDate() - days)
  return now
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ToolPriorityPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>("generate")
  const [refreshKey, setRefreshKey] = useState(0)

  const handleGenerated = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">需求优先级</h1>
        <span className="text-sm text-[var(--text-secondary)]">需求优先级评估 — 四维评分模型</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Segmented control tabs */}
      <SegmentedControl
        value={tab}
        onChange={setTab}
        items={[
          { key: "generate", label: "评估需求" },
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
  const [filePath, setFilePath] = useState<string | null>(null)
  const [templatePath, setTemplatePath] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Array<{ name: string; content: string }>>([])
  const [saved, setSaved] = useState(false)
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("ai-pm-priority")

  useEffect(() => {
    if (!isStreaming && text) {
      setTemplates(parseReplyTemplates(text))
      if (streamMeta) {
        setSaved(true)
        onGenerated()
      }
    }
  }, [isStreaming, text, streamMeta, onGenerated])

  const handlePickFile = useCallback(async () => {
    const selected = await dialogOpen({
      multiple: false,
      filters: [
        { name: "表格文件", extensions: ["xlsx", "xls", "csv"] },
        { name: "文本文件", extensions: ["txt", "md"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    })
    if (selected) setFilePath(selected as string)
  }, [])

  const handleRun = useCallback(() => {
    if (!input.trim() && !filePath) return
    reset()
    setTemplates([])
    setSaved(false)
    let userInput = input.trim() || "请分析上传的文件中的需求并评估优先级"
    if (templatePath) {
      userInput += `\n\n---\n\n请严格按照以下模板的格式和结构输出评估结果。模板文件路径：${templatePath}`
    }
    // Pass count via mode field as "priority:N" — backend extracts it for frontmatter (#2)
    const count = input.trim() ? countRequirements(input) : 0
    run(userInput, filePath ?? undefined, `priority:${count}`)
  }, [input, filePath, templatePath, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
    setFilePath(null)
    setTemplatePath(null)
    setTemplates([])
    setSaved(false)
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0
  const displayText = stripReplyTemplates(text)

  return (
    <>
      {!isStreaming && !text && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            粘贴需求列表，或上传表格文件（Excel/CSV），批量导入需求
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"1. 登录页加载慢（运营提报，影响全量用户）\n2. 数据导出 Excel\n3. 搜索结果排序优化\n..."}
            rows={8}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-secondary)]",
              "outline-none resize-none",
              "focus:border-[var(--accent-color)] transition-[border-color]"
            )}
          />
          {filePath && (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className="text-[var(--text-secondary)]">已选文件：</span>
              <span className="text-[var(--text-primary)] font-medium truncate max-w-[400px]">
                {filePath.split(/[/\\]/).pop()}
              </span>
              <button
                onClick={() => setFilePath(null)}
                className="text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors"
              >
                ×
              </button>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <TemplateUpload label="评估模板" storageKey="priority" value={templatePath} onSelect={setTemplatePath} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handlePickFile}>
              上传表格文件
            </Button>
            <Button variant="primary" onClick={handleRun} disabled={!input.trim() && !filePath}>
              开始评估
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
                <Button variant="ghost" size="sm" onClick={handleReset}>重新评估</Button>
                <Button variant="ghost" size="sm" onClick={() => copyRichText(displayText).then(() => toast("已复制富文本", "success"))}>
                  复制结果
                </Button>
              </div>
            )}
          </div>
          <PrdViewer markdown={displayText} isStreaming={isStreaming} />
          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens?.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
          {/* Reply templates */}
          {!isStreaming && templates.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">回复模板</h3>
              <div className="space-y-3">
                {templates.map((t, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{t.name}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(t.content).then(() => toast("已复制", "success"))}
                        className="text-[12px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
                      >
                        复制
                      </button>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">{t.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ toast }: { toast: (msg: string, variant?: ToastVariant) => void }) {
  const [keyword, setKeyword] = useState("")
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all")
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  const handleKeywordChange = useCallback((value: string) => {
    setKeyword(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setSearchKeyword(value.trim())
    }, 300)
  }, [])

  // loadItems incorporates the backend keyword search
  const loadItems = useCallback(
    () => api.listPriorityReports(searchKeyword || undefined),
    [searchKeyword]
  )

  // Client-side time filter
  const cutoffDate = getTimeFilterDate(timeFilter)
  const filterItems = useCallback(
    (items: PriorityReportMeta[]) =>
      cutoffDate ? items.filter((r) => new Date(r.date) >= cutoffDate) : items,
    [cutoffDate]
  )

  // Empty state message
  const emptyMessage = keyword && timeFilter !== "all"
    ? "未找到匹配的评估记录"
    : keyword
      ? `未找到包含「${keyword}」的评估记录`
      : timeFilter !== "all"
        ? `${TIME_FILTERS.find((f) => f.key === timeFilter)?.label ?? ""}内没有评估记录`
        : "还没有评估记录"

  // Render reply templates in expanded content
  const renderExtra = useCallback((_item: PriorityReportMeta, raw: string) => {
    const templates = parseReplyTemplates(raw)
    if (templates.length === 0) return null
    return (
      <div className="mt-6">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">回复模板</h3>
        <div className="space-y-3">
          {templates.map((t, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{t.name}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(t.content).then(() => toast("已复制", "success"))}
                  className="text-[12px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
                >
                  复制
                </button>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">{t.content}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }, [toast])

  return (
    <HistoryList<PriorityReportMeta>
      loadItems={loadItems}
      getContent={api.getPriorityReport}
      deleteItem={api.deletePriorityReport}
      getFilename={(r) => r.filename}
      renderHeader={(r) => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-primary)]">
            {r.date.replace("T", " ").slice(0, 16)}
          </span>
          {r.count > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-color)]">
              {r.count} 条需求
            </span>
          )}
        </div>
      )}
      renderExtra={renderExtra}
      transformContent={stripReplyTemplates}
      toast={toast}
      emptyMessage={emptyMessage}
      filterItems={filterItems}
      toolbar={
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder="搜索需求关键词"
            aria-label="搜索评估记录"
            className={cn(
              "flex-1 rounded-lg h-9 px-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-tertiary)]",
              "outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)] transition-[border-color,box-shadow]"
            )}
          />
          <div className="flex gap-1 rounded-lg bg-[var(--secondary)] p-0.5" role="group" aria-label="时间范围">
            {TIME_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                aria-pressed={timeFilter === key}
                onClick={() => setTimeFilter(key)}
                className={cn(
                  "px-2 py-1 text-[12px] rounded-md transition-colors",
                  timeFilter === key
                    ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      }
    />
  )
}
