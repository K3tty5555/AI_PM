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
import { ReferenceFiles } from "@/components/reference-files"

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

function parseReviewSections(markdown: string): Partial<Record<RoleKey, string>> {
  const result: Partial<Record<RoleKey, string>> = {}
  for (const role of REVIEW_ROLES) {
    const idx = markdown.indexOf(role.heading)
    if (idx === -1) continue
    const start = idx + role.heading.length
    const nextIdx = REVIEW_ROLES
      .map(r => markdown.indexOf(r.heading, start))
      .filter(i => i > idx)
      .sort((a, b) => a - b)[0] ?? markdown.length
    result[role.key] = markdown.slice(start, nextIdx).trim()
  }
  return result
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

  // Role tab state
  const [activeRole, setActiveRole] = useState<RoleKey>("product")

  // Strategy + modification state
  const [strategyChosen, setStrategyChosen] = useState<string | null>(null)

  // Knowledge recommendation (empty state only)
  const [projectName, setProjectName] = useState<string>("")
  const [relevantKnowledge, setRelevantKnowledge] = useState<KnowledgeEntry[]>([])
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false)

  // Quick-record knowledge modal state
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false)
  const [kTitle, setKTitle] = useState("")
  const [kContent, setKContent] = useState("")
  const [kCategory, setKCategory] = useState("pitfalls")
  const [kSaving, setKSaving] = useState(false)
  const [kError, setKError] = useState("")

  const startedRef = useRef(false)

  // Primary review stream
  const { text, isStreaming, isThinking, elapsedSeconds, streamMeta, error, start, reset } = useAiStream({
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

  // Compute role-filtered content — fallback to null when no roles matched (legacy format)
  const rawSections = !isStreaming && displayContent ? parseReviewSections(displayContent) : null
  const sections = rawSections && Object.keys(rawSections).length > 0 ? rawSections : null

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
    }
  }, [projectId])

  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}/prototype`)
  }, [navigate, projectId])

  const handleOpenKnowledgeModal = useCallback(() => {
    const name = projectName ?? "本项目"
    setKTitle(`${name} 评审经验`)
    const issues = REVIEW_ROLES.flatMap(role => {
      const content = sections?.[role.key] ?? ""
      return content
        .split("\n")
        .filter(l => l.includes("Critical") || l.includes("Major"))
        .slice(0, 2)
    }).join("\n")
    setKContent(
      issues
        ? `## 主要问题\n\n${issues}\n\n## 经验教训\n\n`
        : "## 主要问题\n\n## 改进建议\n\n## 经验教训\n\n"
    )
    setKError("")
    setShowKnowledgeModal(true)
  }, [projectName, sections])

  const handleSaveKnowledge = useCallback(async () => {
    if (!kTitle.trim()) return
    setKSaving(true)
    setKError("")
    try {
      await api.addKnowledge({ category: kCategory, title: kTitle, content: kContent })
      setShowKnowledgeModal(false)
    } catch (err) {
      setKError(String(err))
    } finally {
      setKSaving(false)
    }
  }, [kTitle, kContent, kCategory])

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
      setAdvancing(false)
      setSaving(false)
    }
  }, [projectId, existingContent, text])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-[var(--text-tertiary)]">加载中···</span>
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
        <PhaseEmptyState
          phaseLabel="REVIEW"
          description="需求评审报告"
          onGenerate={handleGenerate}
          onSkip={handleSkip}
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

      {/* Role tabs — only when sections parsed successfully */}
      {!isStreaming && sections && (
        <div className="flex gap-0 border-b border-[var(--border)] overflow-x-auto mt-4">
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
        {isStreaming ? (
          <PrdViewer
            markdown={displayContent || ""}
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
            markdown={displayContent || ""}
            isStreaming={false}
          />
        )}
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
            <Button variant="ghost" size="sm" onClick={handleOpenKnowledgeModal}>
              记录经验
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

      {/* Quick-record knowledge modal */}
      {showKnowledgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="w-[480px] bg-[var(--background)] rounded-xl border border-[var(--border)] shadow-[var(--shadow-xl)] p-5 flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              记录项目经验
            </h3>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-secondary)]">标题</label>
              <input
                value={kTitle}
                onChange={e => setKTitle(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-secondary)]">分类</label>
              <select
                value={kCategory}
                onChange={e => setKCategory(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
              >
                <option value="pitfalls">踩坑经验</option>
                <option value="patterns">最佳模式</option>
                <option value="decisions">决策记录</option>
                <option value="insights">产品洞察</option>
                <option value="playbooks">打法手册</option>
                <option value="metrics">指标设计</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-secondary)]">内容（Markdown）</label>
              <textarea
                value={kContent}
                onChange={e => setKContent(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm font-mono resize-none outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
              />
            </div>

            {kError && (
              <p className="text-xs text-[var(--destructive)]">{kError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKnowledgeModal(false)}
                disabled={kSaving}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSaveKnowledge}
                disabled={kSaving || !kTitle.trim()}
              >
                {kSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
