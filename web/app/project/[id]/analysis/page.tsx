"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { AnalysisCards } from "@/components/analysis-cards"
import { InlineChat } from "@/components/inline-chat"
import { useAiStream } from "@/hooks/use-ai-stream"
import { cn } from "@/lib/utils"

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

export default function AnalysisPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string

  // Page state
  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<ChatRound[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Prevent double-start of AI stream in React StrictMode
  const startedRef = useRef(false)

  // AI stream hook
  const { text, isStreaming, error, outputFile, start, reset } = useAiStream({
    projectId,
    phase: "analysis",
  })

  // The content to render — either from existing file or from AI stream
  const displayContent = existingContent ?? text

  // Question detection on completed stream
  const questionInfo =
    !isStreaming && text ? detectQuestion(text) : { hasQuestion: false, question: "", options: [] }

  // Progress estimation (for the indeterminate-ish progress bar during streaming)
  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 20))
    : text || existingContent
      ? 100
      : 0

  // -------------------------------------------------------------------------
  // Load existing analysis report on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/files/${ANALYSIS_FILE}`
        )
        if (res.ok) {
          const content = await res.text()
          if (!cancelled && content) {
            setExistingContent(content)
          }
        } else {
          // No existing file — trigger AI analysis
          if (!cancelled && !startedRef.current) {
            startedRef.current = true
            const initialMessages: Message[] = [
              { role: "user", content: "请开始分析" },
            ]
            setMessages(initialMessages)
            start(initialMessages)
          }
        }
      } catch (err) {
        console.error("Failed to load analysis file:", err)
        // On error, try to start analysis anyway
        if (!cancelled && !startedRef.current) {
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
      // Record the chat round
      setChatHistory((prev) => [
        ...prev,
        { question: questionInfo.question, answer },
      ])

      // Build new messages array with the conversation so far
      const newMessages: Message[] = [
        ...messages,
        { role: "assistant", content: text },
        { role: "user", content: answer },
      ]
      setMessages(newMessages)

      // Clear existing content so we show fresh AI output
      setExistingContent(null)
      startedRef.current = true
      start(newMessages)
    },
    [messages, text, questionInfo.question, start]
  )

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
    start(initialMessages)
  }, [reset, start])

  /** Go back to requirement page */
  const handleBack = useCallback(() => {
    router.push(`/project/${projectId}/requirement`)
  }, [router, projectId])

  /** Save analysis & advance to stories */
  const handleAdvance = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    setSaving(true)

    try {
      // If the AI just finished streaming (not from existing file), save the output
      if (!existingContent && text) {
        const saveRes = await fetch("/api/ai/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            fileName: ANALYSIS_FILE,
            content: text,
          }),
        })
        if (!saveRes.ok) {
          throw new Error("保存分析结果失败")
        }
      }
      setSaving(false)

      // Mark analysis phase as completed and advance
      const patchRes = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updatePhase",
          phase: "analysis",
          status: "completed",
          outputFile: outputFile ?? ANALYSIS_FILE,
        }),
      })
      if (!patchRes.ok) throw new Error("更新阶段状态失败")

      // Advance to next phase
      const advanceRes = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      })
      if (!advanceRes.ok) throw new Error("推进阶段失败")

      router.push(`/project/${projectId}/stories`)
    } catch (err) {
      console.error("Failed to advance:", err)
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text, outputFile, router])

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
          LOADING...
        </span>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasContent = !!displayContent
  const canAdvance = hasContent && !isStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Badge variant="outline">ANALYSIS</Badge>
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

      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
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
                onClick={() => router.push("/settings")}
              >
                前往设置
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Analysis cards */}
      <div className="mt-6">
        <AnalysisCards
          markdown={displayContent || ""}
          isStreaming={isStreaming}
        />
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
          &larr; 返回修改需求
        </Button>

        <Button
          variant="primary"
          onClick={handleAdvance}
          disabled={!canAdvance}
        >
          {saving
            ? "保存中..."
            : advancing
              ? "正在推进..."
              : "确认，进入用户故事 \u2192"}
        </Button>
      </div>
    </div>
  )
}
