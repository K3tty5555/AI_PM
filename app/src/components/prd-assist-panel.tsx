import { useState, useCallback, useRef, useEffect } from "react"
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PrdDiffViewer } from "@/components/PrdDiffViewer"
import { useAiStream } from "@/hooks/use-ai-stream"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface PrdAssistPanelProps {
  projectId: string
  currentMarkdown: string
  onApply: (newMarkdown: string) => void
  initialInput?: string
  initialInputVersion?: number
}

interface ChatRound {
  userMessage: string
  summary: string
  newText: string
}

function parseSummaryAndText(raw: string): { summary: string; fullText: string } | null {
  const sumIdx = raw.indexOf("---SUMMARY---")
  const textIdx = raw.indexOf("---FULL_TEXT---")
  if (sumIdx !== -1 && textIdx !== -1 && textIdx > sumIdx) {
    return {
      summary: raw.slice(sumIdx + 13, textIdx).trim(),
      fullText: raw.slice(textIdx + 14).trim(),
    }
  }
  return null
}

export function PrdAssistPanel({ projectId, currentMarkdown, onApply, initialInput, initialInputVersion }: PrdAssistPanelProps) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState(initialInput ?? "")
  const [history, setHistory] = useState<ChatRound[]>([])
  const [pendingDiff, setPendingDiff] = useState<{ summary: string; oldText: string; newText: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isFirstRoundRef = useRef(true)

  const { text: assistText, isStreaming, start, reset } = useAiStream({
    projectId,
    phase: "prd-assist",
  })

  // When initial input is provided (e.g., from review adoption), auto-expand
  useEffect(() => {
    if (initialInput) {
      setInput(initialInput)
      setExpanded(true)
    }
  }, [initialInput, initialInputVersion])

  // When assist finishes, parse response
  useEffect(() => {
    if (isStreaming || !assistText) return
    const parsed = parseSummaryAndText(assistText)
    if (parsed) {
      setPendingDiff({ summary: parsed.summary, oldText: currentMarkdown, newText: parsed.fullText })
    } else {
      // Degraded mode: treat entire output as new text
      toast("差异解析异常，已切换为整体替换模式", "warning")
      setPendingDiff({ summary: "AI 修改", oldText: currentMarkdown, newText: assistText })
    }
  }, [isStreaming, assistText, currentMarkdown, toast])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    reset()
    const isFirst = isFirstRoundRef.current
    isFirstRoundRef.current = false

    // Build prompt: first round includes full PRD, subsequent rounds include summary
    const context = isFirst
      ? `这是当前的 PRD：\n\n${currentMarkdown}\n\n`
      : history.length > 0
        ? `上一轮修改摘要：${history[history.length - 1].summary.slice(0, 500)}\n\n`
        : ""

    start([{
      role: "user",
      content: `${context}请根据以下要求修改 PRD：${trimmed}\n\n请用以下格式输出：\n---SUMMARY---\n修改摘要\n---FULL_TEXT---\n修改后的完整 PRD 全文`,
    }])
    setInput("")
  }, [input, currentMarkdown, history, start, reset])

  const handleAcceptAll = useCallback(() => {
    if (!pendingDiff) return
    setHistory((prev) => [...prev, { userMessage: input, summary: pendingDiff.summary, newText: pendingDiff.newText }])
    onApply(pendingDiff.newText)
    setPendingDiff(null)
    toast("修改已应用", "success")
  }, [pendingDiff, input, onApply, toast])

  const handleRejectAll = useCallback(() => {
    setPendingDiff(null)
    toast("已放弃修改", "info")
  }, [toast])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className={cn(
        "mt-6 border-t border-[var(--border)]",
        "transition-all duration-200 ease-[var(--ease-decelerate)]",
      )}
    >
      {/* Collapsed: input bar */}
      <div className="flex items-center gap-2 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors shrink-0"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setExpanded(true)}
          placeholder="输入修改指令，如「把权限配置写详细些」"
          className={cn(
            "flex-1 h-9 px-3 text-sm text-[var(--text-primary)]",
            "bg-transparent border border-[var(--border)] rounded-lg",
            "placeholder:text-[var(--text-tertiary)]",
            "outline-none focus:border-[var(--accent-color)] transition-colors",
          )}
          disabled={isStreaming}
        />
        <Button variant="primary" size="sm" onClick={handleSend} disabled={!input.trim() || isStreaming}>
          {isStreaming ? "生成中..." : "发送"}
        </Button>
      </div>

      {/* Expanded: history + pending diff */}
      {expanded && (
        <div className="pb-4 max-h-[40vh] overflow-y-auto">
          {/* History */}
          {history.length > 0 && (
            <div className="space-y-2 mb-3">
              {history.slice(-5).map((round, i) => (
                <div key={i} className="rounded-lg bg-[var(--secondary)] px-3 py-2">
                  <p className="text-xs text-[var(--accent-color)] font-medium">{round.userMessage}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{round.summary}</p>
                </div>
              ))}
            </div>
          )}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">
                AI 正在修改...
              </span>
            </div>
          )}

          {/* Pending diff */}
          {pendingDiff && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)] px-1">修改摘要：{pendingDiff.summary}</p>
              <PrdDiffViewer
                oldText={pendingDiff.oldText}
                newText={pendingDiff.newText}
                oldLabel="当前版本"
                newLabel="修改后"
              />
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={handleAcceptAll}>全部接受</Button>
                <Button variant="ghost" size="sm" onClick={handleRejectAll}>全部拒绝</Button>
              </div>
            </div>
          )}

          {/* Clear history */}
          {history.length > 0 && !pendingDiff && !isStreaming && (
            <button
              onClick={() => { setHistory([]); isFirstRoundRef.current = true }}
              className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-2"
            >
              <Trash2 className="size-3" />
              清除对话历史
            </button>
          )}
        </div>
      )}
    </div>
  )
}
