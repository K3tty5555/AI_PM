import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from "react"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBrainstorm } from "@/hooks/use-brainstorm"
import { cn } from "@/lib/utils"

// ─── Quick prompts per phase ───────────────────────────────────────────────

const QUICK_PROMPTS: Record<string, string[]> = {
  analysis: ["产品要解决什么问题？", "目标用户是谁？", "有竞品参考吗？"],
  stories: ["有哪些核心场景？", "用户最关心什么？"],
  prd: ["核心功能有哪些？", "有什么技术约束？", "MVP 范围是什么？"],
}

// ─── SUGGEST_GENERATE detection ────────────────────────────────────────────

const SUGGEST_GENERATE_TAG = "[SUGGEST_GENERATE]"

function splitSuggestGenerate(content: string): { text: string; hasSuggest: boolean } {
  if (content.includes(SUGGEST_GENERATE_TAG)) {
    return {
      text: content.replace(SUGGEST_GENERATE_TAG, "").trim(),
      hasSuggest: true,
    }
  }
  return { text: content, hasSuggest: false }
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface BrainstormChatProps {
  projectId: string
  phase: string
  phaseLabel: string // "需求分析" | "用户故事" | "PRD"
  onGenerate: () => void // 生成按钮回调
}

// ─── Component ─────────────────────────────────────────────────────────────

export function BrainstormChat({ projectId, phase, phaseLabel, onGenerate }: BrainstormChatProps) {
  const {
    messages,
    loading,
    streaming,
    streamingText,
    sendMessage,
    clearMessages,
    roundCount,
    isMaxRounds,
  } = useBrainstorm(projectId, phase)

  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Track whether user is near bottom for auto-scroll
  const isNearBottomRef = useRef(true)

  const quickPrompts = useMemo(() => QUICK_PROMPTS[phase] ?? QUICK_PROMPTS.analysis, [phase])

  // ── Auto-scroll ────────────────────────────────────────────────────────

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const threshold = 100
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [])

  // Scroll when messages change or streaming text updates
  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  // ── Send handler ───────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput("")
    await sendMessage(text)
  }, [input, streaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      sendMessage(prompt)
    },
    [sendMessage]
  )

  const handleClear = useCallback(() => {
    if (window.confirm("确定要清空所有对话记录吗？")) {
      clearMessages()
    }
  }, [clearMessages])

  const handleContinue = useCallback(() => {
    textareaRef.current?.focus()
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // ── Auto-resize textarea ──────────────────────────────────────────────

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">
          加载中...
        </span>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const hasMessages = messages.length > 0 || streamingText

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with clear button */}
      {hasMessages && !streaming && (
        <div className="flex justify-end px-2 py-1">
          <button
            onClick={handleClear}
            className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors"
          >
            清空对话
          </button>
        </div>
      )}

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        onScroll={checkNearBottom}
        className="flex-1 overflow-y-auto px-1 py-4"
        role="log"
        aria-live="polite"
      >
        {!hasMessages ? (
          /* ── Empty state ─────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center gap-4 py-16 animate-[fadeInUp_300ms_var(--ease-decelerate)]">
            <MessageCircle className="size-10 text-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              和 AI 聊聊你对这个阶段的想法
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => handleQuickPrompt(p)}
                  className={cn(
                    "rounded-full border border-[var(--border)] px-3 py-1",
                    "text-xs text-[var(--text-secondary)]",
                    "hover:bg-[var(--hover-bg)] hover:border-[var(--accent-color)]/40",
                    "transition-all duration-200",
                    "active:scale-[0.97]",
                    "cursor-pointer",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message list ────────────────────────────────────────── */
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                onGenerate={onGenerate}
                onContinue={handleContinue}
              />
            ))}

            {/* Streaming text */}
            {streaming && streamingText && (
              <div className="flex gap-3">
                <div className="relative min-w-0 flex-1 pl-4">
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-[var(--accent-color)] animate-[streamPulse_2s_ease-in-out_infinite]" />
                  <p className="font-serif text-[15px] leading-[1.8] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                    {streamingText}
                    <span className="inline-block w-[2px] h-[1em] ml-0.5 bg-[var(--text-primary)] align-middle animate-[blink_500ms_infinite]" />
                  </p>
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            {streaming && !streamingText && (
              <div className="flex gap-3">
                <div className="relative min-w-0 flex-1 pl-4">
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-[var(--accent-color)] animate-[streamPulse_2s_ease-in-out_infinite]" />
                  <p className="text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">
                    思考中...
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Round count hint */}
      {roundCount >= 10 && !isMaxRounds && (
        <div className="text-center py-1">
          <span className="text-[12px] text-[var(--text-tertiary)]">
            还剩 {15 - roundCount} 轮对话
          </span>
        </div>
      )}

      {/* Input area / Max rounds status card */}
      {isMaxRounds ? (
        <div className="border-t border-[var(--border)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            需求信息已经很充分了，可以开始生成了
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="primary" onClick={onGenerate}>
              生成{phaseLabel}
            </Button>
            <Button variant="ghost" onClick={handleClear}>
              清空对话重新开始
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-t border-[var(--border)] px-1 pt-3 pb-1">
            {streaming && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[12px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">
                  AI 回复中...
                </span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入你的想法..."
                rows={1}
                className={cn(
                  "flex-1 min-h-[36px] max-h-[120px] resize-none px-3 py-2",
                  "text-sm text-[var(--text-primary)]",
                  "bg-[var(--secondary)] border border-[var(--border)] rounded-lg",
                  "placeholder:text-[var(--text-tertiary)]",
                  "outline-none",
                  "transition-[border-color] duration-200",
                  "focus:border-[var(--accent-color)]",
                )}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleSend}
                disabled={streaming || !input.trim()}
              >
                发送
              </Button>
            </div>
          </div>

          {/* Bottom generate button */}
          <div className="border-t border-[var(--border)] px-1 py-3">
            <Button
              variant="primary"
              onClick={onGenerate}
              disabled={streaming}
              className="w-full"
            >
              生成{phaseLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────

function MessageBubble({
  role,
  content,
  onGenerate,
  onContinue,
}: {
  role: "user" | "assistant"
  content: string
  onGenerate: () => void
  onContinue: () => void
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end" aria-label="你的消息">
        <div className="max-w-[85%] rounded-lg bg-[var(--secondary)] px-3 py-2">
          <p className="font-sans text-[14px] text-[var(--text-primary)] whitespace-pre-wrap break-words">
            {content}
          </p>
        </div>
      </div>
    )
  }

  // Assistant message
  const { text, hasSuggest } = splitSuggestGenerate(content)

  return (
    <div className="flex gap-3" aria-label="AI 回复">
      <div className="relative min-w-0 flex-1 pl-4">
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-[var(--accent-color)]" />
        <p className="font-serif text-[15px] leading-[1.8] text-[var(--text-primary)] whitespace-pre-wrap break-words">
          {text}
        </p>
        {hasSuggest && (
          <div className="mt-3 flex gap-2 rounded-lg border border-[var(--accent-color)]/20 bg-[var(--accent-light)] p-3">
            <Button variant="primary" size="sm" onClick={onGenerate}>
              开始生成
            </Button>
            <Button variant="ghost" size="sm" onClick={onContinue}>
              继续讨论
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
