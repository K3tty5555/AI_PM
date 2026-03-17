import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { InlineChat } from "@/components/inline-chat"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PhaseEmptyState } from "@/components/phase-empty-state"

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

function detectQuestion(text: string): {
  hasQuestion: boolean
  question: string
  options: string[]
} {
  const questionMatch = text.match(
    /\[QUESTION\]\s*([\s\S]*?)(?:\[\/QUESTION\]|\[OPTIONS\]|$)/
  )
  if (questionMatch) {
    const question = questionMatch[1].trim()
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

  const paragraphs = text.split(/\n\n+/)
  const lastParagraphs = paragraphs.slice(-3)
  for (let i = lastParagraphs.length - 1; i >= 0; i--) {
    const p = lastParagraphs[i].trim()
    if (p.endsWith("？") || p.endsWith("?")) {
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

const REVIEW_FILE = "07-review-report.md"

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ReviewPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<ChatRound[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)

  const startedRef = useRef(false)

  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, outputFile, start, reset } = useAiStream({
    projectId,
    phase: "review",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  const displayContent = existingContent ?? text

  const questionInfo =
    !isStreaming && text ? detectQuestion(text) : { hasQuestion: false, question: "", options: [] }

  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 20))
    : text || existingContent
      ? 100
      : 0

  // Load existing review report or trigger AI
  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      try {
        const content = await api.readProjectFile(projectId, REVIEW_FILE)
        if (!cancelled) {
          if (content) {
            setExistingContent(content)
          } else if (autostart) {
            if (!startedRef.current) {
              startedRef.current = true
              const initialMessages: Message[] = [
                { role: "user", content: "请开始需求评审" },
              ]
              setMessages(initialMessages)
              start(initialMessages)
            }
          }
        }
      } catch (err) {
        console.error("Failed to load review file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          const initialMessages: Message[] = [
            { role: "user", content: "请开始需求评审" },
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

  // Handlers
  const handleAnswer = useCallback(
    (answer: string) => {
      setChatHistory((prev) => [
        ...prev,
        { question: questionInfo.question, answer },
      ])
      const newMessages: Message[] = [
        ...messages,
        { role: "assistant", content: text || existingContent || "" },
        { role: "user", content: answer },
      ]
      setMessages(newMessages)
      setExistingContent(null)
      startedRef.current = true
      start(newMessages)
    },
    [messages, text, questionInfo.question, start]
  )

  const handleGenerate = useCallback(() => {
    startedRef.current = true
    const initialMessages: Message[] = [
      { role: "user", content: "请开始需求评审" },
    ]
    setMessages(initialMessages)
    start(initialMessages)
  }, [start])

  const handleRestart = useCallback(() => {
    reset()
    setExistingContent(null)
    setChatHistory([])
    const initialMessages: Message[] = [
      { role: "user", content: "请开始需求评审" },
    ]
    setMessages(initialMessages)
    startedRef.current = true
    start(initialMessages)
  }, [reset, start])

  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/prototype`)
  }, [navigate, projectId])

  /** Complete the project — this is the final phase */
  const handleComplete = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    setSaving(true)

    try {
      if (!existingContent && text) {
        await api.saveProjectFile({
          projectId,
          fileName: REVIEW_FILE,
          content: text,
        })
      }
      setSaving(false)

      await api.updatePhase({
        projectId,
        phase: "review",
        status: "completed",
        outputFile: outputFile ?? REVIEW_FILE,
      })

      await api.advancePhase(projectId)
      invalidateProject(projectId)
      navigate("/")
    } catch (err) {
      console.error("Failed to complete:", err)
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text, outputFile, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
          LOADING...
        </span>
      </div>
    )
  }

  if (!loading && !existingContent && !text && !isStreaming && !error) {
    return (
      <PhaseEmptyState
        phaseLabel="REVIEW"
        description="需求评审报告"
        onGenerate={handleGenerate}
      />
    )
  }

  const hasContent = !!displayContent
  const canComplete = hasContent && !isStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Badge variant="outline">REVIEW</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRestart}
          disabled={isStreaming}
        >
          &#x21bb; 重新评审
        </Button>
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {isThinking && (
            <p className="mt-2 font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)] animate-[blink_1s_step-end_infinite]">THINKING...</p>
          )}
          <p className="mt-2 font-terminal text-xs text-[var(--text-muted)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
          <p className="text-sm text-[var(--destructive)]">
            {error}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRestart}>
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

      {/* Review report viewer */}
      <div className="mt-6">
        <PrdViewer
          markdown={displayContent || ""}
          isStreaming={isStreaming}
        />
        {!isStreaming && streamMeta !== null && (
          <p className="text-xs text-[var(--text-muted)] font-terminal mt-2">
            {streamMeta.inputTokens != null && streamMeta.outputTokens != null
              ? `API 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens.toLocaleString()} tokens`
              : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
          </p>
        )}
      </div>

      {/* Chat history */}
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

      {/* Active AI question */}
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

      {/* Supplementary input */}
      {!isStreaming && hasContent && !questionInfo.hasQuestion && (
        <div className="mt-6">
          <InlineChat
            question="需求评审已完成。如需补充或修改评审意见，可以在这里告诉我。"
            onAnswer={handleAnswer}
          />
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
          &larr; 返回原型
        </Button>

        <Button
          variant="primary"
          onClick={handleComplete}
          disabled={!canComplete}
        >
          {saving
            ? "保存中..."
            : advancing
              ? "正在完成..."
              : "完成项目 \u2713"}
        </Button>
      </div>
    </div>
  )
}
