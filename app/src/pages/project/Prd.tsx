import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdIllustrationDialog, getIllustrationSkipKey } from "@/components/prd-illustration-dialog"
import { ArrowRight, Check, Copy, ShieldCheck, Sparkles, X } from "lucide-react"
import { PrdViewer } from "@/components/prd-viewer"
import { PrdToc, slugify } from "@/components/prd-toc"
import { useAiStream } from "@/hooks/use-ai-stream"
import { useToolStream } from "@/hooks/use-tool-stream"
import { useProgressiveReveal } from "@/hooks/use-progressive-reveal"
import { RevealContainer } from "@/components/RevealContainer"
import { api, type PrdStyleEntry } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { StreamProgress } from "@/components/StreamProgress"
import { cn, extractStreamStatus } from "@/lib/utils"
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
import { SamplePrdDialog } from "@/components/sample-prd-dialog"
import { useExportPipeline } from "@/hooks/use-export-pipeline"
import { PreflightCard } from "@/components/preflight-card"
import { ExportDropdown } from "@/components/prd-toolbar"
import { PrdExportResult } from "@/components/prd-export-result"
import { PdfCoverDialog } from "@/components/pdf-cover-dialog"
import { DocxRecipeDialog } from "@/components/docx-recipe-dialog"

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

type PmLintSeverity = "critical" | "warning" | "pass"
type PmLintStatus = "pending" | "sent" | "dismissed"

interface PmLintIssue {
  id: string
  severity: PmLintSeverity
  content: string
}

function hashText(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return String(Math.abs(hash))
}

