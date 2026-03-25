import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useAiStream } from "@/hooks/use-ai-stream"
import { useProgressiveReveal } from "@/hooks/use-progressive-reveal"
import { RevealContainer } from "@/components/RevealContainer"
import { api } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { StreamProgress } from "@/components/StreamProgress"
import { cn, extractStreamStatus } from "@/lib/utils"
import { invalidateProject } from "@/lib/project-cache"
import { PHASE_META } from "@/lib/phase-meta"
import { PhaseEmptyState } from "@/components/phase-empty-state"
import { ContextPills } from "@/components/context-pills"
import { ReferenceFiles } from "@/components/reference-files"
import { KnowledgeRecommendPanel } from "@/components/knowledge-recommend-panel"
import { KnowledgeRecordModal } from "@/components/knowledge-record-modal"
import { ReviewGroupedView } from "@/components/review-grouped-view"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVIEW_FILE = "08-review-report.md"
const REVIEW_FILE_FALLBACKS = [
  "07-review-report.md",
  "07-review-report-v1.md",
  "08-review-report-v1.md",
]

const REVIEW_ROLES = [
  { key: "product", label: "产品经理",   icon: "📋", heading: "## 产品经理视角" },
  { key: "tech",    label: "技术架构师", icon: "⚙️", heading: "## 技术架构师视角" },
  { key: "ux",      label: "UX 设计",   icon: "🎨", heading: "## UX 设计视角" },
  { key: "ops",     label: "运营",       icon: "📈", heading: "## 运营视角" },
  { key: "biz",     label: "商务",       icon: "💼", heading: "## 商务视角" },
  { key: "user",    label: "用户代表",   icon: "👤", heading: "## 用户代表视角" },
] as const

type RoleKey = typeof REVIEW_ROLES[number]["key"]

// ---------------------------------------------------------------------------
// Section parser — splits review report into 6 role panels
// ---------------------------------------------------------------------------

const ROLE_PATTERNS: Record<RoleKey, RegExp> = {
  product:   /产品经理|产品\s*视角|PM\s*视角/i,
  tech:      /技术架构|架构师|技术\s*视角/i,
  ux:        /UX|设计|交互\s*设计/i,
  ops:       /运营|运营\s*视角/i,
  biz:       /商务|商业|商务\s*视角/i,
  user:      /用户代表|用户\s*视角|终端用户/i,
}

