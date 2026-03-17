import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { InlineChat } from "@/components/inline-chat"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api } from "@/lib/tauri-api"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVIEW_FILE = "07-review-report.md"

// ---------------------------------------------------------------------------
// Question detection (read-only — answers are recorded, not sent to AI)
// ---------------------------------------------------------------------------

function detectQuestion(text: string): { hasQuestion: boolean; question: string; options: string[] } {
  // [QUESTION] / [OPTIONS] tag format
  const questionMatch = text.match(/\[QUESTION\]\s*([\s\S]*?)(?:\[\/QUESTION\]|\[OPTIONS\]|$)/)
  if (questionMatch) {
    const question = questionMatch[1].trim()
    const optionsMatch = text.match(/\[OPTIONS\]\s*([\s\S]*?)(?:\[\/OPTIONS\]|$)/)
    const options: string[] = []
    if (optionsMatch) {
      optionsMatch[1].split("\n").map((l) => l.replace(/^[-*\d.)\]]+\s*/, "").trim()).filter(Boolean).forEach((o) => options.push(o))
    }
    return { hasQuestion: true, question, options }
  }

  const lines = text.split("\n")

  // Scan last 60 lines from the END — the strategy question is always at the bottom
  const start = Math.max(0, lines.length - 60)
  for (let i = lines.length - 1; i >= start; i--) {
    const line = lines[i].trim()
    if (line.length < 4) continue
    // Strip markdown bold/italic markers before matching (e.g. **请选择…：**)
    const stripped = line.replace(/^\*+|^\*\*|^\*\*\*|\*+$|\*\*$|\*\*\*$/g, "").trim()
    // Question line: ends with ？/? or ends with ：/: containing interrogative keywords
    const isQuestion =
      stripped.endsWith("？") || stripped.endsWith("?") ||
      ((stripped.endsWith("：") || stripped.endsWith(":")) &&
        /请选择|请告诉|请回复|请说明|请输入/.test(stripped))
    if (!isQuestion) continue

    // Collect bullet items that follow this question line
    const options: string[] = []
    for (let j = i + 1; j < lines.length && j < i + 20; j++) {
      const opt = lines[j].trim()
      if (!opt) continue
      if (/^[-•*]\s*/.test(opt) || /^["「]/.test(opt)) {
        options.push(opt.replace(/^[-•*]\s*/, ""))
      } else if (options.length > 0) {
        break
      }
    }
    return { hasQuestion: true, question: line, options }
  }

  return { hasQuestion: false, question: "", options: [] }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ReviewPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  // Stores the user's chosen modification strategy (recorded only, does not re-trigger AI)
  const [strategyAnswer, setStrategyAnswer] = useState<string | null>(null)

  const startedRef = useRef(false)

  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, outputFile, start, reset } = useAiStream({
    projectId,
    phase: "review",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  const displayContent = existingContent ?? text

  // Detect AI question at end of report (e.g. "请选择修改策略")
  const questionInfo = !isStreaming && displayContent
    ? detectQuestion(displayContent)
    : { hasQuestion: false, question: "", options: [] }

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
              start([{ role: "user", content: "请开始需求评审" }])
            }
          }
        }
      } catch (err) {
        console.error("Failed to load review file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请开始需求评审" }])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadExisting()
    return () => { cancelled = true }
  }, [projectId, start])

  // Record strategy choice — does NOT call start(), navigates to PRD page instead
  const handleAnswer = useCallback((answer: string) => {
    setStrategyAnswer(answer)
  }, [])

  // Handlers
  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请开始需求评审" }], { excludedContext })
  }, [start, excludedContext])

  const handleRestart = useCallback(() => {
    reset()
    setExistingContent(null)
    setStrategyAnswer(null)
    startedRef.current = true
    start([{ role: "user", content: "请开始需求评审" }], { excludedContext })
  }, [reset, start, excludedContext])

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
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-6 flex items-center justify-between">
          <Badge variant="outline">REVIEW</Badge>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <PhaseEmptyState
          phaseLabel="REVIEW"
          description="需求评审报告"
          onGenerate={handleGenerate}
        />
      </div>
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

      <ContextPills
        projectId={projectId!}
        onExcludeChange={setExcludedContext}
        className="border-b border-[var(--border)]"
      />

      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {(() => {
            const status = !isThinking ? extractStreamStatus(text) : ""
            return isThinking
              ? <p className="mt-2 font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)] animate-[blink_1s_step-end_infinite]">THINKING...</p>
              : status
                ? <p className="mt-2 font-terminal text-xs tracking-[1px] text-[var(--text-muted)]">{status}</p>
                : null
          })()}
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

      {/* Review report */}
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

      {/* AI question — user picks strategy, answer recorded but does NOT trigger generation */}
      {!isStreaming && hasContent && questionInfo.hasQuestion && !strategyAnswer && (
        <div className="mt-6">
          <InlineChat
            question={questionInfo.question}
            options={questionInfo.options.length > 0 ? questionInfo.options : undefined}
            onAnswer={handleAnswer}
          />
        </div>
      )}

      {/* Post-answer: show chosen strategy + navigate to PRD */}
      {!isStreaming && hasContent && strategyAnswer && (
        <div
          className={cn(
            "mt-6 pl-5 relative",
            "before:absolute before:left-0 before:top-0 before:bottom-0",
            "before:w-[3px] before:bg-[var(--yellow)] before:content-['']",
          )}
        >
          <p className="font-terminal text-[10px] uppercase tracking-[2px] text-[var(--text-muted)] mb-1">
            已选择修改策略
          </p>
          <p className="text-sm text-[var(--dark)]">{strategyAnswer.replace(/\*\*/g, "")}</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            请前往 PRD 页，按此策略重新生成文档。
          </p>
          <button
            type="button"
            onClick={() => navigate(`/project/${projectId}/prd`)}
            className="mt-2 font-terminal text-[10px] uppercase tracking-[1px] text-[var(--dark)] hover:text-[var(--yellow)] transition-colors duration-[var(--duration-terminal)]"
          >
            ← 前往 PRD 页重新生成
          </button>
        </div>
      )}

      {/* Default guidance when AI has no question */}
      {!isStreaming && hasContent && !questionInfo.hasQuestion && !strategyAnswer && (
        <div
          className={cn(
            "mt-6 pl-5 relative",
            "before:absolute before:left-0 before:top-0 before:bottom-0",
            "before:w-[3px] before:bg-[var(--yellow)] before:content-['']",
          )}
        >
          <p className="text-sm text-[var(--text-muted)]">
            如需根据评审意见修改文档，请返回 PRD 页重新生成。
          </p>
          <button
            type="button"
            onClick={() => navigate(`/project/${projectId}/prd`)}
            className="mt-2 font-terminal text-[10px] uppercase tracking-[1px] text-[var(--dark)] hover:text-[var(--yellow)] transition-colors duration-[var(--duration-terminal)]"
          >
            ← 前往 PRD 页重新生成
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
