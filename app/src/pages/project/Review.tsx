import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { InlineChat } from "@/components/inline-chat"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api, type KnowledgeEntry } from "@/lib/tauri-api"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"
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

  // Knowledge recommendation (empty state only)
  const [projectName, setProjectName] = useState<string>("")
  const [relevantKnowledge, setRelevantKnowledge] = useState<KnowledgeEntry[]>([])
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false)

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

  // Load project name for knowledge recommendation
  useEffect(() => {
    if (!projectId) return
    api.getProject(projectId).then((project) => {
      if (project) setProjectName(project.name)
    }).catch(() => {})
  }, [projectId])

  // Fetch relevant knowledge for empty state recommendation
  useEffect(() => {
    if (!projectName || existingContent) return
    api.searchKnowledge(projectName).then((entries) => {
      if (entries.length > 0) setRelevantKnowledge(entries.slice(0, 3))
    }).catch(() => {})
  }, [projectName, existingContent])

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
        <span className="text-sm text-[var(--text-tertiary)]">加载中···</span>
      </div>
    )
  }

  if (!loading && !existingContent && !text && !isStreaming && !error) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">需求评审</h1>
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
        {relevantKnowledge.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-[13px] text-[var(--text-secondary)]"
              onClick={() => setKnowledgeExpanded((v) => !v)}
            >
              <span>发现 {relevantKnowledge.length} 条相关经验</span>
              <span>{knowledgeExpanded ? "▲" : "▼"}</span>
            </button>
            {knowledgeExpanded && (
              <div className="px-4 pb-3 space-y-2 border-t border-[var(--border)]">
                {relevantKnowledge.map((entry) => (
                  <div key={entry.id} className="py-2">
                    <p className="text-[12px] font-medium text-[var(--text-primary)]">{entry.title}</p>
                    <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2">
                      {entry.content.replace(/^#[^\n]+\n+/, "").slice(0, 120)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const hasContent = !!displayContent
  const canComplete = hasContent && !isStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">需求评审</h1>
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
              ? <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">正在思考···</p>
              : status
                ? <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{status}</p>
                : null
          })()}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
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
          <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
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
            "before:w-[3px] before:bg-[var(--accent-color)] before:content-['']",
          )}
        >
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] mb-1">
            已选择修改策略
          </p>
          <p className="text-sm text-[var(--text-primary)]">{strategyAnswer.replace(/\*\*/g, "")}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            请前往 PRD 页，按此策略重新生成文档。
          </p>
          <button
            type="button"
            onClick={() => navigate(`/project/${projectId}/prd`)}
            className="mt-2 text-sm text-[var(--accent-color)] hover:underline transition-colors duration-200"
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
            "before:w-[3px] before:bg-[var(--accent-color)] before:content-['']",
          )}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            如需根据评审意见修改文档，请返回 PRD 页重新生成。
          </p>
          <button
            type="button"
            onClick={() => navigate(`/project/${projectId}/prd`)}
            className="mt-2 text-sm text-[var(--accent-color)] hover:underline transition-colors duration-200"
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
          {PHASE_META.review.backLabel}
        </Button>

        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            onClick={handleComplete}
            disabled={!canComplete}
          >
            {saving
              ? "保存中..."
              : advancing
                ? "正在完成..."
                : PHASE_META.review.nextLabel + " ✓"}
          </Button>
          {!advancing && !saving && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.review.nextDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
