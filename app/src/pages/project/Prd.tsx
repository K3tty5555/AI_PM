import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { PrdToc, slugify } from "@/components/prd-toc"
import { useAiStream } from "@/hooks/use-ai-stream"
import { useProgressiveReveal } from "@/hooks/use-progressive-reveal"
import { RevealContainer } from "@/components/RevealContainer"
import { api, type PrdStyleEntry } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { StreamProgress } from "@/components/StreamProgress"
import { cn, extractStreamStatus, FILE_MANAGER_LABEL } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { PhaseShell } from "@/components/phase-shell"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"
import { KnowledgeRecommendPanel } from "@/components/knowledge-recommend-panel"
import { PrdDiffViewer } from "@/components/PrdDiffViewer"
import { PrdScoreBadge, PrdScorePanel } from "@/components/prd-score-panel"
import { PrdAssistPanel } from "@/components/prd-assist-panel"
import { consumeAdoptionQueue } from "@/components/review-grouped-view"
import { ExportPreflightDialog } from "@/components/export-preflight-dialog"
import { useExportPipeline } from "@/hooks/use-export-pipeline"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function prdFile(version: number) {
  return `05-prd/05-PRD-v${version}.0.md`
}

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
// Mermaid detection helpers — imported from @/lib/mermaid-utils

// ---------------------------------------------------------------------------
// Export dropdown
// ---------------------------------------------------------------------------

