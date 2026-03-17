import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { StoryBoard } from "@/components/story-board"
import { useAiStream } from "@/hooks/use-ai-stream"
import { parseStories, storiesToMarkdown, type Story } from "@/lib/story-parser"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"

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

  // Prevent double-start in StrictMode
  const startedRef = useRef(false)

  // AI stream hook
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, outputFile, start, reset } = useAiStream({
    projectId,
    phase: "stories",
  })

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
          } else {
            // No existing file — trigger AI generation
            if (!startedRef.current) {
              startedRef.current = true
              start([{ role: "user", content: "请生成用户故事" }])
            }
          }
        }
      } catch (err) {
        console.error("Failed to load stories file:", err)
        if (!cancelled && !startedRef.current) {
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

  /** Regenerate stories from AI */
  const handleRegenerate = useCallback(() => {
    reset()
    setStories([])
    setExistingMarkdown(null)
    startedRef.current = true
    start([{ role: "user", content: "请重新生成用户故事" }])
  }, [reset, start])

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

      // Mark stories phase as completed
      await api.updatePhase({
        projectId,
        phase: "stories",
        status: "completed",
        outputFile: outputFile ?? STORIES_FILE,
      })

      // Advance to next phase
      await api.advancePhase(projectId)
      invalidateProject(projectId)

      navigate(`/project/${projectId}/prd`)
    } catch (err) {
      console.error("Failed to advance:", err)
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, stories, outputFile, navigate])

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
  // Render
  // -------------------------------------------------------------------------

  const hasStories = stories.length > 0
  const canAdvance = hasStories && !isStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline">USER_STORIES</Badge>
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

      {/* Streaming placeholder */}
      {isStreaming && stories.length === 0 && (
        <div className="mt-6 flex items-center gap-3 py-8">
          <span
            className={cn(
              "inline-block w-2 h-2 bg-[var(--yellow)]",
              "animate-[dotPulse_2s_ease-in-out_infinite]",
            )}
            style={{ borderRadius: "50%" }}
          />
          <span className="font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
            GENERATING STORIES...
          </span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
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
          <p className="text-xs text-[var(--text-muted)] font-terminal mt-2">
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
          &larr; 返回分析
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
              : "确认，生成PRD \u2192"}
        </Button>
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
    "w-full px-3 py-1.5 text-sm text-[var(--dark)]",
    "bg-transparent border border-[var(--border)]",
    "placeholder:text-[var(--text-muted)]",
    "outline-none",
    "transition-[border-color] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
    "focus:border-[var(--yellow)]",
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
        <label className="text-xs text-[var(--text-muted)] font-terminal uppercase tracking-[1px]">
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

        <label className="text-xs text-[var(--text-muted)] font-terminal uppercase tracking-[1px]">
          想要
        </label>
        <input
          type="text"
          value={want}
          onChange={(e) => setWant(e.target.value)}
          placeholder="查看班级考试报告"
          className={inputClass}
        />

        <label className="text-xs text-[var(--text-muted)] font-terminal uppercase tracking-[1px]">
          以便
        </label>
        <input
          type="text"
          value={benefit}
          onChange={(e) => setBenefit(e.target.value)}
          placeholder="了解学生学情"
          className={inputClass}
        />

        <label className="text-xs text-[var(--text-muted)] font-terminal uppercase tracking-[1px]">
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
                "font-terminal",
                priority === p
                  ? "border-[var(--yellow)] bg-[var(--yellow)] text-[var(--dark)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--yellow)]",
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
