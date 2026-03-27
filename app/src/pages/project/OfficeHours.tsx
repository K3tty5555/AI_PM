import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowRight, AlertTriangle, Pencil, CheckCircle2 } from "lucide-react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import type { StreamChunkPayload, StreamDonePayload, StreamErrorPayload } from "@/lib/stream-types"

// ─── Questions ──────────────────────────────────────────────────────────────

const QUESTIONS = [
  "这个产品（功能）要解决谁的什么问题？",
  "目标用户目前是如何解决这个问题的？",
  "为什么现有方案不够好？你的差异化优势在哪？",
  "你认为最核心的一个功能点是什么？",
  "这个需求的成功标准是什么？如何衡量？",
]

// ─── Types ──────────────────────────────────────────────────────────────────

interface QARound {
  question: string
  answer: string
  challenge?: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OfficeHoursPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string
  const { toast } = useToast()

  // ── State ──────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0)
  const [rounds, setRounds] = useState<QARound[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [completed, setCompleted] = useState(false)
  const [summaryText, setSummaryText] = useState("")
  const [isSummaryStreaming, setIsSummaryStreaming] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [loading, setLoading] = useState(true)

  const streamingTextRef = useRef("")
  const unlistenersRef = useRef<UnlistenFn[]>([])
  const mountedRef = useRef(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const totalSteps = QUESTIONS.length
  const expectedStreamKey = `brainstorm:${projectId}:office-hours`

  // ── Load existing state on mount ────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function load() {
      try {
        const saved = await api.readProjectFile(projectId, "00-office-hours.json")
        if (saved && !cancelled) {
          const parsed = JSON.parse(saved)
          if (parsed.rounds) setRounds(parsed.rounds)
          if (parsed.completed) setCompleted(true)
          if (parsed.summary) setSummaryText(parsed.summary)
          if (typeof parsed.currentStep === "number") {
            setCurrentStep(parsed.currentStep)
          } else if (parsed.rounds) {
            setCurrentStep(Math.min(parsed.rounds.length, totalSteps))
          }
        }
      } catch {
        // File doesn't exist yet — fresh start
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      mountedRef.current = false
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []
    }
  }, [projectId, totalSteps])

  // ── Auto-scroll to bottom ────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [rounds, currentStep, streamingText, completed])

