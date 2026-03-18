import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
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
// Section parser — splits review report into tech / product panels
// ---------------------------------------------------------------------------

function parseReviewSections(text: string): { tech: string; product: string } {
  const techIdx = text.indexOf("## 技术视角")
  const productIdx = text.indexOf("## 产品视角")
  const conclusionIdx = text.indexOf("## 评审结论")

  const techEnd = productIdx !== -1 ? productIdx : (conclusionIdx !== -1 ? conclusionIdx : text.length)
  const productEnd = conclusionIdx !== -1 ? conclusionIdx : text.length

  return {
    tech: techIdx !== -1 ? text.slice(techIdx, techEnd).trim() : "",
    product: productIdx !== -1 ? text.slice(productIdx, productEnd).trim() : "",
  }
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
  const [completed, setCompleted] = useState(false)

  // Dual-panel tab state
  const [activeTab, setActiveTab] = useState<"all" | "tech" | "product">("all")

  // Strategy + modification state
  const [strategyChosen, setStrategyChosen] = useState<string | null>(null)

  // Knowledge recommendation (empty state only)
  const [projectName, setProjectName] = useState<string>("")
  const [relevantKnowledge, setRelevantKnowledge] = useState<KnowledgeEntry[]>([])
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false)

  const startedRef = useRef(false)

  // Primary review stream
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, outputFile, start, reset } = useAiStream({
    projectId,
    phase: "review",
  })

  // Secondary modification stream
  const {
    text: modifyText,
    isStreaming: isModifying,
    error: modifyError,
    start: startModify,
    reset: resetModify,
  } = useAiStream({
    projectId,
    phase: "review-modify",
  })

  const [searchParams] = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"

  const displayContent = existingContent ?? text

  // Compute tab-filtered content
  const sections = !isStreaming && displayContent ? parseReviewSections(displayContent) : null
  const tabContent = activeTab === "all" || !sections
    ? displayContent || ""
    : activeTab === "tech"
      ? sections.tech
      : sections.product

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

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

  // Strategy selection — triggers second stream (except "跳过修改")
  const handleStrategySelect = useCallback((strategy: string) => {
    if (strategy === "跳过修改") {
      setStrategyChosen("skip")
      return
    }
    setStrategyChosen(strategy)
    resetModify()
    startModify([{ role: "user", content: `请按「${strategy}」策略修改 PRD，修复评审报告中指出的对应问题` }])
  }, [startModify, resetModify])

  // Handlers
  const handleGenerate = useCallback(() => {
    startedRef.current = true
    start([{ role: "user", content: "请开始需求评审" }], { excludedContext })
  }, [start, excludedContext])

  const handleRestart = useCallback(() => {
    reset()
    resetModify()
    setExistingContent(null)
    setStrategyChosen(null)
    setActiveTab("all")
    startedRef.current = true
    start([{ role: "user", content: "请开始需求评审" }], { excludedContext })
  }, [reset, resetModify, start, excludedContext])

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
      setCompleted(true)
    } catch (err) {
      console.error("Failed to complete:", err)
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text, outputFile])

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

      {/* Dual-panel tabs — only after streaming completes */}
      {!isStreaming && hasContent && (
        <div className="flex items-center gap-1 mt-4">
          {(["all", "tech", "product"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1 rounded text-[12px] transition-colors",
                activeTab === tab
                  ? "bg-[var(--accent-color)]/10 text-[var(--accent-color)] font-medium"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              {tab === "all" ? "全部" : tab === "tech" ? "技术视角" : "产品视角"}
            </button>
          ))}
        </div>
      )}

      {/* Strategy selection — shown once review is done and no strategy chosen yet */}
      {!isStreaming && hasContent && !strategyChosen && !isModifying && (
        <div className="mt-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
          <p className="text-[13px] font-medium text-[var(--text-primary)] mb-3">选择修改策略</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "全部修改", badge: null },
              { label: "核心修改（Critical+Major）", badge: "推荐" },
              { label: "最小修改（仅Critical）", badge: null },
              { label: "跳过修改", badge: null },
            ].map(({ label, badge }) => (
              <button
                key={label}
                onClick={() => handleStrategySelect(label)}
                className={cn(
                  "relative px-3 py-1.5 rounded text-[12px] border transition-colors",
                  label === "跳过修改"
                    ? "border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]"
                )}
              >
                {label}
                {badge && (
                  <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modification in progress */}
      {isModifying && (
        <div className="mt-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
          <p className="text-[13px] text-[var(--text-secondary)]">
            ⚡ 正在按「{strategyChosen}」策略修改 PRD···
          </p>
          <ProgressBar
            value={Math.min(90, Math.floor(modifyText.length / 20))}
            animated
            className="mt-2"
          />
        </div>
      )}

      {/* Modification complete */}
      {strategyChosen && strategyChosen !== "skip" && !isModifying && modifyText.trim().length > 0 && !modifyError && (
        <div className="mt-4 p-4 rounded-lg border border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">
            ✓ PRD 已按「{strategyChosen}」策略修改完成
          </p>
          <button
            type="button"
            onClick={() => navigate(`/project/${projectId}/prd`)}
            className="mt-2 text-sm text-[var(--accent-color)] hover:underline transition-colors"
          >
            前往查看修改后的 PRD →
          </button>
        </div>
      )}

      {/* Skip chosen */}
      {strategyChosen === "skip" && (
        <div className="mt-4 pl-5 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--border)] before:content-['']">
          <p className="text-sm text-[var(--text-tertiary)]">
            已跳过修改。如需修改，可点击「重新评审」重新生成报告。
          </p>
        </div>
      )}

      {/* Modify error */}
      {modifyError && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{modifyError}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => {
            setStrategyChosen(null)
            resetModify()
          }}>
            重试
          </Button>
        </div>
      )}

      {/* Review report */}
      <div className="mt-6">
        <PrdViewer
          markdown={tabContent}
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
      {completed ? (
        <div className="mt-8 p-5 rounded-lg border border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">项目已完成</p>
          <p className="text-[13px] text-[var(--text-secondary)] mb-4">
            建议将本次项目经验存入知识库，方便下次参考。
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/tools/knowledge")}
            >
              前往知识库
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
            >
              返回首页
            </Button>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  )
}
