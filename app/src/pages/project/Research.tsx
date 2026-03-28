import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { InlineChat } from "@/components/inline-chat"
import { useAiStream } from "@/hooks/use-ai-stream"
import { useProgressiveReveal } from "@/hooks/use-progressive-reveal"
import { RevealContainer } from "@/components/RevealContainer"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"
import { api, type ScreenshotAnalysisMode, ANALYSIS_MODE_META } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { StreamProgress } from "@/components/StreamProgress"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"
import { SegmentedControl } from "@/components/ui/segmented-control"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: string
  content: string
}

interface ChatRound {
  question: string
  answer: string
}

// ---------------------------------------------------------------------------
// Question detection
// ---------------------------------------------------------------------------

function detectQuestion(text: string): {
  hasQuestion: boolean
  question: string
  options: string[]
} {
  const questionMatch = text.match(
    /\[QUESTION\]\s*([\s\S]*?)(?:\[\/QUESTION\]|\[OPTIONS\]|$)/
  )
  if (questionMatch) {
    const question = questionMatch[1].trim()
    const optionsMatch = text.match(
      /\[OPTIONS\]\s*([\s\S]*?)(?:\[\/OPTIONS\]|$)/
    )
    const options: string[] = []
    if (optionsMatch) {
      const optionLines = optionsMatch[1]
        .split("\n")
        .map((l) => l.replace(/^[-*\d.)\]]+\s*/, "").trim())
        .filter(Boolean)
      options.push(...optionLines)
    }
    return { hasQuestion: true, question, options }
  }

  const paragraphs = text.split(/\n\n+/)
  const lastParagraphs = paragraphs.slice(-3)
  for (let i = lastParagraphs.length - 1; i >= 0; i--) {
    const p = lastParagraphs[i].trim()
    if (p.endsWith("？") || p.endsWith("?")) {
      const sentences = p.split(/(?<=[。？?！!；;])\s*/)
      const lastQuestion = sentences
        .filter((s) => s.endsWith("？") || s.endsWith("?"))
        .pop()
      return {
        hasQuestion: true,
        question: lastQuestion || p,
        options: [],
      }
    }
  }

  return { hasQuestion: false, question: "", options: [] }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UrlEntry {
  url: string
  status: "idle" | "loading" | "success" | "error"
  error?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESEARCH_FILE = "03-competitor-report.md"

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ResearchPage() {
  const params = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const projectId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<ChatRound[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const [isApiMode, setIsApiMode] = useState(false)
  const [hasPlaywrightMcp, setHasPlaywrightMcp] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [urls, setUrls] = useState<UrlEntry[]>([])
  const [fetchingUrls, setFetchingUrls] = useState(false)

  useEffect(() => {
    api.getConfig().then(cfg => {
      const apiMode = cfg.backend === "api"
      setIsApiMode(apiMode)
      if (!apiMode) {
        api.checkPlaywrightMcp().then(setHasPlaywrightMcp).catch((err) => console.error("[Research]", err))
      }
    }).catch((err) => console.error("[Research]", err))
  }, [])

  const startedRef = useRef(false)

  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, toolStatus, error, start, reset } = useAiStream({
    projectId,
    phase: "research",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"
  const isYolo = searchParams.get("yolo") === "1"
  const isTeam = searchParams.get("team") === "1"

  const displayContent = existingContent ?? text

  const { visibleText, isRevealing, revealedCount, totalCount, skipReveal } = useProgressiveReveal({
    text: displayContent || "",
    isStreaming,
  })

  const questionInfo =
    !isStreaming && text ? detectQuestion(text) : { hasQuestion: false, question: "", options: [] }

  const progressValue = isStreaming
    ? Math.min(90, Math.floor(text.length / 20))
    : text || existingContent
      ? 100
      : 0

  // Load existing research report or trigger AI
  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadExisting() {
      try {
        const content = await api.readProjectFile(projectId, RESEARCH_FILE)
        if (!cancelled) {
          if (content) {
            setExistingContent(content)
          } else if (autostart) {
            if (!startedRef.current) {
              startedRef.current = true
              const initialMessages: Message[] = [
                { role: "user", content: "请开始竞品研究" },
              ]
              setMessages(initialMessages)
              start(initialMessages)
            }
          }
        }
      } catch (err) {
        console.error("Failed to load research file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          const initialMessages: Message[] = [
            { role: "user", content: "请开始竞品研究" },
          ]
          setMessages(initialMessages)
          start(initialMessages)
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
  const handleAnswer = useCallback(
    (answer: string) => {
      setChatHistory((prev) => [
        ...prev,
        { question: questionInfo.question, answer },
      ])
      const newMessages: Message[] = [
        ...messages,
        { role: "assistant", content: text || existingContent || "" },
        { role: "user", content: answer },
      ]
      setMessages(newMessages)
      setExistingContent(null)
      startedRef.current = true
      start(newMessages)
    },
    [messages, text, existingContent, questionInfo.question, start]
  )

  const fetchUrlEntries = useCallback(async (entries: UrlEntry[]): Promise<{ urlContext: string; updated: UrlEntry[] }> => {
    if (entries.length === 0) return { urlContext: "", updated: entries }
    setFetchingUrls(true)
    // Mark all as loading
    const loading = entries.map(e => ({ ...e, status: "loading" as const, error: undefined }))
    setUrls(loading)
    const results = await Promise.allSettled(
      entries.map(e => api.fetchUrlContent(e.url))
    )
    setFetchingUrls(false)
    const updated = entries.map((e, i) => {
      const r = results[i]
      return r.status === "fulfilled"
        ? { ...e, status: "success" as const, error: undefined }
        : { ...e, status: "error" as const, error: r.reason?.message ?? String(r.reason ?? "抓取失败") }
    })
    setUrls(updated)
    const urlContext = entries
      .map((e, i) => {
        const r = results[i]
        return r.status === "fulfilled"
          ? `### 来源：${e.url}\n${r.value}`
          : `### 来源：${e.url}\n（抓取失败，请基于已知信息分析）`
      })
      .join("\n\n---\n\n")
    return { urlContext, updated }
  }, [])

  const handleGenerate = useCallback(async () => {
    const { urlContext } = await fetchUrlEntries(urls)

    const promptContent = urlContext
      ? `请开始竞品研究\n\n以下是参考网页的实际内容，请基于真实内容进行分析：\n\n${urlContext}`
      : `请开始竞品研究`
    const initialMessages: Message[] = [{ role: "user", content: promptContent }]
    setMessages(initialMessages)
    startedRef.current = true
    start(initialMessages, { excludedContext })
  }, [start, excludedContext, urls, fetchUrlEntries])

  const handleRestart = useCallback(async () => {
    reset()
    setExistingContent(null)
    setChatHistory([])

    const { urlContext } = await fetchUrlEntries(urls)

    const promptContent = urlContext
      ? `请开始竞品研究\n\n以下是参考网页的实际内容，请基于真实内容进行分析：\n\n${urlContext}`
      : `请开始竞品研究`
    const initialMessages: Message[] = [
      { role: "user", content: promptContent },
    ]
    setMessages(initialMessages)
    startedRef.current = true
    start(initialMessages, { excludedContext })
  }, [reset, start, excludedContext, urls, fetchUrlEntries])

  const handleSkip = useCallback(async () => {
    if (!projectId) return
    try {
      await api.updatePhase({ projectId, phase: "research", status: "completed" })
      await api.advancePhase(projectId)
      invalidateProject(projectId)
      navigate(`/project/${projectId}/stories?autostart=1`)
    } catch (err) {
      console.error("Failed to skip:", err)
      toast("跳过阶段失败", "error")
    }
  }, [projectId, navigate, toast])

  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/analysis`)
  }, [navigate, projectId])

  const handleAdvance = useCallback(async () => {
    if (!projectId) return
    setAdvancing(true)
    setSaving(true)

    try {
      if (!existingContent && text) {
        await api.saveProjectFile({
          projectId,
          fileName: RESEARCH_FILE,
          content: text,
        })
      }
      setSaving(false)

      await api.advancePhase(projectId)
      invalidateProject(projectId)
      navigate(`/project/${projectId}/stories?autostart=1${isYolo ? "&yolo=1" : ""}${isTeam ? "&team=1" : ""}`)
    } catch (err) {
      console.error("Failed to advance:", err)
      toast("保存或推进阶段失败", "error")
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text, navigate, isYolo, isTeam, toast])

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
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">竞品研究</h1>
        </div>
        <div className="h-px bg-[var(--border)]" />
        {isApiMode ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
            <p className="min-w-0 flex-1 text-[13px] text-[var(--text-secondary)]">
              API 模式下竞品分析依赖模型知识，无法获取实时数据。切换到 Claude CLI 后端可启用联网搜索和深度分析。
            </p>
            <button
              onClick={() => navigate("/settings")}
              className="shrink-0 text-[13px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
            >
              前往设置
            </button>
          </div>
        ) : !hasPlaywrightMcp ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-[var(--text-secondary)]">
                未检测到 Playwright MCP，深度分析（自动登录截图）不可用。普通竞品分析仍可正常运行。
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)] select-all">
                claude mcp add playwright -s user -- npx @playwright/mcp@latest
              </p>
            </div>
          </div>
        ) : null}
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
        <PhaseEmptyState
          phaseLabel="RESEARCH"
          description="竞品研究报告"
          onGenerate={handleGenerate}
          onSkip={handleSkip}
        />
        {/* URL reference input */}
        <div className="mt-4">
          <p className="text-[12px] text-[var(--text-tertiary)] mb-2">添加参考网址（可选）</p>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlInput.trim()) {
                  setUrls((prev) => [...prev, { url: urlInput.trim(), status: "idle" }])
                  setUrlInput("")
                }
              }}
              className="flex-1 h-8 px-3 rounded text-[13px] bg-[var(--secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] transition-colors"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (urlInput.trim()) {
                  setUrls((prev) => [...prev, { url: urlInput.trim(), status: "idle" }])
                  setUrlInput("")
                }
              }}
            >
              添加
            </Button>
          </div>
          {urls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {urls.map((entry, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--secondary)] border text-[var(--text-secondary)]",
                    entry.status === "error"
                      ? "border-[var(--destructive)]/50"
                      : "border-[var(--border)]",
                  )}
                  title={entry.status === "error" ? entry.error : entry.url}
                >
                  {entry.status === "loading" && <Loader2 className="size-3 animate-spin text-[var(--text-tertiary)]" />}
                  {entry.status === "success" && <CheckCircle2 className="size-3 text-[var(--success)]" />}
                  {entry.status === "error" && (
                    <button
                      onClick={async () => {
                        // Retry single URL
                        setUrls(prev => prev.map((e, idx) => idx === i ? { ...e, status: "loading", error: undefined } : e))
                        try {
                          await api.fetchUrlContent(entry.url)
                          setUrls(prev => prev.map((e, idx) => idx === i ? { ...e, status: "success", error: undefined } : e))
                        } catch (err) {
                          setUrls(prev => prev.map((e, idx) => idx === i ? { ...e, status: "error", error: err instanceof Error ? err.message : String(err) } : e))
                        }
                      }}
                      className="flex items-center"
                      title="点击重试"
                    >
                      <XCircle className="size-3 text-[var(--destructive)]" />
                    </button>
                  )}
                  {(() => { try { return new URL(entry.url).hostname } catch { return entry.url.slice(0, 30) } })()}
                  <button
                    onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    aria-label="删除网址"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          {fetchingUrls && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] mt-1">
              <Loader2 className="size-3 animate-spin" />
              抓取参考网页中...
            </div>
          )}
        </div>
      </div>
    )
  }

  const hasContent = !!displayContent
  const canAdvance = hasContent && !isStreaming && !advancing

  // ── Screenshot analysis tab state ──────────────────────────────────
  const [researchTab, setResearchTab] = useState<"text" | "screenshot">("text")
  const [screenshotUrl, setScreenshotUrl] = useState("")
  const [screenshotMode, setScreenshotMode] = useState<ScreenshotAnalysisMode>("ui-review")
  const [screenshotFile, setScreenshotFile] = useState<string | null>(null)
  const [screenshotAnalyzing, setScreenshotAnalyzing] = useState(false)
  const [screenshotResult, setScreenshotResult] = useState<string | null>(null)

  const handleAnalyzeScreenshot = useCallback(async () => {
    const imagePath = screenshotFile
    if (!imagePath) {
      toast("请先上传截图或输入 URL", "error")
      return
    }
    setScreenshotAnalyzing(true)
    setScreenshotResult(null)
    try {
      const result = await api.analyzeScreenshot(imagePath, screenshotMode)
      setScreenshotResult(result.markdown)
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setScreenshotAnalyzing(false)
    }
  }, [screenshotFile, screenshotMode, toast])

  const handleCaptureUrl = useCallback(async () => {
    if (!screenshotUrl || !projectId) return
    setScreenshotAnalyzing(true)
    try {
      const proj = await api.getProject(projectId)
      if (!proj) throw new Error("项目不存在")
      const path = await api.captureUrlScreenshot(screenshotUrl, proj.outputDir)
      setScreenshotFile(path)
      toast("截图完成", "success")
    } catch (err) {
      toast(String(err), "error")
    } finally {
      setScreenshotAnalyzing(false)
    }
  }, [screenshotUrl, projectId, toast])

  return (
    <div className="layout-focus page-enter">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">竞品研究</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRestart}
          disabled={isStreaming}
        >
          &#x21bb; 重新研究
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="mb-4">
        <SegmentedControl
          items={[
            { key: "text" as const, label: "文本研究" },
            { key: "screenshot" as const, label: "截图分析" },
          ]}
          value={researchTab}
          onChange={(v) => setResearchTab(v as "text" | "screenshot")}
        />
      </div>

      {/* Screenshot analysis tab */}
      {researchTab === "screenshot" && (
        <div className="space-y-4 pb-8">
          {/* Upload / URL input */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">URL 截图</label>
              <div className="flex gap-2">
                <input
                  value={screenshotUrl}
                  onChange={e => setScreenshotUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)]"
                />
                <Button size="sm" onClick={handleCaptureUrl} disabled={!screenshotUrl || screenshotAnalyzing}>
                  截图
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">或拖拽上传图片</label>
              <div
                className="border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center text-sm text-[var(--text-tertiary)] cursor-pointer hover:border-[var(--accent)]/50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const file = e.dataTransfer.files[0]
                  if (file) setScreenshotFile((file as unknown as { path?: string }).path || file.name)
                }}
              >
                {screenshotFile ? (
                  <span className="text-[var(--text-primary)]">{screenshotFile.split("/").pop()}</span>
                ) : "将图片拖拽到此处"}
              </div>
            </div>
          </div>

          {/* Analysis mode */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">分析模式</label>
            <select
              value={screenshotMode}
              onChange={e => setScreenshotMode(e.target.value as ScreenshotAnalysisMode)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)]"
            >
              {(Object.entries(ANALYSIS_MODE_META) as [ScreenshotAnalysisMode, { label: string; description: string }][]).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label} — {meta.description}</option>
              ))}
            </select>
          </div>

          <Button onClick={handleAnalyzeScreenshot} disabled={!screenshotFile || screenshotAnalyzing} className="w-full">
            {screenshotAnalyzing ? "分析中..." : "分析"}
          </Button>

          {/* Result */}
          {screenshotResult && (
            <div className="border border-[var(--border)] rounded-lg p-4">
              <PrdViewer markdown={screenshotResult} isStreaming={false} />
            </div>
          )}
        </div>
      )}

      {/* Text research tab (original content) */}
      {researchTab === "text" && <>
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
          <StreamProgress isStreaming={isStreaming} isThinking={isThinking} elapsedSeconds={elapsedSeconds} streamMeta={streamMeta} toolStatus={toolStatus} />
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

      {/* Research report viewer */}
      <div className="mt-6">
        <RevealContainer isRevealing={isRevealing} revealedCount={revealedCount} totalCount={totalCount} onSkip={skipReveal}>
          <PrdViewer
            markdown={visibleText}
            isStreaming={isStreaming}
          />
        </RevealContainer>
        {!isStreaming && <StreamProgress isStreaming={false} isThinking={false} elapsedSeconds={0} streamMeta={streamMeta} />}
      </div>

      {/* Chat history */}
      {chatHistory.length > 0 && (
        <div className="mt-4 space-y-2">
          {chatHistory.map((round, i) => (
            <InlineChat
              key={`chat-${i}`}
              question={round.question}
              isCollapsed
              collapsedSummary={`已回答：${round.answer}`}
            />
          ))}
        </div>
      )}

      {/* Active AI question */}
      {!isStreaming && hasContent && questionInfo.hasQuestion && (
        <div className="mt-6">
          <InlineChat
            question={questionInfo.question}
            options={
              questionInfo.options.length > 0
                ? questionInfo.options
                : undefined
            }
            onAnswer={handleAnswer}
          />
        </div>
      )}

      {/* Supplementary input */}
      {!isStreaming && hasContent && !questionInfo.hasQuestion && (
        <div className="mt-6">
          <InlineChat
            question="竞品研究已完成。如需补充信息或调整研究方向，可以在这里告诉我。"
            onAnswer={handleAnswer}
          />
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
          {PHASE_META.research.backLabel}
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
                : PHASE_META.research.nextLabel + " →"}
          </Button>
          {!advancing && !saving && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {PHASE_META.research.nextDescription}
            </p>
          )}
        </div>
      </div>
      </>}
    </div>
  )
}