  // ── Auto-focus input ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStreaming && !completed && editingIndex === null) {
      inputRef.current?.focus()
    }
  }, [currentStep, isStreaming, completed, editingIndex])

  // ── Persist state ─────────────────────────────────────────────────────────

  const persistState = useCallback(
    async (data: {
      rounds: QARound[]
      currentStep: number
      completed: boolean
      summary?: string
    }) => {
      try {
        await api.saveProjectFile({
          projectId,
          fileName: "00-office-hours.json",
          content: JSON.stringify(data, null, 2),
        })
      } catch {
        // silent
      }
    },
    [projectId]
  )

  // ── Stream setup for AI challenge ─────────────────────────────────────────

  const setupListeners = useCallback(async (): Promise<UnlistenFn[]> => {
    unlistenersRef.current.forEach((fn) => fn())
    unlistenersRef.current = []

    const fns = await Promise.all([
      listen<StreamChunkPayload>("stream_chunk", (event) => {
        const { streamKey, text } = event.payload
        if (streamKey !== expectedStreamKey) return
        streamingTextRef.current += text
        if (mountedRef.current) {
          setStreamingText(streamingTextRef.current)
        }
      }),
      listen<StreamDonePayload>("stream_done", (event) => {
        const { streamKey } = event.payload
        if (streamKey !== expectedStreamKey) return
        if (!mountedRef.current) return

        const finalText = streamingTextRef.current.trim()
        streamingTextRef.current = ""
        setStreamingText("")
        setIsStreaming(false)
        setIsSummaryStreaming(false)

        // Clean up listeners
        unlistenersRef.current.forEach((fn) => fn())
        unlistenersRef.current = []

        // Save as assistant message
        api.saveBrainstormMessage({
          projectId,
          phase: "office-hours",
          role: "assistant",
          content: finalText,
        }).catch(() => {})

        return finalText
      }),
      listen<StreamErrorPayload>("stream_error", (event) => {
        const { streamKey, message } = event.payload
        if (streamKey !== expectedStreamKey) return
        if (mountedRef.current) {
          toast(message || "AI 回复出错", "error")
          streamingTextRef.current = ""
          setStreamingText("")
          setIsStreaming(false)
          setIsSummaryStreaming(false)
        }
        unlistenersRef.current.forEach((fn) => fn())
        unlistenersRef.current = []
      }),
    ])

    unlistenersRef.current = fns
    return fns
  }, [expectedStreamKey, projectId, toast])

  // ── Ask AI to challenge user's answer ─────────────────────────────────────

  const requestChallenge = useCallback(
    async (questionIndex: number, answer: string, allRounds: QARound[]) => {
      setIsStreaming(true)
      streamingTextRef.current = ""
      setStreamingText("")

      // Build chat history for the AI
      const chatHistory: { role: "user" | "assistant"; content: string }[] = []
      for (const r of allRounds) {
        chatHistory.push({ role: "assistant", content: `问题：${r.question}` })
        chatHistory.push({ role: "user", content: r.answer })
        if (r.challenge) {
          chatHistory.push({ role: "assistant", content: r.challenge })
        }
      }
      // Add the current question and answer
      chatHistory.push({
        role: "assistant",
        content: `问题：${QUESTIONS[questionIndex]}`,
      })
      chatHistory.push({ role: "user", content: answer })

      // Save user message
      await api.saveBrainstormMessage({
        projectId,
        phase: "office-hours",
        role: "user",
        content: answer,
      }).catch(() => {})

      // Set up stream listeners — we need to handle the done event to update rounds
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []

      const fns = await Promise.all([
        listen<StreamChunkPayload>("stream_chunk", (event) => {
          const { streamKey, text } = event.payload
          if (streamKey !== expectedStreamKey) return
          streamingTextRef.current += text
          if (mountedRef.current) {
            setStreamingText(streamingTextRef.current)
          }
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { streamKey } = event.payload
          if (streamKey !== expectedStreamKey) return
          if (!mountedRef.current) return

          const finalText = streamingTextRef.current.trim()
          streamingTextRef.current = ""
          setStreamingText("")
          setIsStreaming(false)

          // Update the current round with the challenge
          setRounds((prev) => {
            const updated = [...prev]
            if (updated[questionIndex]) {
              updated[questionIndex] = { ...updated[questionIndex], challenge: finalText }
            }
            // Persist
            persistState({
              rounds: updated,
              currentStep: questionIndex + 1,
              completed: false,
            })
            return updated
          })

          // Save as assistant message
          api.saveBrainstormMessage({
            projectId,
            phase: "office-hours",
            role: "assistant",
            content: finalText,
          }).catch(() => {})

          // Clean up
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
        }),
        listen<StreamErrorPayload>("stream_error", (event) => {
          const { streamKey, message } = event.payload
          if (streamKey !== expectedStreamKey) return
          if (mountedRef.current) {
            toast(message || "AI 回复出错", "error")
            streamingTextRef.current = ""
            setStreamingText("")
            setIsStreaming(false)
          }
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
        }),
      ])
      unlistenersRef.current = fns

      // Fire brainstorm request
      const systemPrompt = `你是一位资深的产品评审专家，正在对用户进行需求速评。你的角色是通过提问和挑战来帮助用户验证需求的价值和可行性。

当前问题是第 ${questionIndex + 1} 题（共 ${totalSteps} 题）：「${QUESTIONS[questionIndex]}」
用户的回答是：「${answer}」

请对用户的回答进行简短的挑战或追问（2-3 句话），帮助用户思考得更深入。语气友好但有建设性。不要重复问题本身。如果回答已经很完善，给出简短肯定即可。`

      try {
        await api.brainstormChat({
          projectId,
          phase: "office-hours",
          messages: [
            { role: "user", content: systemPrompt },
          ],
        })
      } catch (err) {
        toast("AI 回复失败", "error")
        setIsStreaming(false)
      }
    },
    [projectId, expectedStreamKey, toast, persistState, totalSteps]
  )

  // ── Request summary ────────────────────────────────────────────────────────

  const requestSummary = useCallback(
    async (allRounds: QARound[]) => {
      setIsSummaryStreaming(true)
      setIsStreaming(true)
      streamingTextRef.current = ""
      setStreamingText("")

      await setupListeners()

      // Override the done handler for summary
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []

      const fns = await Promise.all([
        listen<StreamChunkPayload>("stream_chunk", (event) => {
          const { streamKey, text } = event.payload
          if (streamKey !== expectedStreamKey) return
          streamingTextRef.current += text
          if (mountedRef.current) {
            setStreamingText(streamingTextRef.current)
          }
        }),
        listen<StreamDonePayload>("stream_done", (event) => {
          const { streamKey } = event.payload
          if (streamKey !== expectedStreamKey) return
          if (!mountedRef.current) return

          const finalText = streamingTextRef.current.trim()
          streamingTextRef.current = ""
          setStreamingText("")
          setIsStreaming(false)
          setIsSummaryStreaming(false)
          setSummaryText(finalText)
          setCompleted(true)

          persistState({
            rounds: allRounds,
            currentStep: totalSteps,
            completed: true,
            summary: finalText,
          })

          api.saveBrainstormMessage({
            projectId,
            phase: "office-hours",
            role: "assistant",
            content: finalText,
          }).catch(() => {})

          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
        }),
        listen<StreamErrorPayload>("stream_error", (event) => {
          const { streamKey, message } = event.payload
          if (streamKey !== expectedStreamKey) return
          if (mountedRef.current) {
            toast(message || "AI 生成摘要出错", "error")
            streamingTextRef.current = ""
            setStreamingText("")
            setIsStreaming(false)
            setIsSummaryStreaming(false)
          }
          unlistenersRef.current.forEach((fn) => fn())
          unlistenersRef.current = []
        }),
      ])
      unlistenersRef.current = fns

      const qaContent = allRounds
        .map(
          (r, i) =>
            `Q${i + 1}: ${r.question}\nA: ${r.answer}${r.challenge ? `\nAI 挑战: ${r.challenge}` : ""}`
        )
        .join("\n\n")

      try {
        await api.brainstormChat({
          projectId,
          phase: "office-hours",
          messages: [
            {
              role: "user",
              content: `以下是需求速评的问答记录：\n\n${qaContent}\n\n请生成一份简洁的速评摘要（Markdown 格式），包含：\n1. 需求概述（一句话）\n2. 价值判断（高/中/低，附理由）\n3. 关键风险（列出 2-3 个）\n4. 建议（是否值得立项，或需要补充什么信息）`,
            },
          ],
        })
      } catch (err) {
        toast("生成摘要失败", "error")
        setIsStreaming(false)
        setIsSummaryStreaming(false)
      }
    },
    [projectId, expectedStreamKey, setupListeners, persistState, toast, totalSteps]
  )

  // ── Handle answer submission ───────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return

    const answer = inputValue.trim()
    setInputValue("")

    const newRound: QARound = {
      question: QUESTIONS[currentStep],
      answer,
    }

    const updatedRounds = [...rounds, newRound]
    setRounds(updatedRounds)

    // Request AI challenge
    requestChallenge(currentStep, answer, rounds)
  }, [inputValue, isStreaming, currentStep, rounds, requestChallenge])

  // ── Handle "continue to next" ─────────────────────────────────────────────

  const handleContinue = useCallback(() => {
    const nextStep = currentStep + 1
    setCurrentStep(nextStep)

    if (nextStep >= totalSteps) {
      // All questions answered — generate summary
      requestSummary(rounds)
    } else {
      persistState({
        rounds,
        currentStep: nextStep,
        completed: false,
      })
    }
  }, [currentStep, totalSteps, rounds, requestSummary, persistState])

  // ── Handle edit answer ────────────────────────────────────────────────────

  const handleEditStart = useCallback(
    (index: number) => {
      setEditingIndex(index)
      setEditValue(rounds[index].answer)
    },
    [rounds]
  )

  const handleEditSave = useCallback(() => {
    if (editingIndex === null || !editValue.trim()) return

    const updated = [...rounds]
    updated[editingIndex] = {
      ...updated[editingIndex],
      answer: editValue.trim(),
      challenge: undefined,
    }
    setRounds(updated)
    setEditingIndex(null)
    setEditValue("")

    // Re-challenge with the updated answer
    requestChallenge(editingIndex, editValue.trim(), updated.slice(0, editingIndex))
  }, [editingIndex, editValue, rounds, requestChallenge])

  // ── Handle skip / leave ───────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    navigate(`/project/${projectId}/requirement`)
  }, [navigate, projectId])

  const handleAdvance = useCallback(() => {
    navigate(`/project/${projectId}/requirement`)
  }, [navigate, projectId])

  // ── Handle reset ──────────────────────────────────────────────────────────

  const handleReset = useCallback(async () => {
    setRounds([])
    setCurrentStep(0)
    setCompleted(false)
    setSummaryText("")
    setStreamingText("")
    setIsStreaming(false)
    setIsSummaryStreaming(false)

    try {
      await api.clearBrainstorm(projectId, "office-hours")
      await api.saveProjectFile({
        projectId,
        fileName: "00-office-hours.json",
        content: JSON.stringify({ rounds: [], currentStep: 0, completed: false }, null, 2),
      })
    } catch {
      // silent
    }
  }, [projectId])

  // ── Handle textarea key ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleEditSave()
      }
      if (e.key === "Escape") {
        setEditingIndex(null)
        setEditValue("")
      }
    },
    [handleEditSave]
  )

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentRoundHasChallenge = useMemo(() => {
    if (rounds.length === 0) return false
    const lastRound = rounds[rounds.length - 1]
    return !!lastRound?.challenge
  }, [rounds])

  const showContinueButton =
    !isStreaming &&
    rounds.length > 0 &&
    currentRoundHasChallenge &&
    !completed &&
    currentStep < totalSteps &&
    rounds.length > currentStep

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中...</span>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="layout-focus page-enter">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">
            需求速评
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            AI 辅助验证需求价值
            {!completed && (
              <span className="ml-2 inline-flex items-center rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[12px] font-medium text-[var(--accent-color)]">
                {Math.min(currentStep + 1, totalSteps)}/{totalSteps}
              </span>
            )}
            {completed && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--success-light)] px-2 py-0.5 text-[12px] font-medium text-[var(--success)]">
                <CheckCircle2 className="size-3" strokeWidth={2} />
                已完成
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          稍后再说 <ArrowRight className="ml-1 size-3.5" strokeWidth={1.75} />
        </Button>
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Progress bar */}
      <div className="mt-4 mb-6">
        <div className="h-0.5 w-full rounded-full bg-[var(--border)]">
          <div
            className="h-0.5 rounded-full bg-[var(--accent-color)] transition-all duration-300"
            style={{
              width: `${completed ? 100 : (currentStep / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Q&A conversation area */}
      <div className="space-y-5">
        {/* Past rounds */}
        {rounds.map((round, index) => (
          <div
            key={index}
            className="animate-[fadeInUp_250ms_var(--ease-decelerate)]"
          >
            {/* Question */}
            <div className="flex items-start gap-2 mb-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[11px] font-medium text-[var(--accent-color)]">
                {index + 1}
              </span>
              <p className="text-[14px] font-medium text-[var(--text-primary)] leading-relaxed">
                {round.question}
              </p>
            </div>

            {/* User answer */}
            {editingIndex === index ? (
              <div className="ml-7 mb-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className={cn(
                    "w-full rounded-lg border border-[var(--accent-color)] bg-[var(--card)] px-3 py-2",
                    "text-[14px] text-[var(--text-primary)] leading-relaxed",
                    "outline-none resize-none",
                    "min-h-[60px]"
                  )}
                  autoFocus
                />
                <div className="mt-1.5 flex gap-2">
                  <Button variant="primary" size="sm" onClick={handleEditSave}>
                    保存
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingIndex(null)
                      setEditValue("")
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="ml-7 mb-2 group relative rounded-lg bg-[var(--secondary)] px-3 py-2">
                <p className="text-[14px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                  {round.answer}
                </p>
                {!isStreaming && !completed && (
                  <button
                    onClick={() => handleEditStart(index)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded-md hover:bg-[var(--hover-bg)]"
                    title="修改回答"
                  >
                    <Pencil
                      className="size-3.5 text-[var(--text-tertiary)]"
                      strokeWidth={1.75}
                    />
                  </button>
                )}
              </div>
            )}

            {/* AI Challenge */}
            {round.challenge && (
              <div className="ml-7 mb-2 border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-r-lg px-3 py-2 animate-[fadeInUp_250ms_var(--ease-decelerate)]">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0 text-amber-500"
                    strokeWidth={1.75}
                  />
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {round.challenge}
                  </p>
                </div>
              </div>
            )}

            {/* Streaming challenge for current question */}
            {isStreaming &&
              !isSummaryStreaming &&
              index === rounds.length - 1 &&
              !round.challenge &&
              streamingText && (
                <div className="ml-7 mb-2 border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-r-lg px-3 py-2">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0 text-amber-500"
                      strokeWidth={1.75}
                    />
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {streamingText}
                      <span className="inline-block w-px h-[14px] ml-0.5 bg-[var(--text-secondary)] animate-[blink_1s_infinite]" />
                    </p>
                  </div>
                </div>
              )}
          </div>
        ))}

        {/* Streaming indicator when waiting for challenge */}
        {isStreaming && !isSummaryStreaming && !streamingText && rounds.length > 0 && (
          <div className="ml-7 flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
            <span className="inline-block size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_2s_ease-in-out_infinite]" />
            AI 正在思考...
          </div>
        )}

        {/* Continue / Edit buttons after challenge */}
        {showContinueButton && (
          <div className="ml-7 flex items-center gap-2 animate-[fadeInUp_250ms_var(--ease-decelerate)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEditStart(rounds.length - 1)}
            >
              <Pencil className="mr-1 size-3.5" strokeWidth={1.75} />
              修改回答
            </Button>
            <Button variant="primary" size="sm" onClick={handleContinue}>
              {currentStep + 1 >= totalSteps ? "生成评估 →" : "继续下一题 →"}
            </Button>
          </div>
        )}

        {/* Current question (not yet answered) */}
        {!completed && currentStep < totalSteps && !isStreaming && rounds.length <= currentStep && (
          <div className="animate-[fadeInUp_250ms_var(--ease-decelerate)]">
            <div className="flex items-start gap-2 mb-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[11px] font-medium text-[var(--accent-color)]">
                {currentStep + 1}
              </span>
              <p className="text-[14px] font-medium text-[var(--text-primary)] leading-relaxed">
                {QUESTIONS[currentStep]}
              </p>
            </div>

            {/* Input area */}
            <div className="ml-7">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的回答... (Enter 发送, Shift+Enter 换行)"
                rows={3}
                className={cn(
                  "w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2",
                  "text-[14px] text-[var(--text-primary)] leading-relaxed",
                  "placeholder:text-[var(--text-tertiary)]",
                  "outline-none resize-none",
                  "transition-[border-color] duration-200",
                  "focus:border-[var(--accent-color)]"
                )}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {currentStep + 1}/{totalSteps}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim()}
                >
                  提交回答
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Summary generation streaming */}
        {isSummaryStreaming && streamingText && (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 animate-[fadeInUp_250ms_var(--ease-decelerate)]">
            <h2 className="mb-3 text-[15px] font-medium text-[var(--text-primary)]">
              速评摘要
            </h2>
            <div className="text-[14px] text-[var(--text-secondary)] leading-[1.7] whitespace-pre-wrap font-serif">
              {streamingText}
              <span className="inline-block w-px h-[14px] ml-0.5 bg-[var(--text-secondary)] animate-[blink_1s_infinite]" />
            </div>
          </div>
        )}

        {/* Summary streaming indicator */}
        {isSummaryStreaming && !streamingText && (
          <div className="mt-6 flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
            <span className="inline-block size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_2s_ease-in-out_infinite]" />
            正在生成速评摘要...
          </div>
        )}

        {/* Completed summary */}
        {completed && summaryText && (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 animate-[fadeInUp_250ms_var(--ease-decelerate)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-medium text-[var(--text-primary)]">
                速评摘要
              </h2>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                重新评估
              </Button>
            </div>
            <div className="text-[14px] text-[var(--text-secondary)] leading-[1.7] whitespace-pre-wrap font-serif">
              {summaryText}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom action bar */}
      {completed && (
        <div className="mt-8 flex items-center justify-end border-t border-[var(--border)] pt-6">
          <Button variant="primary" onClick={handleAdvance}>
            进入需求收集 <ArrowRight className="ml-1 size-4" strokeWidth={1.75} />
          </Button>
        </div>
      )}
    </div>
  )
}
