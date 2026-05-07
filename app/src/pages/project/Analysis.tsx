import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { AnalysisCards } from "@/components/analysis-cards"
import { InlineChat } from "@/components/inline-chat"
import { useAiStream } from "@/hooks/use-ai-stream"
import { useProgressiveReveal } from "@/hooks/use-progressive-reveal"
import { RevealContainer } from "@/components/RevealContainer"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { PhaseShell } from "@/components/phase-shell"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"
import { AgentErrorsBanner } from "@/components/agent-errors-banner"
import { api } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { StreamProgress } from "@/components/StreamProgress"
import { cn } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META, PHASE_LABELS } from "@/lib/phase-meta"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: string
  content: string
}

interface ChatRound {
  question: string
  answer: string
}

// ---------------------------------------------------------------------------
// Question detection
// ---------------------------------------------------------------------------

/**
 * Detect whether the AI output contains a question that needs user input.
 * Checks for:
 * 1. [QUESTION] markers
 * 2. Lines ending with `？` in the last portion of the text
 */
function detectQuestion(text: string): {
  hasQuestion: boolean
  question: string
  options: string[]
} {
  // Check for explicit [QUESTION] block
  const questionMatch = text.match(
    /\[QUESTION\]\s*([\s\S]*?)(?:\[\/QUESTION\]|\[OPTIONS\]|$)/
  )
  if (questionMatch) {
    const question = questionMatch[1].trim()

    // Check for [OPTIONS] block
    const optionsMatch = text.match(
      /\[OPTIONS\]\s*([\s\S]*?)(?:\[\/OPTIONS\]|$)/
    )
    const options: string[] = []
    if (optionsMatch) {
      const optionLines = optionsMatch[1]
        .split("\n")
        .map((l) => l.replace(/^[-*\d.)\]]+\s*/, "").trim())
        .filter(Boolean)
      options.push(...optionLines)
    }

    return { hasQuestion: true, question, options }
  }

  // Check for trailing question (last paragraph ending with ？)
  const paragraphs = text.split(/\n\n+/)
  const lastParagraphs = paragraphs.slice(-3) // Check last few paragraphs
  for (let i = lastParagraphs.length - 1; i >= 0; i--) {
    const p = lastParagraphs[i].trim()
    if (p.endsWith("？") || p.endsWith("?")) {
      // Extract just the last sentence as the question
      const sentences = p.split(/(?<=[。？?！!；;])\s*/)
      const lastQuestion = sentences
        .filter((s) => s.endsWith("？") || s.endsWith("?"))
        .pop()

      return {
        hasQuestion: true,
        question: lastQuestion || p,
        options: [],
      }
    }
  }

  return { hasQuestion: false, question: "", options: [] }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANALYSIS_FILE = "02-analysis-report.md"

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function AnalysisPage() {
  const params = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const projectId = params?.id as string

  // Page state
  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<ChatRound[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])

  // Skip suggestions
  const [skipSuggestions, setSkipSuggestions] = useState<{ phase: string; reason: string }[]>([])
  const [skipCardState, setSkipCardState] = useState<"visible" | "accepted" | "dismissed">("dismissed")
  const skipCheckedRef = useRef(false)

  // Prevent double-start of AI stream in React StrictMode
  const startedRef = useRef(false)

  // T5: agent_errors banner refresh trigger (increment after stream finishes)
  const [agentErrorsKey, setAgentErrorsKey] = useState(0)

  // AI stream hook
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, toolStatus, start, reset } = useAiStream({
    projectId,
    phase: "analysis",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"
  const isYolo = searchParams.get("yolo") === "1"
  const isTeam = searchParams.get("team") === "1"

  // The content to render — either from existing file or from AI stream
  const displayContent = existingContent ?? text

  const { visibleText, isRevealing, revealedCount, totalCount, skipReveal } = useProgressiveReveal({
    text: displayContent || "",
    isStreaming,
  })

  // Question detection on completed stream
  const questionInfo =
    !isStreaming && text ? detectQuestion(text) : { hasQuestion: false, question: "", options: [] }

  // -------------------------------------------------------------------------
  // Load existing analysis report on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      try {
        const content = await api.readProjectFile(projectId, ANALYSIS_FILE)
        if (!cancelled) {
          if (content) {
            setExistingContent(content)

            // Load persisted chat history (if it exists)
            try {
              const saved = await api.readProjectFile(projectId, "02-analysis-messages.json")
              if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.chatHistory) setChatHistory(parsed.chatHistory)
                if (parsed.messages) setMessages(parsed.messages)
              }
            } catch {
              // file doesn't exist yet, that's fine
            }
          } else if (autostart) {
            // No existing file — trigger AI analysis only when autostart=1
            if (!startedRef.current) {
              startedRef.current = true
              const initialMessages: Message[] = [
                { role: "user", content: "请开始分析" },
              ]
              setMessages(initialMessages)
              start(initialMessages)
            }
          }
        }
      } catch (err) {
        console.error("Failed to load analysis file:", err)
        // On error, try to start analysis only when autostart=1
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          const initialMessages: Message[] = [
            { role: "user", content: "请开始分析" },
          ]
          setMessages(initialMessages)
          start(initialMessages)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadExisting()
    return () => {
      cancelled = true
    }
  }, [projectId, start])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /** Handle user answer to AI follow-up question */
  const handleAnswer = useCallback(
    (answer: string) => {
      const newChatHistory: ChatRound[] = [
        ...chatHistory,
        { question: questionInfo.question, answer },
      ]
      const newMessages: Message[] = [
        ...messages,
        { role: "assistant", content: text || existingContent || "" },
        { role: "user", content: answer },
      ]

      setChatHistory(newChatHistory)
      setMessages(newMessages)

      // Persist chat history so it survives navigation
      api.saveProjectFile({
        projectId,
        fileName: "02-analysis-messages.json",
        content: JSON.stringify(
          { chatHistory: newChatHistory, messages: newMessages },
          null,
          2
        ),
      })

      // Clear existing content so we show fresh AI output
      setExistingContent(null)
      startedRef.current = true
      start(newMessages)
    },
    [chatHistory, messages, text, existingContent, questionInfo.question, projectId, start]
  )

  /** Generate analysis for the first time (called from empty state) */
  const handleGenerate = useCallback(() => {
    const initialMessages: Message[] = [{ role: "user", content: "请开始分析" }]
    setMessages(initialMessages)
    startedRef.current = true
    start(initialMessages, { excludedContext })
  }, [start, excludedContext])

  /** Restart analysis from scratch */
  const handleRestart = useCallback(() => {
    reset()
    setExistingContent(null)
    setChatHistory([])
    const initialMessages: Message[] = [
      { role: "user", content: "请开始分析" },
    ]
    setMessages(initialMessages)
    startedRef.current = true
    start(initialMessages, { excludedContext })
  }, [reset, start, excludedContext])

  /** T5: Retry a specific wave by clearing its errors and restarting analysis. */
  const handleRetryWave = useCallback(async (wavePrefix: string) => {
    if (!projectId) return
    try {
      // Clear errors for this wave prefix only
      const allErrors = await api.getAgentErrors(projectId)
      const keys = allErrors.filter((e) => e.key.startsWith(`${wavePrefix}_`)).map((e) => e.key)
      if (keys.length > 0) {
        await api.clearAgentErrors(projectId, keys)
      }
      handleRestart()
      setAgentErrorsKey((k) => k + 1)
    } catch (err) {
      console.error("[Analysis] retry wave:", err)
    }
  }, [projectId, handleRestart])

  // Refresh agent errors after each stream finishes
  useEffect(() => {
    if (!isStreaming) {
      setAgentErrorsKey((k) => k + 1)
    }
  }, [isStreaming])

  // After analysis stream completes, check for skip suggestions
  useEffect(() => {
    if (isStreaming || !text || skipCheckedRef.current) return
    skipCheckedRef.current = true
    api.suggestSkipPhases(projectId).then((suggestions) => {
      if (suggestions.length > 0) {
        setSkipSuggestions(suggestions)
        setSkipCardState("visible")
      }
    }).catch((err) => console.error("[Analysis] suggestSkipPhases:", err))
  }, [isStreaming, text, projectId])

  const handleAcceptSkip = useCallback(async () => {
    const phases = skipSuggestions.map((s) => s.phase)
    try {
      await api.skipPhases(projectId, phases)
      setSkipCardState("accepted")
      window.dispatchEvent(new CustomEvent("project-phase-updated", { detail: { projectId } }))
      toast(`已跳过 ${phases.length} 个阶段`, "success")
    } catch (err) {
      console.error("[Analysis] skipPhases:", err)
      toast("跳过阶段失败", "error")
    }
  }, [skipSuggestions, projectId, toast])

  /** Go back to requirement page */
  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/requirement`)
  }, [navigate, projectId])

  /** Save analysis & advance to stories */
  const handleAdvance = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    setSaving(true)

    try {
      // If the AI just finished streaming (not from existing file), save the output
      if (!existingContent && text) {
        await api.saveProjectFile({
          projectId,
          fileName: ANALYSIS_FILE,
          content: text,
        })
      }
      setSaving(false)

      // Advance to next phase (advancePhase marks current phase as completed)
      await api.advancePhase(projectId)
      invalidateProject(projectId)

      navigate(`/project/${projectId}/research?autostart=1${isYolo ? "&yolo=1" : ""}${isTeam ? "&team=1" : ""}`)
    } catch (err) {
      console.error("Failed to advance:", err)
      toast("保存或推进阶段失败", "error")
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text, navigate, isYolo, isTeam, toast])

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中...</span>
      </div>
    )
  }

  // Empty state — no file, no autostart, not currently streaming
  if (!loading && !existingContent && !text && !isStreaming && !error) {
    return (
      <PhaseShell
        projectId={projectId}
        phase="analysis"
        phaseLabel="需求分析"
        brainstormEnabled={true}
        onBrainstormGenerate={handleGenerate}
      >
        <div className="layout-focus page-enter">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">需求分析</h1>
          </div>
          <div className="h-px bg-[var(--border)]" />
          <ContextPills
            projectId={projectId!}
            onExcludeChange={setExcludedContext}
            className="border-b border-[var(--border)]"
          />
          <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
          <PhaseEmptyState
            phaseLabel="ANALYSIS"
            description="需求分析报告"
            onGenerate={handleGenerate}
          />
        </div>
      </PhaseShell>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasContent = !!displayContent
  const canAdvance = hasContent && !isStreaming && !advancing

  return (
    <PhaseShell
      projectId={projectId}
      phase="analysis"
      phaseLabel="需求分析"
      brainstormEnabled={true}
      onBrainstormGenerate={handleGenerate}
    >
      <div className="layout-focus page-enter">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">需求分析</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestart}
            disabled={isStreaming}
          >
            &#x21bb; 重新分析
          </Button>
        </div>

        <div className="h-px bg-[var(--border)]" />

        {/* T5: Agent Wave error banner (only shown when agent_errors has entries) */}
        {projectId && (
          <div className="mt-4">
            <AgentErrorsBanner
              projectId={projectId}
              refreshKey={agentErrorsKey}
              onRetry={isTeam ? handleRetryWave : undefined}
            />
          </div>
        )}

        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />

        {/* Streaming progress */}
        {isStreaming && (
          <div className="mt-4">
            <StreamProgress isStreaming={isStreaming} isThinking={isThinking} elapsedSeconds={elapsedSeconds} streamMeta={streamMeta} toolStatus={toolStatus} />
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] px-4 py-3">
            <p className="text-sm text-[var(--destructive)]">
              {error}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestart}
              >
                重试
              </Button>
              {error.includes("API") && error.includes("配置") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/settings")}
                >
                  前往设置
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Analysis cards */}
        <div className="mt-6">
          <RevealContainer isRevealing={isRevealing} revealedCount={revealedCount} totalCount={totalCount} onSkip={skipReveal}>
            <AnalysisCards markdown={visibleText} isStreaming={isStreaming} isRevealing={isRevealing} />
          </RevealContainer>

          {/* Stream metadata bar — shown after streaming completes */}
          {!isStreaming && <StreamProgress isStreaming={false} isThinking={false} elapsedSeconds={0} streamMeta={streamMeta} />}
        </div>

        {/* Chat history (collapsed previous rounds) */}
        {chatHistory.length > 0 && (
          <div className="mt-4 space-y-2">
            {chatHistory.map((round, i) => (
              <InlineChat
                key={`chat-${i}`}
                question={round.question}
                isCollapsed
                collapsedSummary={`已回答：${round.answer}`}
              />
            ))}
          </div>
        )}

        {/* Active AI question (follow-up) */}
        {!isStreaming && hasContent && questionInfo.hasQuestion && (
          <div className="mt-6">
            <InlineChat
              question={questionInfo.question}
              options={
                questionInfo.options.length > 0
                  ? questionInfo.options
                  : undefined
              }
              onAnswer={handleAnswer}
            />
          </div>
        )}

        {/* Supplementary input — always show after analysis is complete if no question detected */}
        {!isStreaming && hasContent && !questionInfo.hasQuestion && (
          <div className="mt-6">
            <InlineChat
              question="分析已完成。如果需要补充信息或调整方向，可以在这里告诉我。"
              onAnswer={handleAnswer}
            />
          </div>
        )}

        {/* Skip suggestion card */}
        {skipCardState === "visible" && skipSuggestions.length > 0 && (
          <div
            className="mt-6 rounded-lg border-l-[3px] border-l-[var(--accent-color)] bg-[var(--accent-light)] px-4 py-3"
            style={{ animation: "fadeInUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}
          >
            <p className="text-[13px] font-medium text-[var(--text-primary)] mb-2">
              建议跳过以下阶段
            </p>
            <ul className="space-y-1.5 mb-3">
              {skipSuggestions.map((s) => (
                <li key={s.phase} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
                  <span className="shrink-0 font-medium text-[var(--text-primary)]">{PHASE_LABELS[s.phase] ?? s.phase}</span>
                  <span>— {s.reason}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={handleAcceptSkip}>采纳建议</Button>
              <Button variant="ghost" size="sm" onClick={() => setSkipCardState("dismissed")}>保持完整流程</Button>
            </div>
          </div>
        )}
        {skipCardState === "accepted" && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-2.5">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" />
            <p className="text-[13px] text-[var(--text-secondary)]">
              已跳过 {skipSuggestions.length} 个阶段
            </p>
            <button
              onClick={() => setSkipCardState("visible")}
              className="text-[12px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
            >
              查看详情
            </button>
          </div>
        )}

        {/* Bottom action bar */}
        <div
          className={cn(
            "mt-8 flex items-center justify-between",
            "border-t border-[var(--border)] pt-6",
          )}
        >
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={isStreaming || advancing}
          >
            {PHASE_META.analysis.backLabel}
          </Button>

          <div className="flex flex-col items-end gap-1">
            <Button
              variant="primary"
              onClick={handleAdvance}
              disabled={!canAdvance}
            >
              {saving
                ? "保存中..."
                : advancing
                  ? "推进中..."
                  : PHASE_META.analysis.nextLabel + " →"}
            </Button>
            {!advancing && !saving && (
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {PHASE_META.analysis.nextDescription}
              </p>
            )}
          </div>
        </div>
      </div>
    </PhaseShell>
  )
}
