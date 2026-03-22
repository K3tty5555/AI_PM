import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { StoryBoard } from "@/components/story-board"
import { useAiStream } from "@/hooks/use-ai-stream"
import { parseStories, storiesToMarkdown, type Story } from "@/lib/story-parser"
import { api } from "@/lib/tauri-api"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORIES_FILE = "04-user-stories.md"

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function StoriesPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string

  // Page state
  const [loading, setLoading] = useState(true)
  const [stories, setStories] = useState<Story[]>([])
  const [existingMarkdown, setExistingMarkdown] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])

  // Prevent double-start in StrictMode
  const startedRef = useRef(false)

  // AI stream hook
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, start, reset } = useAiStream({
    projectId,
    phase: "stories",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"
  const isYolo = searchParams.get("yolo") === "1"

  // Parse stories from AI output when streaming completes
  const streamParsedStories = useMemo(() => {
    if (isStreaming || !text) return null
    return parseStories(text)
  }, [isStreaming, text])

  // When AI stream finishes, update stories
  useEffect(() => {
    if (streamParsedStories && streamParsedStories.length > 0) {
      setStories(streamParsedStories)
    }
  }, [streamParsedStories])

  // Progress estimation during streaming
  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 20))
    : stories.length > 0 || existingMarkdown
      ? 100
      : 0

  // -------------------------------------------------------------------------
  // Load existing stories file on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      try {
        const content = await api.readProjectFile(projectId, STORIES_FILE)
        if (!cancelled) {
          if (content) {
            setExistingMarkdown(content)
            const parsed = parseStories(content)
            if (parsed.length > 0) {
              setStories(parsed)
            }
          } else if (autostart) {
            // No existing file — trigger AI generation
            if (!startedRef.current) {
              startedRef.current = true
              start([{ role: "user", content: "请生成用户故事" }])
            }
          }
        }
      } catch (err) {
        console.error("Failed to load stories file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请生成用户故事" }])
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

  /** Generate stories for the first time */
  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请生成用户故事" }], { excludedContext })
  }, [start, excludedContext])

  /** Regenerate stories from AI */
  const handleRegenerate = useCallback(() => {
    reset()
    setStories([])
    setExistingMarkdown(null)
    startedRef.current = true
    start([{ role: "user", content: "请重新生成用户故事" }], { excludedContext })
  }, [reset, start, excludedContext])

  /** Skip this phase */
  const handleSkip = useCallback(async () => {
    if (!projectId) return
    try {
      await api.updatePhase({ projectId, phase: "stories", status: "completed" })
      await api.advancePhase(projectId)
      invalidateProject(projectId)
      navigate(`/project/${projectId}/prd?autostart=1`)
    } catch (err) {
      console.error("Failed to skip:", err)
    }
  }, [projectId, navigate])

  /** Go back to analysis */
  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/analysis`)
  }, [navigate, projectId])

  /** Toggle add form */
  const handleToggleAdd = useCallback(() => {
    setShowAddForm((prev) => !prev)
  }, [])

  /** Save stories & advance to PRD */
  const handleAdvance = useCallback(async () => {
    if (!projectId || stories.length === 0) return
    setAdvancing(true)
    setSaving(true)

    try {
      // Convert stories back to markdown and save
      const markdown = storiesToMarkdown(stories)
      await api.saveProjectFile({
        projectId,
        fileName: STORIES_FILE,
        content: markdown,
      })
      setSaving(false)

      // Advance to next phase (advancePhase marks current phase as completed)
      await api.advancePhase(projectId)
      invalidateProject(projectId)

      navigate(`/project/${projectId}/prd${isYolo ? "?yolo=1" : "?autostart=1"}`)
    } catch (err) {
      console.error("Failed to advance:", err)
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, stories, navigate, isYolo])

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

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (!loading && !existingMarkdown && !text && !isStreaming && !error) {
    return (
      <div className="layout-focus page-enter">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">用户故事</h1>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
        <PhaseEmptyState
          phaseLabel="STORIES"
          description="用户故事"
          onGenerate={handleGenerate}
          onSkip={handleSkip}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasStories = stories.length > 0
  const canAdvance = hasStories && !isStreaming && !advancing

  return (
    <div className="layout-focus page-enter">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">用户故事</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleAdd}
            disabled={isStreaming}
          >
            + 添加
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={isStreaming}
          >
            &#x21bb; 重新生成
          </Button>
        </div>
      </div>

      <div className="h-px bg-[var(--border)]" />

      <ContextPills
        projectId={projectId!}
        onExcludeChange={setExcludedContext}
        className="border-b border-[var(--border)]"
      />
      <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />

      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {(() => {
            const status = !isThinking ? extractStreamStatus(text) : ""
            return isThinking
              ? <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">思考中...</p>
              : status
                ? <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{status}</p>
                : null
          })()}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* Streaming placeholder */}
      {isStreaming && stories.length === 0 && (
        <div className="mt-6 flex items-center gap-3 py-8">
          <span
            className={cn(
              "inline-block w-2 h-2 bg-[var(--accent-color)]",
              "animate-[dotPulse_2s_ease-in-out_infinite]",
            )}
            style={{ borderRadius: "50%" }}
          />
          <span className="text-[12px] font-medium text-[var(--text-tertiary)]">
            生成用户故事中...
          </span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
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

      {/* Inline add form */}
      {showAddForm && (
        <div className="mt-6">
          <AddStoryInline
            onAdd={(story) => {
              setStories((prev) => [...prev, story])
              setShowAddForm(false)
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Story board */}
      <div className="mt-6">
        <StoryBoard
          stories={stories}
          onStoriesChange={setStories}
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
          {PHASE_META.stories.backLabel}
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
                : PHASE_META.stories.nextLabel + " →"}
          </Button>
          {!advancing && !saving && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.stories.nextDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline add story component (page-level, simpler than StoryBoard's)
// ---------------------------------------------------------------------------

function AddStoryInline({
  onAdd,
  onCancel,
}: {
  onAdd: (story: Story) => void
  onCancel: () => void
}) {
  const [role, setRole] = useState("")
  const [want, setWant] = useState("")
  const [benefit, setBenefit] = useState("")
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">("P1")

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!role.trim() || !want.trim() || !benefit.trim()) return
      onAdd({
        id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: role.trim(),
        want: want.trim(),
        benefit: benefit.trim(),
        priority,
        acceptance: [],
      })
    },
    [role, want, benefit, priority, onAdd]
  )

  const inputClass = cn(
    "w-full px-3 py-1.5 text-sm text-[var(--text-primary)]",
    "bg-transparent border border-[var(--border)]",
    "placeholder:text-[var(--text-secondary)]",
    "outline-none",
    "transition-[border-color] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
    "focus:border-[var(--accent-color)]",
  )

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "border border-[var(--border)] p-4 space-y-3",
        "bg-[var(--card)]",
        "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
      )}
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          角色
        </label>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="教师"
          className={inputClass}
          autoFocus
        />

        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          想要
        </label>
        <input
          type="text"
          value={want}
          onChange={(e) => setWant(e.target.value)}
          placeholder="查看班级考试报告"
          className={inputClass}
        />

        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          以便
        </label>
        <input
          type="text"
          value={benefit}
          onChange={(e) => setBenefit(e.target.value)}
          placeholder="了解学生学情"
          className={inputClass}
        />

        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          优先级
        </label>
        <div className="flex gap-2">
          {(["P0", "P1", "P2"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                "px-3 py-1 text-xs font-medium border cursor-pointer",
                "transition-all duration-150",
                priority === p
                  ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={!role.trim() || !want.trim() || !benefit.trim()}
        >
          添加
        </Button>
      </div>
    </form>
  )
}