function parseReviewSections(markdown: string): { sections: Partial<Record<RoleKey, string>>; fuzzy: boolean } {
  // Step 1: exact heading match
  const exact: Partial<Record<RoleKey, string>> = {}
  for (const role of REVIEW_ROLES) {
    const idx = markdown.indexOf(role.heading)
    if (idx === -1) continue
    const start = idx + role.heading.length
    const nextIdx = REVIEW_ROLES
      .map(r => markdown.indexOf(r.heading, start))
      .filter(i => i > idx)
      .sort((a, b) => a - b)[0] ?? markdown.length
    exact[role.key] = markdown.slice(start, nextIdx).trim()
  }
  if (Object.keys(exact).length >= 3) {
    return { sections: exact, fuzzy: false }
  }

  // Step 2: fuzzy regex match on ## headings
  const fuzzy: Partial<Record<RoleKey, string>> = {}
  const headingRegex = /^##\s+(.+)$/gm
  const headings: { key: RoleKey | null; index: number; length: number }[] = []
  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(markdown)) !== null) {
    const title = match[1]
    let matchedKey: RoleKey | null = null
    for (const [key, pattern] of Object.entries(ROLE_PATTERNS)) {
      if (pattern.test(title)) {
        matchedKey = key as RoleKey
        break
      }
    }
    headings.push({ key: matchedKey, index: match.index + match[0].length, length: match[0].length })
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    if (!h.key) continue
    const start = h.index
    const end = i + 1 < headings.length ? headings[i + 1].index - headings[i + 1].length : markdown.length
    fuzzy[h.key] = markdown.slice(start, end).trim()
  }
  if (Object.keys(fuzzy).length >= 2) {
    return { sections: fuzzy, fuzzy: true }
  }

  // Step 3: no match — return empty (caller will fallback to full text)
  return { sections: {}, fuzzy: false }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ReviewPage() {
  const params = useParams()
  const navigate = useNavigate()
  const projectId = params?.id as string
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [existingContent, setExistingContent] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excludedContext, setExcludedContext] = useState<string[]>([])
  const [completed, setCompleted] = useState(false)

  // Role tab state
  const [activeRole, setActiveRole] = useState<RoleKey>("product")
  const [reviewViewMode, setReviewViewMode] = useState<"roles" | "chapters">("roles")

  // Strategy + modification state
  const [strategyChosen, setStrategyChosen] = useState<string | null>(null)

  // Project name for knowledge modal
  const [projectName, setProjectName] = useState<string>("")

  // Quick-record knowledge modal state
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false)

  const startedRef = useRef(false)

  // Primary review stream
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, toolStatus, error, start, reset } = useAiStream({
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

  const { visibleText, isRevealing, revealedCount, totalCount, skipReveal } = useProgressiveReveal({
    text: displayContent || "",
    isStreaming,
  })

  // Compute role-filtered content — fallback to null when no roles matched (legacy format)
  const parseResult = !isStreaming && displayContent ? parseReviewSections(displayContent) : null
  const sections = parseResult && Object.keys(parseResult.sections).length > 0 ? parseResult.sections : null
  const parsedFuzzy = parseResult?.fuzzy ?? false
  const parseFallback = parseResult !== null && !sections

  // Toast when parse degrades
  const parseToastedRef = useRef(false)
  useEffect(() => {
    if (parseToastedRef.current) return
    if (parsedFuzzy && sections) {
      parseToastedRef.current = true
      toast("评审格式与预期不同，已模糊匹配角色", "info")
    } else if (parseFallback) {
      parseToastedRef.current = true
      toast("评审格式与预期不同，已切换全文视图", "info")
    }
  }, [parsedFuzzy, parseFallback, sections, toast])

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
        let content = await api.readProjectFile(projectId, REVIEW_FILE)
        if (!content) {
          for (const fallback of REVIEW_FILE_FALLBACKS) {
            content = await api.readProjectFile(projectId, fallback)
            if (content) break
          }
        }
        if (!cancelled) {
          if (content) {
            setExistingContent(content)
          } else if (autostart) {
            if (!startedRef.current) {
              startedRef.current = true
              start([{ role: "user", content: "请从以下六个专业视角评审 PRD，每个视角单独输出，严格使用以下标题（不要修改标题文字）：\n\n## 产品经理视角\n## 技术架构师视角\n## UX 设计视角\n## 运营视角\n## 商务视角\n## 用户代表视角\n\n每个视角包含：核心关注点、主要问题（标注 Critical / Major / Minor 等级）、具体改进建议。" }])
            }
          }
        }
      } catch (err) {
        console.error("Failed to load review file:", err)
        if (!cancelled && !startedRef.current && autostart) {
          startedRef.current = true
          start([{ role: "user", content: "请从以下六个专业视角评审 PRD，每个视角单独输出，严格使用以下标题（不要修改标题文字）：\n\n## 产品经理视角\n## 技术架构师视角\n## UX 设计视角\n## 运营视角\n## 商务视角\n## 用户代表视角\n\n每个视角包含：核心关注点、主要问题（标注 Critical / Major / Minor 等级）、具体改进建议。" }])
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
    start([{ role: "user", content: "请从以下六个专业视角评审 PRD，每个视角单独输出，严格使用以下标题（不要修改标题文字）：\n\n## 产品经理视角\n## 技术架构师视角\n## UX 设计视角\n## 运营视角\n## 商务视角\n## 用户代表视角\n\n每个视角包含：核心关注点、主要问题（标注 Critical / Major / Minor 等级）、具体改进建议。" }], { excludedContext })
  }, [start, excludedContext])

  const handleRestart = useCallback(() => {
    reset()
    resetModify()
    setExistingContent(null)
    setStrategyChosen(null)
    setActiveRole("product")
    startedRef.current = true
    start([{ role: "user", content: "请从以下六个专业视角评审 PRD，每个视角单独输出，严格使用以下标题（不要修改标题文字）：\n\n## 产品经理视角\n## 技术架构师视角\n## UX 设计视角\n## 运营视角\n## 商务视角\n## 用户代表视角\n\n每个视角包含：核心关注点、主要问题（标注 Critical / Major / Minor 等级）、具体改进建议。" }], { excludedContext })
  }, [reset, resetModify, start, excludedContext])

  const handleSkip = useCallback(async () => {
    if (!projectId) return
    try {
      await api.updatePhase({ projectId, phase: "review", status: "completed" })
      await api.advancePhase(projectId)
      invalidateProject(projectId)
      setCompleted(true)
    } catch (err) {
      console.error("Failed to skip:", err)
      toast("跳过阶段失败，请重试", "error")
    }
  }, [projectId])

  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/prototype`)
  }, [navigate, projectId])

  // Extract Critical/Major issues from review sections for knowledge modal pre-fill
  const knowledgeInitialContent = sections
    ? REVIEW_ROLES.flatMap(role => {
        const c = sections[role.key] ?? ""
        return c.split("\n").filter(l => l.includes("Critical") || l.includes("Major")).slice(0, 2)
      }).join("\n") || undefined
    : undefined

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

      await api.advancePhase(projectId)
      invalidateProject(projectId)
      setCompleted(true)
    } catch (err) {
      console.error("Failed to complete:", err)
      toast("完成评审失败，请重试", "error")
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中...</span>
      </div>
    )
  }

  if (!loading && !existingContent && !text && !isStreaming && !error) {
    return (
      <div className="layout-focus page-enter">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">需求评审</h1>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <ContextPills
          projectId={projectId!}
          onExcludeChange={setExcludedContext}
          className="border-b border-[var(--border)]"
        />
        <ReferenceFiles projectId={projectId!} className="px-1 py-2 border-b border-[var(--border)]" />
        <KnowledgeRecommendPanel projectId={projectId!} timing="before_review" visible={!existingContent} />
        <PhaseEmptyState
          phaseLabel="REVIEW"
          description="需求评审报告"
          onGenerate={handleGenerate}
          onSkip={handleSkip}
        />
      </div>
    )
  }

  const hasContent = !!displayContent
  const canComplete = hasContent && !isStreaming && !advancing

  return (
    <div className="layout-focus page-enter">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">需求评审</h1>
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

      {/* View mode toggle + Role tabs */}
      {!isStreaming && sections && (
        <>
        <div className="flex items-center gap-2 mt-4 mb-2">
          <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--secondary)] p-0.5">
            <button
              onClick={() => setReviewViewMode("roles")}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-200",
                reviewViewMode === "roles"
                  ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)]",
              )}
            >
              按角色
            </button>
            <button
              onClick={() => setReviewViewMode("chapters")}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-200",
                reviewViewMode === "chapters"
                  ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)]",
              )}
            >
              按章节
            </button>
          </div>
        </div>

        {/* Chapter grouped view */}
        {reviewViewMode === "chapters" && displayContent && (
          <div className="mt-2">
            <ReviewGroupedView markdown={displayContent} projectId={projectId} />
          </div>
        )}

        {/* Role tabs */}
        {reviewViewMode === "roles" && (
        <div className="flex gap-0 border-b border-[var(--border)] overflow-x-auto">
          {REVIEW_ROLES.map(role => (
            <button
              key={role.key}
              onClick={() => setActiveRole(role.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
                activeRole === role.key
                  ? "border-[var(--accent-color)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <span className="text-base leading-none">{role.icon}</span>
              {role.label}
            </button>
          ))}
        </div>
        )}
        </>
      )}

      {/* Strategy selection — shown once review is done and no strategy chosen yet */}
      {!isStreaming && sections && !strategyChosen && !isModifying && (
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
            ⚡ 按「{strategyChosen}」策略修改 PRD 中...
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
        <RevealContainer isRevealing={isRevealing} revealedCount={revealedCount} totalCount={totalCount} onSkip={skipReveal}>
          {isStreaming ? (
            <PrdViewer
              markdown={visibleText}
              isStreaming={isStreaming}
            />
          ) : sections ? (
            <>
              {sections[activeRole] ? (
                <PrdViewer
                  markdown={sections[activeRole]!}
                  isStreaming={false}
                />
              ) : (
                <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">该视角暂无内容</p>
              )}
            </>
          ) : (
            <PrdViewer
              markdown={visibleText}
              isStreaming={false}
            />
          )}
        </RevealContainer>
        {!isStreaming && <StreamProgress isStreaming={false} isThinking={false} elapsedSeconds={0} streamMeta={streamMeta} />}
      </div>

      {/* Bottom action bar */}
      {completed ? (
        <>
          <div className="mb-4 mt-8 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]">
            <span className="size-1.5 rounded-full bg-[var(--success)]" />
            <span className="flex-1 text-[13px] text-[var(--text-secondary)]">评审已完成</span>
            <Button variant="ghost" size="sm" onClick={() => setShowKnowledgeModal(true)}>
              沉淀知识到知识库
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
            >
              返回首页
            </Button>
          </div>
        </>
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
                  ? "完成中..."
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

      {/* Quick-record knowledge modal */}
      <KnowledgeRecordModal
        open={showKnowledgeModal}
        onClose={() => setShowKnowledgeModal(false)}
        projectName={projectName}
        initialContent={knowledgeInitialContent}
      />
    </div>
  )
}
