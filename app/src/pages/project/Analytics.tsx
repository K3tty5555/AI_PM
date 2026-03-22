import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useAiStream } from "@/hooks/use-ai-stream"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"
import { api } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANALYTICS_FILE = "09-analytics-requirement.md"

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function AnalyticsPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])

  const startedRef = useRef(false)

  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, start, reset } = useAiStream({
    projectId,
    phase: "analytics",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  const displayContent = existingContent ?? text

  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 20))
    : text || existingContent
      ? 100
      : 0

  // Load existing analytics file or trigger AI
  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      try {
        const content = await api.readProjectFile(projectId, ANALYTICS_FILE)
        if (!cancelled) {
          if (content) {
            setExistingContent(content)
          } else if (autostart) {
            if (!startedRef.current) {
              startedRef.current = true
              start([{ role: "user", content: "请基于项目PRD设计指标体系和埋点方案" }])
            }
          }
        }
      } catch (err) {
        console.error("Failed to load analytics file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请基于项目PRD设计指标体系和埋点方案" }])
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
  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请基于项目PRD设计指标体系和埋点方案" }], { excludedContext })
  }, [start, excludedContext])

  const handleRestart = useCallback(() => {
    reset()
    setExistingContent(null)
    startedRef.current = true
    start([{ role: "user", content: "请基于项目PRD设计指标体系和埋点方案" }], { excludedContext })
  }, [reset, start, excludedContext])

  const handleSkip = useCallback(async () => {
    if (!projectId) return
    try {
      await api.updatePhase({ projectId, phase: "analytics", status: "completed" })
      await api.advancePhase(projectId)
      invalidateProject(projectId)
      navigate(`/project/${projectId}/prototype?autostart=1`)
    } catch (err) {
      console.error("Failed to skip:", err)
      toast("跳过阶段失败，请重试", "error")
    }
  }, [projectId, navigate])

  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/prd`)
  }, [navigate, projectId])

  const handleAdvance = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    setSaving(true)

    try {
      if (!existingContent && text) {
        await api.saveProjectFile({
          projectId,
          fileName: ANALYTICS_FILE,
          content: text,
        })
      }
      setSaving(false)

      await api.advancePhase(projectId)
      invalidateProject(projectId)
      navigate(`/project/${projectId}/prototype?autostart=1`)
    } catch (err) {
      console.error("Failed to advance:", err)
      toast("保存或推进阶段失败，请重试", "error")
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text, navigate])

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
      <div className="layout-focus page-enter">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">埋点设计</h1>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
        <PhaseEmptyState
          phaseLabel="ANALYTICS"
          description="指标体系和埋点方案"
          onGenerate={handleGenerate}
          onSkip={handleSkip}
        />
      </div>
    )
  }

  const hasContent = !!displayContent
  const canAdvance = hasContent && !isStreaming && !advancing

  return (
    <div className="layout-focus page-enter">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">埋点设计</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRestart}
          disabled={isStreaming}
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

      {/* Analytics document viewer */}
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
          {PHASE_META.analytics.backLabel}
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
                : PHASE_META.analytics.nextLabel + " →"}
          </Button>
          {!advancing && !saving && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.analytics.nextDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
