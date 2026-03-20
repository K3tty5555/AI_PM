import { useState, useEffect, useCallback, useRef } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Pencil, Trash2 } from "lucide-react"
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

  // Inline rename state
  const [editingStyle, setEditingStyle] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renamingStyle, setRenamingStyle] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const isConfirmingRef = useRef(false)

  const startRename = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingStyle(name)
    setRenameInput(name)
    setRenameError(null)
    isConfirmingRef.current = false
  }, [])

  const cancelRename = useCallback(() => {
    setEditingStyle(null)
    setRenameInput("")
    setRenameError(null)
    isConfirmingRef.current = false
  }, [])

  const confirmRename = useCallback(async (oldName: string) => {
    if (isConfirmingRef.current) return
    const newName = renameInput.trim()
    if (!newName) {
      setRenameError("名称不能为空")
      return
    }
    if (newName === oldName) {
      cancelRename()
      return
    }
    isConfirmingRef.current = true
    setRenamingStyle(oldName)
    setRenameError(null)
    try {
      await api.renamePrdStyle(oldName, newName)
      setStyles(prev => prev.map(s => s.name === oldName ? { ...s, name: newName } : s))
      if (activeStyle === oldName) setActiveStyle(newName)
      setExpandedStyles(prev => {
        const next = new Set(prev)
        if (next.has(oldName)) { next.delete(oldName); next.add(newName) }
        return next
      })
      setStyleContents(prev => {
        if (!prev[oldName]) return prev
        const next = { ...prev, [newName]: prev[oldName] }
        delete next[oldName]
        return next
      })
      setEditingStyle(null)
      setRenameInput("")
    } catch (err) {
      setRenameError(String(err))
      isConfirmingRef.current = false
    } finally {
      setRenamingStyle(null)
    }
  }, [renameInput, activeStyle, cancelRename])

  const [deletingStyle, setDeletingStyle] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const handleDelete = useCallback(async (name: string) => {
    setDeletingStyle(name)
    try {
      await api.deletePrdStyle(name)
      setStyles(prev => prev.filter(s => s.name !== name))
      if (activeStyle === name) setActiveStyle(null)
      setExpandedStyles(prev => { const n = new Set(prev); n.delete(name); return n })
      setStyleContents(prev => { const n = { ...prev }; delete n[name]; return n })
    } catch (err) {
      console.error("Failed to delete style:", err)
    } finally {
      setDeletingStyle(null)
      setDeleteConfirm(null)
    }
  }, [activeStyle])

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
                    onClick={() => editingStyle !== s.name && toggleExpand(s.name)}
                  >
                    <div className="flex items-center gap-2 min-w-0 group">
                      {editingStyle === s.name ? (
                        <div className="flex flex-col gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={renameInput}
                              onChange={(e) => { setRenameInput(e.target.value); setRenameError(null) }}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); confirmRename(s.name) }
                                else if (e.key === "Escape") { e.preventDefault(); cancelRename() }
                              }}
                              onBlur={() => confirmRename(s.name)}
                              disabled={renamingStyle === s.name}
                              className={cn(
                                "h-7 px-2 text-sm font-medium rounded border bg-transparent outline-none",
                                renameError
                                  ? "border-[var(--destructive)] text-[var(--destructive)]"
                                  : "border-[var(--accent-color)] text-[var(--text-primary)]"
                              )}
                            />
                            {renamingStyle === s.name && (
                              <svg className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                              </svg>
                            )}
                          </div>
                          {renameError && (
                            <span className="text-[10px] text-[var(--destructive)]">{renameError}</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                          <button
                            onClick={(e) => startRename(s.name, e)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-[var(--accent-color)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-color)] shrink-0"
                            title="重命名"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(s.name) }}
                            title="删除风格"
                            disabled={deletingStyle === s.name}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {editingStyle !== s.name && s.hasPersona && (
                        <span className="rounded-full bg-[var(--accent-color)]/10 px-2 py-0.5 text-[10px] text-[var(--accent-color)]">
                          含分身档案
                        </span>
                      )}
                      {editingStyle !== s.name && activeStyle === s.name && (
                        <span className="rounded-full bg-[var(--accent-color)]/15 px-2 py-0.5 text-[10px] text-[var(--accent-color)] font-medium">
                          当前默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {activeStyle !== s.name && editingStyle !== s.name && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleSetActive(s.name) }}
                          disabled={settingActive === s.name}
                        >
                          {settingActive === s.name ? "设置中..." : "设为默认"}
                        </Button>
                      )}
                      {editingStyle !== s.name && (
                        <span
                          className={cn(
                            "text-[10px] text-[var(--text-tertiary)] transition-transform duration-200 inline-block",
                            expandedStyles.has(s.name) && "rotate-180"
                          )}
                        >
                          ▼
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 展开内容 */}
                  {expandedStyles.has(s.name) && (
                    <div className="border-t border-[var(--border)] px-4 py-3">
                      {loadingContent.has(s.name) ? (
                        <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                      ) : styleContents[s.name] ? (() => {
                        const c = styleContents[s.name]
                        if (c.sample) {
                          return (
                            <div>
                              <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">风格示例</p>
                              <PrdViewer markdown={c.sample} isStreaming={false} />
                            </div>
                          )
                        }
                        // Format profile or config JSON into readable summary
                        const jsonStr = c.profile ?? c.config
                        const label = c.profile ? '风格档案' : '风格配置'
                        let parsed: Record<string, unknown> | null = null
                        try { parsed = JSON.parse(jsonStr) } catch { /* not valid JSON */ }
                        if (parsed) {
                          const rows = Object.entries(parsed)
                            .filter(([, v]) => v !== null && v !== undefined && v !== "")
                            .map(([k, v]) => {
                              const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
                              return `| ${k} | ${val.replace(/\n/g, ' ')} |`
                            })
                          const md = `| 属性 | 值 |\n|---|---|\n${rows.join('\n')}`
                          return (
                            <div>
                              <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">{label}</p>
                              <PrdViewer markdown={md} isStreaming={false} />
                            </div>
                          )
                        }
                        return (
                          <div>
                            <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">{label}</p>
                            <PrdViewer markdown={`\`\`\`json\n${jsonStr}\n\`\`\``} isStreaming={false} />
                          </div>
                        )
                      })() : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirm(null)}>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl w-80" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[var(--text-primary)]">删除「{deleteConfirm}」？</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">风格目录将被永久删除，无法恢复。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--hover-bg)]">
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deletingStyle === deleteConfirm}
                className="rounded-lg bg-[var(--destructive)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                {deletingStyle === deleteConfirm ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
