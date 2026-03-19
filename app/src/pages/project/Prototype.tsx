import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api } from "@/lib/tauri-api"
import { open } from "@tauri-apps/plugin-shell"
import { cn, extractStreamStatus } from "@/lib/utils"
import { PHASE_META } from "@/lib/phase-meta"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"

const PROTOTYPE_FILE = "06-prototype.html"
const DEVICE_WIDTHS = { mobile: 375, tablet: 768, desktop: 0 } as const

export function PrototypePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [existingHtml, setExistingHtml] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [outputDir, setOutputDir] = useState<string>("")
  const [advancing, setAdvancing] = useState(false)
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("desktop")
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const startedRef = useRef(false)

  const { text, isStreaming, isThinking, error, outputFile, start, reset } = useAiStream({
    projectId: projectId!,
    phase: "prototype",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  // Current HTML content — existing file or freshly streamed
  const htmlContent = existingHtml ?? (text && !isStreaming ? text : null)

  // Fallback: when streaming ends with no content, re-read from disk.
  // Handles CLI mode where the AI writes the file via Write tool and stdout is short.
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming
    wasStreamingRef.current = isStreaming
    if (justFinished && !existingHtml && !text && projectId) {
      api.readProjectFile(projectId!, PROTOTYPE_FILE).then((content) => {
        if (content && content.trim().length > 100) setExistingHtml(content)
      }).catch(console.error)
    }
  }, [isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create blob URL for iframe
  useEffect(() => {
    if (!htmlContent) return
    const blob = new Blob([htmlContent], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [htmlContent])

  // Streaming progress
  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 50))
    : htmlContent ? 100 : 0

  // Load existing file or start generation
  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function load() {
      try {
        const project = await api.getProject(projectId!)
        if (!cancelled && project) {
          setOutputDir(project.outputDir)
        }

        const content = await api.readProjectFile(projectId!, PROTOTYPE_FILE)
          ?? await api.readProjectFile(projectId!, "06-prototype/index.html")
        if (!cancelled) {
          if (content) {
            setExistingHtml(content)
          } else if (autostart && !startedRef.current) {
            startedRef.current = true
            start([{ role: "user", content: "请生成产品原型" }])
          }
        }
      } catch (err) {
        console.error("Failed to load prototype:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请生成产品原型" }])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [projectId, start])

  // Generate prototype for the first time
  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请生成产品原型" }], { excludedContext })
  }, [start, excludedContext])

  // Open HTML file in system browser
  const handleOpenInBrowser = useCallback(async () => {
    if (!outputDir) return
    const filePath = `${outputDir}/${PROTOTYPE_FILE}`
    try {
      await open(filePath)
    } catch (err) {
      console.error("Failed to open in browser:", err)
    }
  }, [outputDir])

  // Regenerate prototype
  const handleRegenerate = useCallback(() => {
    reset()
    setExistingHtml(null)
    setBlobUrl(null)
    startedRef.current = true
    start([{ role: "user", content: "请重新生成产品原型" }], { excludedContext })
  }, [reset, start, excludedContext])

  // Confirm and advance to review
  const handleAdvance = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    try {
      if (!existingHtml && text) {
        await api.saveProjectFile({ projectId, fileName: PROTOTYPE_FILE, content: text })
      }
      await api.updatePhase({
        projectId,
        phase: "prototype",
        status: "completed",
        outputFile: outputFile ?? PROTOTYPE_FILE,
      })
      await api.advancePhase(projectId)
      navigate(`/project/${projectId}/review?autostart=1`)
    } catch (err) {
      console.error("Failed to advance:", err)
      setAdvancing(false)
    }
  }, [projectId, existingHtml, text, outputFile, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中···</span>
      </div>
    )
  }

  if (!loading && !existingHtml && !text && !isStreaming && !error) {
    return (
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">原型设计</h1>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <PhaseEmptyState
          phaseLabel="PROTOTYPE"
          description="交互原型"
          onGenerate={handleGenerate}
        />
      </div>
    )
  }

  const hasContent = !!htmlContent
  const canAdvance = hasContent && !isStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[900px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">原型设计</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={isStreaming}>
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

      {/* Streaming progress */}
      {isStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {isThinking
            ? <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">正在思考···</p>
            : extractStreamStatus(text)
              ? <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{extractStreamStatus(text)}</p>
              : null
          }
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            正在生成原型...{text.length > 0 && ` (${text.length} 字节)`}
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleRegenerate} className="mt-2">重试</Button>
        </div>
      )}

      {/* Prototype preview iframe */}
      {blobUrl && (
        <div className="mt-6 border border-[var(--border)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4 py-2">
            <div className="flex items-center gap-1">
              {(["mobile", "tablet", "desktop"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={cn(
                    "px-2.5 py-1 text-[12px] font-medium transition-colors",
                    device === d
                      ? "bg-[var(--yellow)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {d === "mobile" ? "375" : d === "tablet" ? "768" : "全屏"}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={handleOpenInBrowser} disabled={!outputDir} className="gap-1.5 text-xs">
              <ExternalLink className="size-3" />
              在浏览器中打开
            </Button>
          </div>
          {/* iframe container */}
          <div className="flex justify-center bg-[var(--secondary)]/30 py-4">
            <iframe
              src={blobUrl}
              style={
                device === "desktop"
                  ? { width: "100%", height: 680, border: "none" }
                  : { width: DEVICE_WIDTHS[device], height: 680, border: "none", boxShadow: "0 0 0 1px var(--border)" }
              }
              sandbox="allow-scripts allow-same-origin"
              title="原型预览"
            />
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/project/${projectId}/analytics`)}
          disabled={isStreaming || advancing}
        >
          {PHASE_META.prototype.backLabel}
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button variant="primary" onClick={handleAdvance} disabled={!canAdvance}>
            {advancing ? "正在推进..." : PHASE_META.prototype.nextLabel + " →"}
          </Button>
          {!advancing && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.prototype.nextDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
