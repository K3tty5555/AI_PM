import { useState, useEffect, useCallback } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api, type PrdStyleEntry, type PrdStyleContent } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

export function ToolPersonaPage() {
  const [tab, setTab] = useState<"analyze" | "list">("analyze")
  const [styles, setStyles] = useState<PrdStyleEntry[]>([])
  const [stylesLoading, setStylesLoading] = useState(false)
  const [activeStyle, setActiveStyle] = useState<string | null>(null)
  const [settingActive, setSettingActive] = useState<string | null>(null)
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set())
  const [styleContents, setStyleContents] = useState<Record<string, PrdStyleContent>>({})
  const [loadingContent, setLoadingContent] = useState<Set<string>>(new Set())

  const loadStyles = useCallback(async () => {
    setStylesLoading(true)
    try {
      const [data, active] = await Promise.all([api.listPrdStyles(), api.getActivePrdStyle()])
      setStyles(data)
      setActiveStyle(active)
    } catch {
      setStyles([])
    } finally {
      setStylesLoading(false)
    }
  }, [])

  const handleSetActive = useCallback(async (name: string) => {
    setSettingActive(name)
    try {
      await api.setActivePrdStyle(name)
      setActiveStyle(name)
    } catch {
      // silently ignore
    } finally {
      setSettingActive(null)
    }
  }, [])

  const toggleExpand = useCallback(async (name: string) => {
    setExpandedStyles(prev => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name); return next }
      next.add(name)
      return next
    })
    if (!styleContents[name] && !loadingContent.has(name)) {
      setLoadingContent(prev => new Set(prev).add(name))
      try {
        const content = await api.getPrdStyleContent(name)
        setStyleContents(prev => ({ ...prev, [name]: content }))
      } catch { /* silently ignore */ } finally {
        setLoadingContent(prev => { const s = new Set(prev); s.delete(name); return s })
      }
    }
  }, [styleContents, loadingContent])

  const [filePath, setFilePath] = useState("")
  const [fileContent, setFileContent] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)
  const { text, isStreaming, isThinking, elapsedSeconds, error, run, reset } = useToolStream("ai-pm-persona")

  useEffect(() => {
    if (tab === "list") loadStyles()
  }, [tab, loadStyles])

  const handleSelectFile = useCallback(async () => {
    const selected = await openDialog({ filters: [{ name: "Markdown", extensions: ["md"] }] })
    if (selected && typeof selected === "string") {
      setFilePath(selected)
      try {
        const content = await api.readFile(selected)
        setFileContent(content)
        setFileError(null)
      } catch (err) {
        setFileError(String(err))
      }
    }
  }, [])

  const handleAnalyze = useCallback(() => {
    if (!fileContent) return
    reset()
    run(`请分析以下 PRD 文档的写作风格，生成风格档案：\n\n${fileContent}`)
  }, [fileContent, run, reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">产品分身</h1>
        <span className="text-sm text-[var(--text-secondary)]">产品分身 — 学习你的写作风格</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Tab 切换 */}
      <div className="mt-4 flex gap-0">
        {(["analyze", "list"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-xs transition-colors",
              tab === t
                ? "border-b-2 border-[var(--accent-color)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t === "analyze" ? "分析文档" : "已保存风格"}
          </button>
        ))}
      </div>

      {tab === "analyze" && (
        <div className="mt-6">
          {!isStreaming && !text && (
            <>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">
                上传你写的 PRD 文件，AI 将分析你的写作风格、措辞习惯和结构偏好
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={filePath}
                  readOnly
                  placeholder="选择 .md 文件..."
                  className={cn(
                    "flex-1 h-9 px-3 text-sm",
                    "bg-transparent border border-[var(--border)]",
                    "placeholder:text-[var(--text-secondary)]",
                    "outline-none"
                  )}
                />
                <Button variant="ghost" size="sm" onClick={handleSelectFile}>选择文件</Button>
              </div>
              {fileError && (
                <p className="mt-2 text-xs text-[var(--destructive)]">{fileError}</p>
              )}
              {fileContent && (
                <div className="mt-3 flex justify-end">
                  <Button variant="primary" onClick={handleAnalyze}>开始分析</Button>
                </div>
              )}
            </>
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
              <Button variant="ghost" size="sm" onClick={() => { reset(); setFileContent(""); setFilePath(""); setFileError(null) }} className="mt-2">重置</Button>
            </div>
          )}

          {text && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] text-[var(--text-secondary)]">风格分析结果</span>
                {!isStreaming && (
                  <Button variant="ghost" size="sm" onClick={() => { reset(); setFileContent(""); setFilePath(""); setFileError(null) }}>重新分析</Button>
                )}
              </div>
              <PrdViewer markdown={text} isStreaming={isStreaming} />
            </div>
          )}
        </div>
      )}

      {tab === "list" && (
        <div className="mt-6">
          {stylesLoading ? (
            <p className="text-sm text-[var(--text-secondary)]">加载中···</p>
          ) : styles.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--text-secondary)]">暂无已保存的风格档案</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                在「分析文档」tab 上传 PRD 后可生成风格档案，或在「设置 → 模板迁移」从旧版 AI PM 导入
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {styles.map((s) => (
                <div
                  key={s.name}
                  className="rounded-lg border border-[var(--border)] transition-colors hover:border-[var(--accent-color)]/40"
                >
                  {/* 头部：点击展开/折叠 */}
                  <div
                    className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3"
                    onClick={() => toggleExpand(s.name)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                      {s.hasPersona && (
                        <span className="rounded-full bg-[var(--accent-color)]/10 px-2 py-0.5 text-[10px] text-[var(--accent-color)]">
                          含分身档案
                        </span>
                      )}
                      {activeStyle === s.name && (
                        <span className="rounded-full bg-[var(--accent-color)]/15 px-2 py-0.5 text-[10px] text-[var(--accent-color)] font-medium">
                          当前默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {activeStyle !== s.name && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleSetActive(s.name) }}
                          disabled={settingActive === s.name}
                        >
                          {settingActive === s.name ? "设置中..." : "设为默认"}
                        </Button>
                      )}
                      <span
                        className={cn(
                          "text-[10px] text-[var(--text-tertiary)] transition-transform duration-200 inline-block",
                          expandedStyles.has(s.name) && "rotate-180"
                        )}
                      >
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* 展开内容 */}
                  {expandedStyles.has(s.name) && (
                    <div className="border-t border-[var(--border)] px-4 py-3">
                      {loadingContent.has(s.name) ? (
                        <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                      ) : styleContents[s.name] ? (
                        <PrdViewer
                          markdown={styleContents[s.name].profile ?? `\`\`\`json\n${styleContents[s.name].config}\n\`\`\``}
                          isStreaming={false}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
