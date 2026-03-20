import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { PrdToc, slugify } from "@/components/prd-toc"
import { useAiStream } from "@/hooks/use-ai-stream"
import { api, type PrdStyleEntry, type KnowledgeEntry } from "@/lib/tauri-api"
import { cn, extractStreamStatus, FILE_MANAGER_LABEL } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"

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
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{ path: string } | { error: string } | null>(null)

  // PRD style selector
  const [prdStyles, setPrdStyles] = useState<PrdStyleEntry[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string>("")

  // Knowledge recommendation (empty state only)
  const [projectName, setProjectName] = useState<string>("")
  const [relevantKnowledge, setRelevantKnowledge] = useState<KnowledgeEntry[]>([])
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false)

  // AI assist input
  const [assistInput, setAssistInput] = useState("")
  const [isAssistStreaming, setIsAssistStreaming] = useState(false)

  // Prevent double-start in StrictMode
  const startedRef = useRef(false)

  // Ref for the content scroll container
  const contentRef = useRef<HTMLDivElement>(null)

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"
  const fromYolo = searchParams.get("yolo") === "1"

  // AI stream hook for initial generation
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, start, reset } = useAiStream({
    projectId,
    phase: "prd",
  })

  // AI stream hook for assist modifications (uses distinct phase key to avoid
  // colliding with the primary "prd" stream in bgStore)
  const {
    text: assistText,
    isStreaming: assistStreaming,
    error: assistError,
    start: assistStart,
    reset: assistReset,
  } = useAiStream({
    projectId,
    phase: "prd-assist",
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
  // Load PRD styles on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    Promise.all([api.listPrdStyles(), api.getActivePrdStyle()]).then(([styles, active]) => {
      setPrdStyles(styles)
      setSelectedStyle(active ?? "")
    }).catch((err) => console.error("[Prd]", err))
  }, [])

  // Load project name for knowledge recommendation
  useEffect(() => {
    if (!projectId) return
    api.getProject(projectId).then((project) => {
      if (project) setProjectName(project.name)
    }).catch((err) => console.error("[Prd]", err))
  }, [projectId])

  // Fetch relevant knowledge for empty state recommendation
  useEffect(() => {
    if (!projectName || existingMarkdown) return
    api.searchKnowledge(projectName).then((entries) => {
      if (entries.length > 0) setRelevantKnowledge(entries.slice(0, 3))
    }).catch((err) => console.error("[Prd]", err))
  }, [projectName, existingMarkdown])

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

  const handleCopyMarkdown = useCallback(() => {
    if (displayMarkdown) {
      navigator.clipboard.writeText(displayMarkdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [displayMarkdown])

  const handleExportDocx = useCallback(async () => {
    setExporting(true)
    setExportResult(null)
    try {
      const path = await api.exportPrdDocx(projectId)
      setExportResult({ path })
    } catch (err) {
      setExportResult({ error: typeof err === "string" ? err : String(err) })
    } finally {
      setExporting(false)
    }
  }, [projectId])

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

      // Advance to next phase (advancePhase marks current phase as completed)
      await api.advancePhase(projectId)
      invalidateProject(projectId)

      navigate(`/project/${projectId}/analytics?autostart=1`)
    } catch (err) {
      console.error("Failed to complete PRD:", err)
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
        <span className="text-sm text-[var(--text-tertiary)]">加载中···</span>
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
                "h-7 px-2 text-xs rounded",
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
            ⚡ 跳过分析，直接生成 PRD
          </button>
        </div>
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasContent = !!displayMarkdown
  const canComplete = hasContent && !currentStreaming && !advancing

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      {/* Header */}
      <div className="prd-header mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">PRD 撰写</h1>
        </div>
        <div className="prd-actions flex items-center gap-1">
          {hasContent && !currentStreaming && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCopyMarkdown} disabled={copied} title="复制 Markdown 源文本">
                {copied ? "已复制 ✓" : "复制 MD"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.print()} title="打印或存储为 PDF">
                打印 / PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportDocx}
                disabled={exporting}
                title="导出为 Word / DOCX 格式"
              >
                {exporting ? "导出中..." : "导出 DOCX"}
              </Button>
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

      {/* DOCX export result */}
      {exportResult && (
        "error" in exportResult ? (() => {
          const err = exportResult.error
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
              <button onClick={() => setExportResult(null)} className="mt-1 text-[12px] text-[var(--text-tertiary)] hover:opacity-70">关闭</button>
            </div>
          )
        })() : (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--success)]" />
            <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
              DOCX 已导出：{exportResult.path}
            </p>
            <button
              onClick={() => api.revealFile(exportResult.path)}
              className="shrink-0 text-[13px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
            >
              在 {FILE_MANAGER_LABEL} 中显示
            </button>
            <button onClick={() => setExportResult(null)} className="shrink-0 text-[12px] text-[var(--text-tertiary)] hover:opacity-70">×</button>
          </div>
        )
      )}

      {/* Main content: two-column layout */}
      <div className="mt-6 flex gap-6">
        {/* Left: PRD content */}
        <div
          ref={contentRef}
          className="prd-content min-w-0 flex-1 overflow-y-auto"
        >
          <PrdViewer
            markdown={displayMarkdown || ""}
            isStreaming={currentStreaming}
            onEdit={handleEdit}
          />
          {!currentStreaming && streamMeta !== null && (
            <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null && streamMeta.outputTokens != null
                ? `API 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
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

      {/* AI Assist input */}
      {hasContent && !currentStreaming && (
        <div
          className={cn(
            "prd-assist",
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
                "placeholder:text-[var(--text-secondary)]",
                "outline-none",
                "transition-[border-color] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
                "focus:border-[var(--accent-color)]",
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
                ? "正在完成..."
                : PHASE_META.prd.nextLabel + " →"}
          </Button>
          {!advancing && !saving && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.prd.nextDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
