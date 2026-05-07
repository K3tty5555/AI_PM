import { useState, useCallback, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { ProjectSelector } from "@/components/project-selector"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Scope = "auto" | "fullstack" | "frontend" | "backend"

const SCOPE_LABELS: Record<Scope, string> = {
  auto: "自动识别",
  fullstack: "全栈",
  frontend: "纯前端",
  backend: "纯后端",
}

const PROJECT_FILE_OPTIONS = [
  { file: "01-requirement-draft.md", label: "需求草稿" },
  { file: "02-analysis-report.md", label: "分析报告" },
  { file: "04-user-stories.md", label: "用户故事" },
  { file: "05-prd/05-PRD-v1.0.md", label: "PRD v1.0" },
]

export function ToolMultiReviewPage() {
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const initialProjectId = searchParams.get("projectId") ?? localStorage.getItem("tool-binding:multi-review") ?? null
  const [boundProjectId, setBoundProjectId] = useState<string | null>(initialProjectId)
  const [content, setContent] = useState("")
  const [scope, setScope] = useState<Scope>("auto")
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup")
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("multi-perspective-review", { projectId: boundProjectId ?? undefined })

  useEffect(() => {
    if (!isStreaming && phase === "running" && text) {
      setPhase("done")
    }
  }, [isStreaming, phase, text])

  const handleLoadFromProject = useCallback(async (file: string) => {
    if (!boundProjectId) {
      toast("请先绑定项目", "error")
      return
    }
    setLoadingFile(file)
    try {
      const raw = await api.readProjectFile(boundProjectId, file)
      if (!raw || !raw.trim()) {
        toast(`文件为空：${file}`, "error")
        return
      }
      setContent(raw)
      toast(`已载入 ${file}`, "success")
    } catch (e) {
      toast(`读取失败：${String(e)}`, "error")
    } finally {
      setLoadingFile(null)
    }
  }, [boundProjectId, toast])

  const handleStart = useCallback(() => {
    if (!content.trim() || content.trim().length < 50) {
      toast("文档内容过短（< 50 字符），不值得审视", "error")
      return
    }
    reset()
    setPhase("running")
    const prefix = scope === "auto" ? "" : `（请直接按"${SCOPE_LABELS[scope]}"范围派发审视者，跳过自动识别。）\n\n`
    run(prefix + content.trim())
  }, [content, scope, run, reset, toast])

  const handleReset = useCallback(() => {
    reset()
    setPhase("setup")
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 25)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">多视角审视</h1>
        <span className="text-sm text-[var(--text-secondary)]">设计方案 / 实施计划定稿前的多角色质量把关</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      <ProjectSelector
        toolKey="multi-review"
        value={boundProjectId}
        onChange={setBoundProjectId}
        className="mt-4"
      />

      {/* Setup */}
      {phase === "setup" && (
        <div className="mt-6 space-y-5">
          {/* Quick load from project */}
          {boundProjectId && (
            <div>
              <p className="mb-2 text-sm text-[var(--text-secondary)]">从项目快速载入文档</p>
              <div className="flex flex-wrap gap-2">
                {PROJECT_FILE_OPTIONS.map((opt) => (
                  <button
                    key={opt.file}
                    type="button"
                    onClick={() => handleLoadFromProject(opt.file)}
                    disabled={loadingFile === opt.file}
                    className={cn(
                      "rounded-md border border-[var(--border)] px-3 py-1.5 text-xs",
                      "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      "hover:bg-[var(--hover-bg)] active:scale-[0.97] transition-all cursor-pointer",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {loadingFile === opt.file ? "载入中..." : opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Document content */}
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              粘贴或编辑待审视文档（设计方案 / 实施计划 / PRD 章节均可）
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"例：\n# 多版本 PRD 元数据化方案\n\n## 背景\n客户端硬编码识别 05-PRD-v{N}.0.md，无法识别业务命名。\n\n## 方案\n_status.json 加 prd_versions: [{ file, label, ts, parent }]，前端读元数据兜底文件名扫描。"}
              rows={14}
              className={cn(
                "w-full rounded-lg px-4 py-3 text-sm font-mono",
                "bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-tertiary)]",
                "outline-none resize-y",
                "focus:border-[var(--accent-color)] transition-[border-color]",
              )}
            />
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {content.trim().length} 字符
              {content.trim().length > 0 && content.trim().length < 50 && (
                <span className="ml-2 text-[var(--destructive)]">过短，建议 ≥ 50 字符</span>
              )}
            </p>
          </div>

          {/* Scope */}
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">审视范围</p>
            <div className="flex gap-2">
              {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs transition-all active:scale-[0.97] cursor-pointer",
                    scope === s
                      ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]",
                  )}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {scope === "auto"
                ? "由 skill 根据文档关键词自动判定（推荐）"
                : `跳过自动识别，强制按"${SCOPE_LABELS[scope]}"派发审视者`}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleStart}
              disabled={!content.trim() || content.trim().length < 50}
            >
              开始审视
            </Button>
          </div>
        </div>
      )}

      {/* Running / Done */}
      {phase !== "setup" && (
        <div className="mt-6">
          {isStreaming && (
            <div className="mb-4">
              <ProgressBar value={progressValue} animated />
              {isThinking && (
                <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">
                  并行派发审视者中...
                </p>
              )}
              <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                {String(elapsedSeconds % 60).padStart(2, "0")}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
            </div>
          )}

          <PrdViewer markdown={text} isStreaming={isStreaming} />

          {!isStreaming && phase === "done" && streamMeta && (
            <p className="mt-4 text-xs text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}

          {!isStreaming && phase === "done" && (
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={handleReset}>重新审视</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
