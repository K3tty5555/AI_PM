import { useState, useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { ProjectSelector } from "@/components/project-selector"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

type DataMode = "数据洞察" | "指标设计" | "数据仪表盘"

export function ToolDataPage() {
  const [filePath, setFilePath] = useState("")
  const [analysisGoal, setAnalysisGoal] = useState("")
  const [isApiMode, setIsApiMode] = useState(true)
  const [mode, setMode] = useState<DataMode>("数据洞察")
  const [dashboardPath, setDashboardPath] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const initialProjectId = searchParams.get("projectId") ?? localStorage.getItem("tool-binding:data") ?? null
  const [boundProjectId, setBoundProjectId] = useState<string | null>(initialProjectId)
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("ai-pm-data", boundProjectId ?? undefined)

  const [prdContext, setPrdContext] = useState<{ projectName: string; content: string } | null>(null)
  const [prdLoading, setPrdLoading] = useState(false)

  // Track projects dir for dashboard save
  const projectsDirRef = useRef<string>("")

  useEffect(() => {
    api.getConfig().then(cfg => setIsApiMode(cfg.backend === "api")).catch(() => {})
    api.getProjectsDir().then(dir => { projectsDirRef.current = dir }).catch(() => {})
  }, [])

  useEffect(() => {
    if (mode !== "指标设计" || !boundProjectId) {
      setPrdContext(null)
      return
    }
    let cancelled = false
    setPrdLoading(true)
    Promise.all([
      api.readProjectFile(boundProjectId, "05-prd/05-PRD-v1.0.md"),
      api.getProject(boundProjectId),
    ]).then(([prdContent, project]) => {
      if (!cancelled) {
        if (prdContent && project) {
          setPrdContext({ projectName: project.name, content: prdContent })
        } else {
          setPrdContext(null)
        }
      }
    }).catch(() => {
      if (!cancelled) setPrdContext(null)
    }).finally(() => {
      if (!cancelled) setPrdLoading(false)
    })
    return () => { cancelled = true }
  }, [boundProjectId, mode])

  // When dashboard streaming completes, auto-save HTML
  useEffect(() => {
    if (mode !== "数据仪表盘" || isStreaming || !text) return
    if (!text.trimStart().toLowerCase().startsWith("<!doctype html")) return

    const dir = projectsDirRef.current
    if (!dir) return

    const htmlPath = `${dir}/tools/ai-pm-data/data-dashboard.html`
    api.writeFile(htmlPath, text)
      .then(() => setDashboardPath(htmlPath))
      .catch(() => {/* silently ignore if save fails */})
  }, [mode, isStreaming, text])

  const handleSelectFile = useCallback(async () => {
    const extensions = isApiMode
      ? ["csv", "txt", "md"]
      : ["csv", "txt", "md", "xlsx", "xls"]
    const selected = await openDialog({
      filters: [{ name: "数据文件", extensions }],
    })
    if (selected && typeof selected === "string") {
      setFilePath(selected)
    }
  }, [isApiMode])

  const handleRun = useCallback(() => {
    reset()
    setDashboardPath(null)

    if (mode === "数据洞察") {
      if (!filePath) return
      const goal = analysisGoal.trim() || "请对数据进行全面洞察分析，发现关键趋势和问题"
      run(goal, filePath)
    } else if (mode === "指标设计") {
      const userGoal = analysisGoal.trim() || "请设计完整的指标体系"
      const goal = prdContext
        ? `请基于以下项目PRD设计指标体系和埋点方案：\n\n${prdContext.content.slice(0, 3000)}\n\n---\n${userGoal}`
        : userGoal
      run(goal, filePath || undefined, "metrics")
    } else {
      // 数据仪表盘
      if (!filePath) return
      const goal = analysisGoal.trim() || "请根据数据生成交互式数据仪表盘"
      run(goal, filePath, "dashboard")
    }
  }, [filePath, analysisGoal, mode, prdContext, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setFilePath("")
    setAnalysisGoal("")
    setDashboardPath(null)
  }, [reset])

  const handleModeChange = useCallback((newMode: DataMode) => {
    setMode(newMode)
    reset()
    setFilePath("")
    setAnalysisGoal("")
    setDashboardPath(null)
    setPrdContext(null)
    setPrdLoading(false)
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 30)) : text ? 100 : 0

  const isInsight = mode === "数据洞察"
  const isMetrics = mode === "指标设计"
  const isDashboard = mode === "数据仪表盘"
  const isHtmlOutput = isDashboard && text.trimStart().toLowerCase().startsWith("<!doctype html")

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">数据洞察</h1>
        <span className="text-sm text-[var(--text-secondary)]">数据分析工具集</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Mode tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-[var(--secondary)] p-1">
        {(["数据洞察", "指标设计", "数据仪表盘"] as DataMode[]).map(m => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[13px] transition-colors",
              mode === m
                ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <ProjectSelector
        toolKey="data"
        value={boundProjectId}
        onChange={setBoundProjectId}
        className="mt-4"
      />

      {!isStreaming && !text && (
        <div className="mt-6 space-y-4">
          {/* Mode-specific info banner */}
          {isInsight && (
            isApiMode ? (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
                <p className="text-[13px] text-[var(--text-secondary)]">
                  API 模式支持 CSV / TXT 文件。Excel 文件需切换到 Claude CLI 后端。
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" />
                <p className="text-[13px] text-[var(--text-secondary)]">
                  CLI 模式：支持 Excel / CSV / TXT，AI 将自动调用 Python 读取 Excel 文件。
                </p>
              </div>
            )
          )}
          {isDashboard && (
            <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" />
              <p className="text-[13px] text-[var(--text-secondary)]">
                根据数据文件生成交互式 HTML 仪表盘，遵循 Apple HIG 风格，支持筛选联动。生成完成后可直接在浏览器中打开。
              </p>
            </div>
          )}
          {isMetrics && (
            <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" />
              <p className="text-[13px] text-[var(--text-secondary)]">
                输出结构化指标体系，包含北极星指标、分解指标、数据口径定义、埋点建议。文件上传可选。
              </p>
            </div>
          )}
          {isMetrics && prdLoading && (
            <p className="text-[12px] text-[var(--text-tertiary)]">正在加载项目 PRD···</p>
          )}
          {isMetrics && prdContext && (
            <div className="flex items-start gap-3 rounded-lg border border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5 px-4 py-3">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--accent-color)]" />
              <p className="text-[13px] text-[var(--text-secondary)]">
                已加载「{prdContext.projectName}」PRD 作为指标设计上下文
              </p>
            </div>
          )}

          {/* File upload */}
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              {isMetrics
                ? "选择数据文件（可选，CSV / TXT）"
                : `选择数据文件（${isApiMode ? "CSV / TXT" : "Excel / CSV / TXT"}）`}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                readOnly
                placeholder="未选择文件..."
                className={cn(
                  "flex-1 h-9 px-3 text-sm bg-transparent border border-[var(--border)]",
                  "placeholder:text-[var(--text-secondary)] outline-none"
                )}
              />
              <Button variant="ghost" size="sm" onClick={handleSelectFile}>选择文件</Button>
            </div>
          </div>

          {/* Analysis goal / business description */}
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              {isMetrics ? "业务场景描述" : isDashboard ? "仪表盘需求（可选）" : "分析目标（可选）"}
            </p>
            <input
              type="text"
              value={analysisGoal}
              onChange={(e) => setAnalysisGoal(e.target.value)}
              placeholder={
                isMetrics
                  ? "描述你的业务场景，如：电商平台用户增长"
                  : isDashboard
                  ? "例：突出展示月度趋势和地区分布"
                  : "例：找出用户流失的关键节点"
              }
              className={cn(
                "w-full rounded-lg h-9 px-3 text-sm bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-secondary)] outline-none",
                "focus:border-[var(--accent-color)] transition-[border-color]"
              )}
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={isMetrics ? false : !filePath}
            >
              {isInsight ? "开始分析" : isMetrics ? "生成指标体系" : "生成仪表盘"}
            </Button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">正在思考···</p>}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">重置</Button>
        </div>
      )}

      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">
              {isInsight ? "分析结果" : isMetrics ? "指标体系" : "仪表盘"}
            </span>
            {!isStreaming && (
              <div className="flex gap-2">
                {/* Dashboard-specific actions */}
                {isDashboard && isHtmlOutput && dashboardPath && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => api.revealFile(dashboardPath)}
                    >
                      在 Finder 中显示
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => api.openFile(dashboardPath)}
                    >
                      在浏览器中打开
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={handleReset}>重新{isInsight ? "分析" : isMetrics ? "生成" : "生成"}</Button>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text)}>复制</Button>
              </div>
            )}
          </div>

          {/* For dashboard HTML output, show a preview note instead of markdown render */}
          {isDashboard && isHtmlOutput ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-8 text-center">
              <p className="text-sm text-[var(--text-primary)]">HTML 仪表盘已生成</p>
              {dashboardPath ? (
                <p className="mt-1 text-[12px] text-[var(--text-tertiary)] break-all">{dashboardPath}</p>
              ) : (
                <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">正在保存文件…</p>
              )}
              {dashboardPath && (
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => api.revealFile(dashboardPath)}>在 Finder 中显示</Button>
                  <Button variant="primary" size="sm" onClick={() => api.openFile(dashboardPath)}>在浏览器中打开</Button>
                </div>
              )}
            </div>
          ) : (
            <PrdViewer markdown={text} isStreaming={isStreaming} />
          )}

          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
