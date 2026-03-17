import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { PrdToc, slugify } from "@/components/prd-toc"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api } from "@/lib/tauri-api"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRD_FILE = "05-prd/05-PRD-v1.0.md"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all h2/h3 ids from markdown for IntersectionObserver */
function extractSectionIds(markdown: string): string[] {
  const ids: string[] = []
  const lines = markdown.split("\n")
  for (const line of lines) {
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    if (h2) ids.push(slugify(h2[1].trim()))
    else if (h3) ids.push(slugify(h3[1].trim()))
  }
  return ids
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function PrdPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string

  // Page state
  const [loading, setLoading] = useState(true)
  const [existingMarkdown, setExistingMarkdown] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | undefined>()
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedMarkdown, setEditedMarkdown] = useState<string | null>(null)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const [reviewContent, setReviewContent] = useState<string | null>(null)

  // AI assist input
  const [assistInput, setAssistInput] = useState("")
  const [isAssistStreaming, setIsAssistStreaming] = useState(false)

  // Prevent double-start in StrictMode
  const startedRef = useRef(false)

  // Ref for the content scroll container
  const contentRef = useRef<HTMLDivElement>(null)

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  // AI stream hook for initial generation
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, outputFile, start, reset } = useAiStream({
    projectId,
    phase: "prd",
  })

  // AI stream hook for assist modifications
  const {
    text: assistText,
    isStreaming: assistStreaming,
    error: assistError,
    start: assistStart,
    reset: assistReset,
  } = useAiStream({
    projectId,
    phase: "prd",
  })

  // Track assist streaming state
  useEffect(() => {
    setIsAssistStreaming(assistStreaming)
  }, [assistStreaming])

  // When assist finishes, update the markdown
  useEffect(() => {
    if (!assistStreaming && assistText) {
      setEditedMarkdown(assistText)
    }
  }, [assistStreaming, assistText])

  // The final markdown to display
  const displayMarkdown = useMemo(() => {
    if (editedMarkdown) return editedMarkdown
    if (existingMarkdown) return existingMarkdown
    return text
  }, [editedMarkdown, existingMarkdown, text])

  // Progress estimation during streaming
  const currentStreaming = isStreaming || isAssistStreaming
  const streamText = isAssistStreaming ? assistText : text
  const progressValue = currentStreaming
    ? Math.min(90, Math.floor(streamText.length / 40))
    : displayMarkdown
      ? 100
      : 0

  // Section ids for observer
  const sectionIds = useMemo(
    () => extractSectionIds(displayMarkdown || ""),
    [displayMarkdown]
  )

  // -------------------------------------------------------------------------
  // IntersectionObserver for active section tracking
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!contentRef.current || sectionIds.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      {
        root: contentRef.current,
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0,
      }
    )

    // Observe all section headings
    for (const id of sectionIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sectionIds, displayMarkdown])

  // -------------------------------------------------------------------------
  // Load existing PRD on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      // Check for review report (non-blocking)
      api.readProjectFile(projectId, "07-review-report.md").then((r) => {
        if (!cancelled && r) setReviewContent(r)
      }).catch(() => {})

      try {
        const content = await api.readProjectFile(projectId, PRD_FILE)
        if (!cancelled) {
          if (content) {
            setExistingMarkdown(content)
          } else if (autostart) {
            // No existing file — trigger AI generation
            if (!startedRef.current) {
              startedRef.current = true
              start([{ role: "user", content: "请生成 PRD" }])
            }
          }
        }
      } catch (err) {
        console.error("Failed to load PRD file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请生成 PRD" }])
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

  /** Scroll to a section by id */
  const handleSectionClick = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  /** Edit callback from PrdViewer (inline double-click edit) */
  const handleEdit = useCallback((newMarkdown: string) => {
    setEditedMarkdown(newMarkdown)
  }, [])

  /** Generate PRD for the first time */
  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请生成 PRD" }], { excludedContext })
  }, [start, excludedContext])

  /** Regenerate the entire PRD */
  const handleRegenerate = useCallback(() => {
    reset()
    assistReset()
    setExistingMarkdown(null)
    setEditedMarkdown(null)
    startedRef.current = true
    const prompt = reviewContent
      ? `请根据以下需求评审报告的意见，修订 PRD 文档。更新版本号（如 v1.0→v1.1），在修订日志中注明本次修改原因和涉及模块，并按评审意见完善对应章节内容。\n\n评审报告：\n${reviewContent}`
      : "请重新生成 PRD"
    start([{ role: "user", content: prompt }], { excludedContext })
  }, [reset, assistReset, start, excludedContext, reviewContent])

  /** Send AI assist modification request */
  const handleAssistSend = useCallback(() => {
    if (!assistInput.trim() || !displayMarkdown) return

    assistReset()
    assistStart([
      {
        role: "user",
        content: `这是当前的 PRD：\n\n${displayMarkdown}\n\n请根据以下要求修改：${assistInput.trim()}`,
      },
    ])
    setAssistInput("")
  }, [assistInput, displayMarkdown, assistReset, assistStart])

  /** Handle Enter key in assist input */
  const handleAssistKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleAssistSend()
      }
    },
    [handleAssistSend]
  )

  /** Save PRD and go back */
  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/stories`)
  }, [navigate, projectId])

  /** Save PRD & mark phase complete */
  const handleComplete = useCallback(async () => {
    if (!projectId || !displayMarkdown) return
    setAdvancing(true)
    setSaving(true)

    try {
      // Save PRD file
      await api.saveProjectFile({
        projectId,
        fileName: PRD_FILE,
        content: displayMarkdown,
      })
      setSaving(false)

      // Mark phase as completed
      await api.updatePhase({
        projectId,
        phase: "prd",
        status: "completed",
        outputFile: outputFile ?? PRD_FILE,
      })

      // Advance to next phase
      await api.advancePhase(projectId)
      invalidateProject(projectId)

      navigate(`/project/${projectId}/prototype?autostart=1`)
    } catch (err) {
      console.error("Failed to complete PRD:", err)
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, displayMarkdown, outputFile])

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
          LOADING...
        </span>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (!loading && !existingMarkdown && !text && !isStreaming && !error) {
    return (
      <div className="mx-auto w-full max-w-[1080px]">
        <div className="mb-6 flex items-center justify-between">
          <Badge variant="outline">PRD_V1.0</Badge>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <PhaseEmptyState
          phaseLabel="PRD"
          description="产品需求文档"
          onGenerate={handleGenerate}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasContent = !!displayMarkdown
  const canComplete = hasContent && !currentStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline">PRD_V1.0</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={currentStreaming}
        >
          &#x21bb; 重新生成
        </Button>
      </div>

      <div className="h-px bg-[var(--border)]" />

      <ContextPills
        projectId={projectId!}
        onExcludeChange={setExcludedContext}
        className="border-b border-[var(--border)]"
      />

      {/* Streaming progress */}
      {currentStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {(() => {
            const status = !isThinking ? extractStreamStatus(streamText) : ""
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
      {(error || assistError) && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
          <p className="text-sm text-[var(--destructive)]">
            {error || assistError}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
            >
              重试
            </Button>
            {((error || assistError) ?? "").includes("API") && ((error || assistError) ?? "").includes("配置") && (
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

      {/* Main content: two-column layout */}
      <div className="mt-6 flex gap-6">
        {/* Left: PRD content */}
        <div
          ref={contentRef}
          className="min-w-0 flex-1 overflow-y-auto"
        >
          <PrdViewer
            markdown={displayMarkdown || ""}
            isStreaming={currentStreaming}
            onEdit={handleEdit}
          />
          {!currentStreaming && streamMeta !== null && (
            <p className="text-xs text-[var(--text-muted)] font-terminal mt-2">
              {streamMeta.inputTokens != null && streamMeta.outputTokens != null
                ? `API 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>

        {/* Right: TOC navigation */}
        {hasContent && sectionIds.length > 0 && (
          <div className="hidden lg:block w-[220px] shrink-0">
            <PrdToc
              markdown={displayMarkdown || ""}
              activeSection={activeSection}
              onSectionClick={handleSectionClick}
            />
          </div>
        )}
      </div>

      {/* AI Assist input */}
      {hasContent && !currentStreaming && (
        <div
          className={cn(
            "mt-6",
            "relative pl-5",
            "before:absolute before:left-0 before:top-0 before:bottom-0",
            "before:w-[3px] before:bg-[var(--yellow)] before:content-['']",
            "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
          )}
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={assistInput}
              onChange={(e) => setAssistInput(e.target.value)}
              onKeyDown={handleAssistKeyDown}
              placeholder="输入修改指令，如「把权限配置这一段写详细些」"
              className={cn(
                "flex-1 h-9 px-3",
                "text-sm text-[var(--dark)]",
                "bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-muted)]",
                "outline-none",
                "transition-[border-color] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
                "focus:border-[var(--yellow)]",
              )}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAssistSend}
              disabled={!assistInput.trim() || isAssistStreaming}
            >
              {isAssistStreaming ? "生成中..." : "发送"}
            </Button>
          </div>
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
          disabled={currentStreaming || advancing}
        >
          &larr; 返回故事
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
              : "完成 \u2713"}
        </Button>
      </div>
    </div>
  )
}