function parsePmLintIssues(markdown: string): PmLintIssue[] {
  const issues: PmLintIssue[] = []
  let severity: PmLintSeverity | null = null

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue

    if (/^(#{1,4}\s*)?(❌|必修|越界|Critical|严重)/i.test(line)) {
      severity = "critical"
      continue
    }
    if (/^(#{1,4}\s*)?(⚠️|建议|缺失|Major|Minor|补齐)/i.test(line)) {
      severity = "warning"
      continue
    }
    if (/^(#{1,4}\s*)?(✅|通过)/i.test(line)) {
      severity = "pass"
      continue
    }

    if (!severity || severity === "pass") continue

    const isIssueLine =
      /^([-*]|\d+\.)\s+/.test(line) ||
      /^L\d+[:：]/i.test(line) ||
      /^####\s+/.test(line) ||
      /^\[[ x]\]\s+/i.test(line)

    if (!isIssueLine) continue

    const content = line
      .replace(/^####\s+/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^\[[ x]\]\s+/i, "")
      .trim()

    if (content.length < 6) continue
    issues.push({
      id: hashText(`${severity}:${content}`),
      severity,
      content,
    })
  }

  const dedup = new Map<string, PmLintIssue>()
  for (const issue of issues) dedup.set(issue.id, issue)
  return Array.from(dedup.values())
}

// ---------------------------------------------------------------------------
// Mermaid detection helpers — imported from @/lib/mermaid-utils

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
  const [pmLintOpen, setPmLintOpen] = useState(false)
  const [pmLintStatuses, setPmLintStatuses] = useState<Record<string, PmLintStatus>>({})
  const [assistInputVersion, setAssistInputVersion] = useState(0)

  // Sample PRD dialog
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false)

  // AI illustration dialog + batch state
  const [illustrationDialogOpen, setIllustrationDialogOpen] = useState(false)
  const [autoIllustration, setAutoIllustration] = useState(false)
  const [batchIllustrationState, setBatchIllustrationState] = useState<{
    total: number
    done: number
    failed: Array<{ index: number; lineStart: number }>
  } | null>(null)
  const cancelledRef = useRef(false)
  // Track last completed stream text to avoid re-triggering
  const lastIllustrationTextRef = useRef<string>("")
  // Callback stored when showing illustration dialog
  const illustrationConfirmRef = useRef<((enabled: boolean) => void) | null>(null)

  // AI assist input
  const [assistInput, setAssistInput] = useState("")
  const [isAssistStreaming, setIsAssistStreaming] = useState(false)
  const [pendingAssistText, setPendingAssistText] = useState<string | null>(null)

  // Consume review adoption queue
  useEffect(() => {
    const queue = consumeAdoptionQueue()
    if (queue.length > 0) {
      setAssistInput(queue.join("；"))
      setAssistInputVersion((v) => v + 1)
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

  const {
    text: pmLintText,
    isStreaming: pmLintStreaming,
    isThinking: pmLintThinking,
    elapsedSeconds: pmLintElapsedSeconds,
    error: pmLintError,
    streamMeta: pmLintMeta,
    run: runPmLint,
    reset: resetPmLint,
  } = useToolStream("ai-pm-driver", { projectId })

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

  // -------------------------------------------------------------------------
  // Batch illustration runner (倒序处理，避免行号偏移)
  // -------------------------------------------------------------------------

  const runBatchIllustration = useCallback(async (prdPath: string, outputDir: string) => {
    let blocks: import("@/lib/tauri-api").MermaidBlock[]
    try {
      blocks = await api.scanPrdMermaid(prdPath)
    } catch (err) {
      toast(String(err), "error")
      return
    }

    if (blocks.length === 0) {
      toast("PRD 中未发现 Mermaid 流程图，跳过配图", "info")
      return
    }

    setBatchIllustrationState({ total: blocks.length, done: 0, failed: [] })

    // 倒序处理：embed 时从后往前插入，不影响前面块的行号
    const reversed = [...blocks].reverse()

    for (const block of reversed) {
      if (cancelledRef.current) break
      try {
        const imgResult = await api.generateIllustration({
          prompt: `将以下 Mermaid 流程图渲染为高清技术插图，简洁清晰，蓝白配色：\n\n${block.code}`,
          projectDir: outputDir,
        })
        // 防御性校验：跳过无效结果
        if (!imgResult?.filePath) {
          console.warn(`[Prd] illustration result missing filePath, skipping block ${block.index}`)
          setBatchIllustrationState((prev) =>
            prev ? { ...prev, failed: [...prev.failed, { index: block.index, lineStart: block.lineStart }] } : prev
          )
          continue
        }

        const filePath = imgResult.filePath
        const imgName = filePath.split("/").pop() ?? filePath
        await api.embedIllustrationInPrd({
          prdPath,
          mermaidLineStart: block.lineStart,
          imageRelativePath: `11-illustrations/${imgName}`,
          altText: `流程图 ${block.index + 1}`,
        })
        setBatchIllustrationState((prev) =>
          prev ? { ...prev, done: prev.done + 1 } : prev
        )
      } catch (err) {
        console.error("[Prd] illustration block failed:", err)
        setBatchIllustrationState((prev) =>
          prev
            ? { ...prev, failed: [...prev.failed, { index: block.index, lineStart: block.lineStart }] }
            : prev
        )
      }
    }

    // 完成后汇报并清空进度
    setBatchIllustrationState((prev) => {
      if (prev) {
        const msg = prev.failed.length > 0
          ? `配图完成 ${prev.done}/${prev.total} 张，${prev.failed.length} 张失败`
          : `已生成 ${prev.done} 张配图并嵌入 PRD`
        toast(msg, prev.failed.length > 0 ? "error" : "success")
      }
      return null
    })
  }, [])

  // Auto-illustration: trigger after main PRD stream completes
  useEffect(() => {
    if (isStreaming || !text || !autoIllustration) return
    if (text === lastIllustrationTextRef.current) return
    lastIllustrationTextRef.current = text
    // Fetch output dir then run batch
    api.getProject(projectId).then((project) => {
      if (!project) return
      const prdPath = `${project.outputDir}/${prdFile(currentVersion)}`
      cancelledRef.current = false
      runBatchIllustration(prdPath, project.outputDir)
    }).catch((err) => {
      console.error("[Prd] illustration: getProject failed", err)
    })
  }, [isStreaming, text, autoIllustration, projectId, currentVersion, runBatchIllustration])

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

  const pmLintIssues = useMemo(
    () => parsePmLintIssues(pmLintText),
    [pmLintText]
  )

  const pendingPmLintIssues = useMemo(
    () => pmLintIssues.filter((issue) => (pmLintStatuses[issue.id] ?? "pending") === "pending"),
    [pmLintIssues, pmLintStatuses]
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

  /** Core: actually start the PRD stream */
  const startPrdStream = useCallback((withIllustration: boolean) => {
    setAutoIllustration(withIllustration)
    lastIllustrationTextRef.current = ""
    startedRef.current = true
    start([{ role: "user", content: "请生成 PRD" }], {
      excludedContext,
      styleId: selectedStyle || undefined,
    })
  }, [start, excludedContext, selectedStyle])

  /** Core: actually start the PRD re-generation stream */
  const startPrdRegenStream = useCallback((withIllustration: boolean) => {
    setAutoIllustration(withIllustration)
    lastIllustrationTextRef.current = ""
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

  /** Decide whether to show illustration dialog or go straight to stream */
  const maybeShowIllustrationDialog = useCallback((onConfirm: (enabled: boolean) => void) => {
    if (localStorage.getItem(getIllustrationSkipKey(projectId))) {
      onConfirm(false)
    } else {
      // Store the callback on a ref so the Dialog's onConfirm can call it
      illustrationConfirmRef.current = onConfirm
      setIllustrationDialogOpen(true)
    }
  }, [])

  /** Generate PRD for the first time */
  const handleGenerate = useCallback(() => {
    maybeShowIllustrationDialog((enabled) => {
      setIllustrationDialogOpen(false)
      startPrdStream(enabled)
    })
  }, [maybeShowIllustrationDialog, startPrdStream])

  /** Regenerate the entire PRD */
  const handleRegenerate = useCallback(() => {
    maybeShowIllustrationDialog((enabled) => {
      setIllustrationDialogOpen(false)
      startPrdRegenStream(enabled)
    })
  }, [maybeShowIllustrationDialog, startPrdRegenStream])

  /** Called by PrdIllustrationDialog */
  const handleIllustrationConfirm = useCallback((enabled: boolean) => {
    setIllustrationDialogOpen(false)
    illustrationConfirmRef.current?.(enabled)
    illustrationConfirmRef.current = null
  }, [])

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

  const handlePmLint = useCallback(() => {
    const content = displayMarkdown?.trim()
    if (!content) {
      toast("没有可体检的 PRD 内容", "error")
      return
    }
    resetPmLint()
    setPmLintStatuses({})
    setPmLintOpen(true)
    runPmLint([
      `任务：审视下列 PRD 全文，按 PM 风格判断卡输出 punch list。`,
      `PRD 文件：${prdFile(currentVersion)}`,
      "",
      "```markdown",
      content,
      "```",
    ].join("\n"))
  }, [currentVersion, displayMarkdown, resetPmLint, runPmLint, toast])

  const sendPmLintIssuesToAssist = useCallback((issues: PmLintIssue[]) => {
    if (issues.length === 0) return
    const text = [
      "请根据 PM 体检结果修订 PRD，重点修复以下问题。保持 PRD 结构不乱改，补业务判断，不写技术实现细节：",
      "",
      ...issues.map((issue, index) => `${index + 1}. ${issue.content}`),
    ].join("\n")
    setAssistInput(text)
    setAssistInputVersion((v) => v + 1)
    setPmLintStatuses((prev) => {
      const next = { ...prev }
      for (const issue of issues) next[issue.id] = "sent"
      return next
    })
    setPmLintOpen(false)
    toast(`已发送 ${issues.length} 条问题到 AI 修订`, "success")
  }, [toast])

  const recordPmLintIssueAsInstinct = useCallback(async (issue: PmLintIssue) => {
    try {
      await api.recordInstinctCandidate({
        type: "writing",
        description: issue.content,
        sourceProject: `project:${projectId}`,
      })
      toast("已沉淀为习惯候选，可在「我的习惯」确认", "success")
    } catch (err) {
      console.error("[Prd] record instinct:", err)
      toast("习惯沉淀失败", "error")
    }
  }, [projectId, toast])

  const updatePmLintStatus = useCallback((id: string, status: PmLintStatus) => {
    setPmLintStatuses((prev) => ({ ...prev, [id]: status }))
  }, [])

  // DOCX export with recipe dialog
  const [docxRecipeDialogOpen, setDocxRecipeDialogOpen] = useState(false)

  const handleExportDocx = useCallback(() => {
    setDocxRecipeDialogOpen(true)
  }, [])

  const handleDocxRecipeConfirm = useCallback((recipe: string) => {
    setDocxRecipeDialogOpen(false)
    exportPipeline.startExport(async () => {
      const path = await api.exportPrdDocx(projectId, recipe)
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

  // PDF export with cover dialog
  const [pdfCoverDialogOpen, setPdfCoverDialogOpen] = useState(false)

  const handleExportPdf = useCallback(() => {
    setPdfCoverDialogOpen(true)
  }, [])

  const handlePdfCoverConfirm = useCallback((coverStyle: string) => {
    setPdfCoverDialogOpen(false)
    exportPipeline.startExport(async () => {
      const path = await api.exportPrdPdf(projectId, coverStyle)
      return { path }
    })
  }, [projectId, exportPipeline])

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
          <PreflightCard projectId={projectId!} phaseId="prd" className="mx-1 my-3" />
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
              <Button
                variant={pmLintOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={handlePmLint}
                disabled={pmLintStreaming}
              >
                <ShieldCheck className="size-3.5" />
                {pmLintStreaming ? "体检中" : "PM 体检"}
              </Button>
              <ExportDropdown
                onCopyMd={handleCopyMarkdown}
                copied={copied}
                onPrint={() => window.print()}
                onExportDocx={handleExportDocx}
                onExportPdf={handleExportPdf}
                onExportPptx={() => navigate(`/tools/pptx?projectId=${projectId}`)}
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
          <Button variant="ghost" size="sm" onClick={() => setSampleDialogOpen(true)}>
            参考样例
          </Button>
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
              setAssistInputVersion((v) => v + 1)
              setScorePanelOpen(false)
            }}
          />
        </div>
      )}

      {pmLintOpen && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-[var(--accent-color)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">PM 风格体检</span>
            </div>
            <button
              type="button"
              onClick={() => setPmLintOpen(false)}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              收起
            </button>
          </div>
          <div className="px-4 py-3">
            {pmLintStreaming && (
              <div className="mb-3">
                <ProgressBar value={pmLintText ? Math.min(90, Math.floor(pmLintText.length / 30)) : 12} animated />
                <StreamProgress
                  isStreaming={pmLintStreaming}
                  isThinking={pmLintThinking}
                  elapsedSeconds={pmLintElapsedSeconds}
                  streamMeta={pmLintMeta}
                />
              </div>
            )}
            {pmLintError && (
              <p className="text-sm text-[var(--destructive)]">{pmLintError}</p>
            )}
            {!pmLintError && !pmLintText && !pmLintStreaming && (
              <p className="text-sm text-[var(--text-secondary)]">点击「PM 体检」后会检查越界、缺失项和评审前风险。</p>
            )}
            {pmLintText && pmLintIssues.length > 0 && (
              <div className="mb-4 rounded-lg border border-[var(--border)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    待处理问题 {pendingPmLintIssues.length}/{pmLintIssues.length}
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => sendPmLintIssuesToAssist(pendingPmLintIssues)}
                    disabled={pendingPmLintIssues.length === 0}
                  >
                    <ArrowRight className="size-3" />
                    发送待处理到 AI 修订
                  </Button>
                </div>
                <div className="max-h-[280px] overflow-y-auto px-3 py-2">
                  <div className="space-y-2">
                    {pmLintIssues.map((issue) => {
                      const status = pmLintStatuses[issue.id] ?? "pending"
                      return (
                        <div
                          key={issue.id}
                          className={cn(
                            "flex items-start gap-2 rounded-lg px-3 py-2",
                            issue.severity === "critical" ? "bg-[var(--destructive)]/5" : "bg-[var(--secondary)]",
                            status !== "pending" && "opacity-55",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              issue.severity === "critical"
                                ? "bg-[var(--destructive)]/10 text-[var(--destructive)]"
                                : "bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]",
                            )}
                          >
                            {issue.severity === "critical" ? "必修" : "建议"}
                          </span>
                          <p
                            className={cn(
                              "min-w-0 flex-1 text-sm text-[var(--text-primary)]",
                              status === "sent" && "line-through text-[var(--text-secondary)]",
                            )}
                          >
                            {issue.content}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            {status === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => sendPmLintIssuesToAssist([issue])}
                                  className="flex size-6 items-center justify-center rounded-md text-[var(--accent-color)] hover:bg-[var(--accent-light)] transition-colors"
                                  title="发送到 AI 修订"
                                >
                                  <ArrowRight className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(issue.content)
                                    toast("已复制问题", "success")
                                  }}
                                  className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
                                  title="复制"
                                >
                                  <Copy className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => recordPmLintIssueAsInstinct(issue)}
                                  className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--accent-color)] transition-colors"
                                  title="沉淀为习惯候选"
                                >
                                  <Sparkles className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updatePmLintStatus(issue.id, "dismissed")}
                                  className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
                                  title="忽略"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updatePmLintStatus(issue.id, "pending")}
                                className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
                                title="恢复待处理"
                              >
                                <Check className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {pmLintText && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                  查看完整体检报告
                </summary>
                <div className="mt-3 max-h-[520px] overflow-y-auto">
                  <PrdViewer markdown={pmLintText} isStreaming={pmLintStreaming} />
                </div>
              </details>
            )}
          </div>
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

      {/* 批量配图进度条 */}
      {batchIllustrationState && (
        <div className="mt-4 px-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
            <span className="flex items-center gap-1">
              <Sparkles className="size-3 text-[var(--accent-color)]" />
              AI 配图中 {batchIllustrationState.done}/{batchIllustrationState.total}
            </span>
            <button
              onClick={() => { cancelledRef.current = true }}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              取消
            </button>
          </div>
          <ProgressBar
            value={Math.round((batchIllustrationState.done / batchIllustrationState.total) * 100)}
            animated
          />
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
      <PrdExportResult result={exportPipeline.exportResult} onReset={exportPipeline.reset} />

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
          initialInputVersion={assistInputVersion}
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

      {/* PDF cover selection dialog */}
      <PdfCoverDialog
        open={pdfCoverDialogOpen}
        onConfirm={handlePdfCoverConfirm}
        onCancel={() => setPdfCoverDialogOpen(false)}
      />

      {/* DOCX recipe selection dialog */}
      <DocxRecipeDialog
        open={docxRecipeDialogOpen}
        onConfirm={handleDocxRecipeConfirm}
        onCancel={() => setDocxRecipeDialogOpen(false)}
      />

      {/* Sample PRD reference dialog */}
      <SamplePrdDialog open={sampleDialogOpen} onClose={() => setSampleDialogOpen(false)} />

      {/* PRD AI 配图确认 Dialog */}
      <PrdIllustrationDialog
        open={illustrationDialogOpen}
        projectId={projectId}
        onConfirm={handleIllustrationConfirm}
      />
    </div>
    </PhaseShell>
  )
}