function ExportDropdown({
  onCopyMd,
  copied,
  onPrint,
  onExportDocx,
  onExportShareHtml,
  exporting,
}: {
  onCopyMd: () => void
  copied: boolean
  onPrint: () => void
  onExportDocx: () => void
  onExportShareHtml: () => void
  exporting: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleItem = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
        className="gap-1"
      >
        {exporting ? "导出中..." : "导出"}
        <ChevronDown className="size-3" strokeWidth={2} />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50",
            "w-44 rounded-lg border border-[var(--border)] bg-[var(--background)]",
            "shadow-[var(--shadow-lg)] py-1",
          )}
          style={{ animation: "fadeInUp 120ms var(--ease-decelerate)" }}
        >
          <button
            onClick={() => handleItem(onCopyMd)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            {copied ? "已复制 \u2713" : "复制 Markdown"}
          </button>
          <button
            onClick={() => handleItem(onPrint)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            打印 / PDF
          </button>
          <button
            onClick={() => handleItem(onExportDocx)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            导出 DOCX
          </button>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            onClick={() => handleItem(onExportShareHtml)}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            生成分享页
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function PrdPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string
  const { toast } = useToast()

  // Page state
  const [loading, setLoading] = useState(true)
  const [existingMarkdown, setExistingMarkdown] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | undefined>()
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedMarkdown, setEditedMarkdown] = useState<string | null>(null)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const [reviewContent, setReviewContent] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // PRD style selector
  const [prdStyles, setPrdStyles] = useState<PrdStyleEntry[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string>("")

  // Version management
  const [currentVersion, setCurrentVersion] = useState(1)
  const [versions, setVersions] = useState<number[]>([1])

  // Diff view
  const [diffMode, setDiffMode] = useState(false)
  const [diffOldText, setDiffOldText] = useState("")
  const [diffNewText, setDiffNewText] = useState("")
  const [diffOldVer, setDiffOldVer] = useState(1)
  const [diffNewVer, setDiffNewVer] = useState(2)

  // Score state
  const [scoreData, setScoreData] = useState<{ dimensions: { name: string; score: number; comment: string; suggestion: string }[]; totalScore: number } | null>(null)
  const [scoreLoading, setScoreLoading] = useState(false)
  const [scoreStale, setScoreStale] = useState(false)
  const [scorePanelOpen, setScorePanelOpen] = useState(false)
  const scoreCheckedRef = useRef(false)

  // AI assist input
  const [assistInput, setAssistInput] = useState("")
  const [isAssistStreaming, setIsAssistStreaming] = useState(false)
  const [pendingAssistText, setPendingAssistText] = useState<string | null>(null)

  // Consume review adoption queue
  useEffect(() => {
    const queue = consumeAdoptionQueue()
    if (queue.length > 0) {
      setAssistInput(queue.join("；"))
    }
  }, [])

  // Prevent double-start in StrictMode
  const startedRef = useRef(false)

  // Ref for the content scroll container
  const contentRef = useRef<HTMLDivElement>(null)

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"
  const fromYolo = searchParams.get("yolo") === "1"

  // AI stream hook for initial generation
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, toolStatus, error, start, reset } = useAiStream({
    projectId,
    phase: "prd",
  })

  // AI stream hook for assist modifications (uses distinct phase key to avoid
  // colliding with the primary "prd" stream in bgStore)
  const {
    text: assistText,
    isStreaming: assistStreaming,
    error: assistError,
    start: _assistStart,
    reset: assistReset,
  } = useAiStream({
    projectId,
    phase: "prd-assist",
  })

  // Auto-score when PRD generation completes
  useEffect(() => {
    if (isStreaming || !text || scoreCheckedRef.current) return
    scoreCheckedRef.current = true
    setScoreLoading(true)
    api.scorePrd(projectId).then((data) => {
      setScoreData(data)
      setScoreStale(false)
    }).catch((err) => console.error("[Prd] scorePrd:", err))
      .finally(() => setScoreLoading(false))
  }, [isStreaming, text, projectId])

  // Track assist streaming state
  useEffect(() => {
    setIsAssistStreaming(assistStreaming)
  }, [assistStreaming])

  // When assist finishes, stage the result for user confirmation
  useEffect(() => {
    if (!assistStreaming && assistText) {
      setPendingAssistText(assistText)
    }
  }, [assistStreaming, assistText])

  // The final markdown to display
  const displayMarkdown = useMemo(() => {
    if (editedMarkdown) return editedMarkdown
    if (existingMarkdown) return existingMarkdown
    return text
  }, [editedMarkdown, existingMarkdown, text])

  // Unified export pipeline
  const exportPipeline = useExportPipeline(projectId, displayMarkdown)

  // Progress estimation during streaming
  const currentStreaming = isStreaming || isAssistStreaming
  const streamText = isAssistStreaming ? assistText : text

  const { visibleText, isRevealing, revealedCount, totalCount, skipReveal } = useProgressiveReveal({
    text: displayMarkdown || "",
    isStreaming: currentStreaming,
  })
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
  // Load PRD styles on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    Promise.all([api.listPrdStyles(), api.getActivePrdStyle()]).then(([styles, active]) => {
      setPrdStyles(styles)
      setSelectedStyle(active ?? "")
    }).catch((err) => console.error("[Prd]", err))
  }, [])

  // -------------------------------------------------------------------------
  // Load existing PRD on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      // Check for review report (non-blocking)
      api.readProjectFile(projectId, "08-review-report.md").then((r) => {
        if (!cancelled && r) setReviewContent(r)
      }).catch((err) => console.error("[Prd]", err))

      // Load versions
      api.listPrdVersions(projectId).then((vers) => {
        if (!cancelled && vers.length > 0) {
          setVersions(vers)
          setCurrentVersion(vers[vers.length - 1])
        }
      }).catch(() => {})

      try {
        // Load latest version
        const latestVer = await api.getLatestPrdVersion(projectId)
        const content = await api.readProjectFile(projectId, prdFile(latestVer))
        if (!cancelled) {
          setCurrentVersion(latestVer)
          if (content) {
            setExistingMarkdown(content)
          } else if (autostart) {
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
    start([{ role: "user", content: "请生成 PRD" }], {
      excludedContext,
      styleId: selectedStyle || undefined,
    })
  }, [start, excludedContext, selectedStyle])

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

  /** Save PRD and go back */
  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/stories`)
  }, [navigate, projectId])

  const handleCopyMarkdown = useCallback(() => {
    if (displayMarkdown) {
      navigator.clipboard.writeText(displayMarkdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [displayMarkdown])

  // Export actions via pipeline
  const handleExportDocx = useCallback(() => {
    exportPipeline.startExport(async () => {
      const path = await api.exportPrdDocx(projectId)
      return { path }
    })
  }, [projectId, exportPipeline])

  const handleExportShareHtml = useCallback(() => {
    exportPipeline.startExport(async () => {
      const path = await api.exportPrdShareHtml(projectId)
      toast("分享页已生成", "success")
      return { path }
    })
  }, [projectId, exportPipeline, toast])

  /** Save PRD & mark phase complete */
  const handleComplete = useCallback(async () => {
    if (!projectId || !displayMarkdown) return
    setAdvancing(true)
    setSaving(true)

    try {
      // Save PRD file
      await api.saveProjectFile({
        projectId,
        fileName: prdFile(currentVersion),
        content: displayMarkdown,
      })
      setSaving(false)

      // Advance to next phase (advancePhase marks current phase as completed)
      await api.advancePhase(projectId)
      invalidateProject(projectId)

      navigate(`/project/${projectId}/analytics?autostart=1`)
    } catch (err) {
      console.error("Failed to complete PRD:", err)
      toast("完成 PRD 失败，请重试", "error")
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, displayMarkdown, navigate])

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
      <PhaseShell
        projectId={projectId}
        phase="prd"
        phaseLabel="PRD"
        brainstormEnabled={true}
        onBrainstormGenerate={handleGenerate}
      >
        <div className="mx-auto w-full max-w-[1080px]">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">PRD 撰写</h1>
          </div>
          <div className="h-px bg-[var(--border)]" />
          {fromYolo && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
              <span className="mt-0.5 shrink-0 text-[var(--accent-color)]">⚡</span>
              <p className="text-[13px] text-[var(--text-secondary)]">
                加急模式已完成前 4 阶段（需求分析、竞品研究、用户故事）。确认内容无误后点击生成 PRD。
              </p>
            </div>
          )}
          <ContextPills
            projectId={projectId!}
            onExcludeChange={setExcludedContext}
            className="border-b border-[var(--border)]"
          />
          <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
          {prdStyles.length > 0 && (
            <div className="flex items-center gap-2 px-1 py-3 border-b border-[var(--border)]">
              <span className="text-xs text-[var(--text-secondary)] shrink-0">写作风格</span>
              <select
                value={selectedStyle}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedStyle(val)
                  if (val) api.setActivePrdStyle(val).catch((err) => console.error("[Prd]", err))
                }}
                className={cn(
                  "h-7 px-2 text-xs rounded-lg",
                  "bg-[var(--secondary)] border border-[var(--border)]",
                  "text-[var(--text-primary)]",
                  "outline-none cursor-pointer",
                  "hover:border-[var(--accent-color)]/60 transition-colors",
                  "focus:border-[var(--accent-color)]",
                )}
              >
                <option value="">（无）</option>
                {prdStyles.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <KnowledgeRecommendPanel projectId={projectId!} timing="before_prd" visible={!existingMarkdown} />
          <PhaseEmptyState
            phaseLabel="PRD"
            description="产品需求文档"
            onGenerate={handleGenerate}
          />
          {/* Direct generation shortcut */}
          <div className="mt-3 text-center">
            <button
              onClick={handleGenerate}
              className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline underline-offset-2 transition-colors"
            >
              跳过分析，直接生成 PRD
            </button>
          </div>
        </div>
      </PhaseShell>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasContent = !!displayMarkdown
  const canComplete = hasContent && !currentStreaming && !advancing

  return (
    <PhaseShell
      projectId={projectId}
      phase="prd"
      phaseLabel="PRD"
      brainstormEnabled={true}
      onBrainstormGenerate={handleGenerate}
    >
    <div className="mx-auto w-full max-w-[1080px]">
      {/* Header */}
      <div className="prd-header mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">PRD 撰写</h1>
          {versions.length > 0 && (
            <span className="text-[13px] text-[var(--text-secondary)]">·</span>
          )}
          {versions.length <= 1 ? (
            <span className="text-[13px] text-[var(--text-secondary)]">v{currentVersion}.0</span>
          ) : (
            <select
              value={currentVersion}
              onChange={(e) => {
                const ver = Number(e.target.value)
                setCurrentVersion(ver)
                setEditedMarkdown(null)
                setExistingMarkdown(null)
                setLoading(true)
                api.readProjectFile(projectId, prdFile(ver)).then((content) => {
                  setExistingMarkdown(content)
                }).finally(() => setLoading(false))
              }}
              className="text-[13px] text-[var(--accent-color)] bg-transparent border-none outline-none cursor-pointer font-medium"
            >
              {versions.map((v) => (
                <option key={v} value={v}>v{v}.0</option>
              ))}
            </select>
          )}
          {hasContent && (
            <PrdScoreBadge
              score={scoreData?.totalScore ?? null}
              loading={scoreLoading}
              stale={scoreStale}
              onClick={() => {
                if (scoreStale) {
                  setScoreLoading(true)
                  api.scorePrd(projectId).then((data) => { setScoreData(data); setScoreStale(false) })
                    .catch((err) => console.error("[Prd] scorePrd:", err))
                    .finally(() => setScoreLoading(false))
                } else {
                  setScorePanelOpen((v) => !v)
                }
              }}
            />
          )}
        </div>
        <div className="prd-actions flex items-center gap-1">
          {hasContent && !currentStreaming && (
            <>
              <ExportDropdown
                onCopyMd={handleCopyMarkdown}
                copied={copied}
                onPrint={() => window.print()}
                onExportDocx={handleExportDocx}
                onExportShareHtml={handleExportShareHtml}
                exporting={exportPipeline.exporting}
              />
              {versions.length >= 2 && (
                <Button
                  variant={diffMode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={async () => {
                    if (diffMode) {
                      setDiffMode(false)
                      return
                    }
                    const oldVer = versions[versions.length - 2]
                    const newVer = versions[versions.length - 1]
                    const [oldContent, newContent] = await Promise.all([
                      api.readProjectFile(projectId, prdFile(oldVer)),
                      api.readProjectFile(projectId, prdFile(newVer)),
                    ])
                    setDiffOldVer(oldVer)
                    setDiffNewVer(newVer)
                    setDiffOldText(oldContent || "")
                    setDiffNewText(newContent || "")
                    setDiffMode(true)
                  }}
                >
                  {diffMode ? "退出对比" : "对比"}
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={currentStreaming}
          >
            &#x21bb; 重新生成
          </Button>
        </div>
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Score panel */}
      {scorePanelOpen && scoreData && (
        <div className="mt-4">
          <PrdScorePanel
            dimensions={scoreData.dimensions}
            totalScore={scoreData.totalScore}
            onSendSuggestions={(suggestions) => {
              setAssistInput(suggestions.join("；"))
              setScorePanelOpen(false)
            }}
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
      {currentStreaming && (
        <div className="mt-4">
          <ProgressBar value={progressValue} animated />
          {(() => {
            const status = !isThinking ? extractStreamStatus(streamText) : ""
            return isThinking
              ? <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">思考中...</p>
              : status
                ? <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{status}</p>
                : null
          })()}
          <StreamProgress isStreaming={currentStreaming} isThinking={isThinking} elapsedSeconds={elapsedSeconds} streamMeta={streamMeta} toolStatus={toolStatus} />
        </div>
      )}

      {/* Error display */}
      {(error || assistError) && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
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

      {/* Export result */}
      {exportPipeline.exportResult && (
        "error" in exportPipeline.exportResult ? (() => {
          const err = exportPipeline.exportResult.error
          const needsDep =
            err.includes("python3") ||
            err.includes("python-docx") ||
            err.includes("pip3")
          return (
            <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-[var(--destructive)]">{err}</p>
                {needsDep && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 px-2 text-xs text-[var(--accent-color)]"
                    onClick={() => navigate("/settings")}
                  >
                    前往设置安装
                  </Button>
                )}
              </div>
              <button onClick={() => exportPipeline.reset()} className="mt-1 text-[12px] text-[var(--text-tertiary)] hover:opacity-70">关闭</button>
            </div>
          )
        })() : (() => {
          const result = exportPipeline.exportResult as { path: string }
          return (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--success)]" />
            <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
              已导出：{result.path}
            </p>
            <button
              onClick={() => api.revealFile(result.path)}
              className="shrink-0 text-[13px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
            >
              在 {FILE_MANAGER_LABEL} 中显示
            </button>
            <button onClick={() => exportPipeline.reset()} className="shrink-0 text-[12px] text-[var(--text-tertiary)] hover:opacity-70" aria-label="关闭">×</button>
          </div>
          )
        })()
      )}

      {/* AI assist confirmation banner (legacy — kept for regenerate flow) */}
      {pendingAssistText && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--accent-color)] bg-[var(--accent-light)] px-4 py-3 animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">AI 已生成修改建议</span>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => {
                setEditedMarkdown(pendingAssistText)
                setScoreStale(true)
                api.saveProjectFile({ projectId, fileName: prdFile(currentVersion), content: pendingAssistText }).catch(() => {})
                toast("修改已应用", "success")
                setPendingAssistText(null)
              }}>应用修改</Button>
              <Button variant="ghost" size="sm" onClick={() => { setPendingAssistText(null); toast("已放弃修改", "info") }}>放弃</Button>
            </div>
          </div>
        </div>
      )}

      {/* Diff view */}
      {diffMode && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">对比版本：</span>
            <select
              value={diffOldVer}
              onChange={async (e) => {
                const v = Number(e.target.value)
                setDiffOldVer(v)
                const content = await api.readProjectFile(projectId, prdFile(v))
                setDiffOldText(content || "")
              }}
              className="text-xs bg-transparent border border-[var(--border)] rounded px-1.5 py-0.5 outline-none"
            >
              {versions.map((v) => <option key={v} value={v}>v{v}.0</option>)}
            </select>
            <span className="text-xs text-[var(--text-tertiary)]">→</span>
            <select
              value={diffNewVer}
              onChange={async (e) => {
                const v = Number(e.target.value)
                setDiffNewVer(v)
                const content = await api.readProjectFile(projectId, prdFile(v))
                setDiffNewText(content || "")
              }}
              className="text-xs bg-transparent border border-[var(--border)] rounded px-1.5 py-0.5 outline-none"
            >
              {versions.map((v) => <option key={v} value={v}>v{v}.0</option>)}
            </select>
          </div>
          <PrdDiffViewer
            oldText={diffOldText}
            newText={diffNewText}
            oldLabel={`v${diffOldVer}.0`}
            newLabel={`v${diffNewVer}.0`}
          />
        </div>
      )}

      {/* Main content: two-column layout */}
      {!diffMode && (
      <div className="mt-6 flex gap-6">
        {/* Left: PRD content */}
        <div
          ref={contentRef}
          className="prd-content min-w-0 flex-1 overflow-y-auto"
        >
          <RevealContainer isRevealing={isRevealing} revealedCount={revealedCount} totalCount={totalCount} onSkip={skipReveal}>
            <PrdViewer
              markdown={visibleText}
              isStreaming={currentStreaming}
              onEdit={handleEdit}
            />
          </RevealContainer>
          {!currentStreaming && <StreamProgress isStreaming={false} isThinking={false} elapsedSeconds={0} streamMeta={streamMeta} />}
        </div>

        {/* Right: TOC navigation */}
        {hasContent && sectionIds.length > 0 && (
          <div className="prd-toc hidden lg:block w-[220px] shrink-0">
            <PrdToc
              markdown={displayMarkdown || ""}
              activeSection={activeSection}
              onSectionClick={handleSectionClick}
            />
          </div>
        )}
      </div>
      )}

      {/* AI Assist panel */}
      {hasContent && !currentStreaming && (
        <PrdAssistPanel
          projectId={projectId}
          currentMarkdown={displayMarkdown || ""}
          onApply={(newMd) => {
            setEditedMarkdown(newMd)
            setScoreStale(true)
            api.saveProjectFile({ projectId, fileName: prdFile(currentVersion), content: newMd }).catch(() => {})
          }}
          initialInput={assistInput}
        />
      )}

      {/* Bottom action bar */}
      <div
        className={cn(
          "prd-footer",
          "mt-8 flex items-center justify-between",
          "border-t border-[var(--border)] pt-6",
        )}
      >
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={currentStreaming || advancing}
        >
          {PHASE_META.prd.backLabel}
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
                ? "完成中..."
                : PHASE_META.prd.nextLabel + " →"}
          </Button>
          {!advancing && !saving && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.prd.nextDescription}
            </p>
          )}
        </div>
      </div>

      {/* Unified export preflight dialog */}
      <ExportPreflightDialog
        open={exportPipeline.preflightOpen}
        sensitiveMatches={exportPipeline.sensitiveMatches}
        placeholderMatches={exportPipeline.placeholderMatches}
        mermaidBlocks={exportPipeline.mermaidBlocks}
        onExport={exportPipeline.confirmPreflight}
        onCancel={exportPipeline.cancel}
      />
    </div>
    </PhaseShell>
  )
}
