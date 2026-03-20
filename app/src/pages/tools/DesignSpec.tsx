import { useState, useEffect, useCallback, useRef } from "react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, type UiSpecEntry, type UiSpecContent } from "@/lib/tauri-api"
import { PrdViewer } from "@/components/prd-viewer"
import { cn } from "@/lib/utils"

// 将嵌套 color 对象打平，过滤出合法颜色值
function flattenColorObj(obj: unknown, prefix = ''): Array<{ name: string; value: string }> {
  if (typeof obj === 'string' && /^#[0-9a-fA-F]{3,8}$|^rgb/.test(obj)) {
    return [{ name: prefix, value: obj }]
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenColorObj(v, prefix ? `${prefix}.${k}` : k)
  )
}

// 按顶层分组返回颜色
function parseColorGroups(tokensRaw: string): Array<{ label: string; colors: Array<{ name: string; value: string }> }> {
  try {
    const tokens = JSON.parse(tokensRaw)
    const colors = tokens.colors ?? tokens.color ?? tokens.palette ?? {}
    if (typeof colors !== 'object' || colors === null) return []
    return Object.entries(colors as Record<string, unknown>)
      .map(([groupKey, groupVal]) => ({
        label: groupKey,
        colors: flattenColorObj(groupVal, ''),
      }))
      .filter(g => g.colors.length > 0)
  } catch { return [] }
}

// 提取字体字号列表
function parseTypography(tokensRaw: string): Array<{ label: string; size: string }> {
  try {
    const tokens = JSON.parse(tokensRaw)
    const typo = tokens.typography ?? {}
    const sizes: unknown =
      typo.sizes ?? typo.fontSize ?? typo.fontSizes ??
      tokens.fontSizes ?? tokens.fontSize ?? null
    if (!sizes || typeof sizes !== 'object') return []
    return Object.entries(sizes as Record<string, unknown>)
      .map(([k, v]) => ({ label: k, size: String(v) }))
      .filter(t => /\d/.test(t.size))
      .slice(0, 6)
  } catch { return [] }
}

// 提取 Playground 渲染用 token 值
function extractPlaygroundTokens(tokensRaw: string) {
  try {
    const tokens = JSON.parse(tokensRaw)
    const c = tokens.colors ?? tokens.color ?? tokens.palette ?? {}
    const primary   = (typeof c.primary === 'object' && c.primary !== null ? c.primary.main : null) ?? (typeof c.primary === 'string' ? c.primary : null) ?? '#1D4ED8'
    const success   = c.semantic?.success ?? c.status?.success ?? (typeof c.success === 'object' ? c.success?.main : c.success) ?? '#16a34a'
    const warning   = c.semantic?.warning ?? c.status?.warning ?? (typeof c.warning === 'object' ? c.warning?.main : c.warning) ?? '#d97706'
    const error     = c.semantic?.error   ?? c.status?.error   ?? (typeof c.error   === 'object' ? c.error?.main   : c.error)   ?? '#dc2626'
    const successBg = c.semantic?.successBg ?? '#f0fdf4'
    const warningBg = c.semantic?.warningBg ?? '#fffbeb'
    const errorBg   = c.semantic?.errorBg   ?? '#fef2f2'
    const radius = tokens.borderRadius?.md ?? tokens.radii?.md ?? tokens.radius?.md ?? '8px'
    const shadow = tokens.shadows?.md ?? tokens.shadow?.md ?? tokens.elevation?.md ?? '0 1px 8px rgba(0,0,0,0.08)'
    return { primary, success, warning, error, successBg, warningBg, errorBg, radius, shadow }
  } catch {
    return {
      primary: '#1D4ED8', success: '#16a34a', warning: '#d97706', error: '#dc2626',
      successBg: '#f0fdf4', warningBg: '#fffbeb', errorBg: '#fef2f2',
      radius: '8px', shadow: '0 1px 8px rgba(0,0,0,0.08)',
    }
  }
}

export function ToolDesignSpecPage() {
  const [specs, setSpecs] = useState<UiSpecEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set())
  const [specContents, setSpecContents] = useState<Record<string, UiSpecContent>>({})
  const [loadingContent, setLoadingContent] = useState<Set<string>>(new Set())

  // Inline rename state
  const [editingSpec, setEditingSpec] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renamingSpec, setRenamingSpec] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const isConfirmingRef = useRef(false)

  // Delete state
  const [deletingSpec, setDeletingSpec] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const startRename = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSpec(name)
    setRenameInput(name)
    setRenameError(null)
    isConfirmingRef.current = false
  }, [])

  const cancelRename = useCallback(() => {
    setEditingSpec(null)
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
    setRenamingSpec(oldName)
    setRenameError(null)
    try {
      await api.renameUiSpec(oldName, newName)
      setSpecs(prev => prev.map(s => s.name === oldName ? { ...s, name: newName } : s))
      setExpandedSpecs(prev => {
        const next = new Set(prev)
        if (next.has(oldName)) { next.delete(oldName); next.add(newName) }
        return next
      })
      setSpecContents(prev => {
        if (!prev[oldName]) return prev
        const next = { ...prev, [newName]: prev[oldName] }
        delete next[oldName]
        return next
      })
      setEditingSpec(null)
      setRenameInput("")
    } catch (err) {
      setRenameError(String(err))
      isConfirmingRef.current = false
    } finally {
      setRenamingSpec(null)
    }
  }, [renameInput, cancelRename])

  const handleDelete = useCallback(async (name: string) => {
    setDeletingSpec(name)
    try {
      await api.deleteUiSpec(name)
      setSpecs(prev => prev.filter(s => s.name !== name))
      setExpandedSpecs(prev => { const n = new Set(prev); n.delete(name); return n })
      setSpecContents(prev => { const n = { ...prev }; delete n[name]; return n })
    } catch (err) {
      console.error("[DesignSpec] delete failed", err)
    } finally {
      setDeletingSpec(null)
      setDeleteConfirm(null)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await api.listUiSpecs()
      setSpecs(data)
    } catch {
      setSpecs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = useCallback(async () => {
    const selected = await dialogOpen({ directory: true, multiple: false })
    if (!selected || typeof selected !== "string") return
    setAdding(true)
    setAddError(null)
    try {
      await api.addUiSpec(selected)
      await load()
    } catch (err) {
      setAddError(typeof err === "string" ? err : String(err))
    } finally {
      setAdding(false)
    }
  }, [load])

  const toggleExpand = useCallback(async (name: string) => {
    setExpandedSpecs(prev => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name); return next }
      next.add(name)
      return next
    })
    if (!specContents[name] && !loadingContent.has(name)) {
      setLoadingContent(prev => new Set(prev).add(name))
      try {
        const content = await api.getUiSpecContent(name)
        setSpecContents(prev => ({ ...prev, [name]: content }))
      } catch { /* silently ignore */ } finally {
        setLoadingContent(prev => { const s = new Set(prev); s.delete(name); return s })
      }
    }
  }, [specContents, loadingContent])

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">设计规范</h1>
          <span className="text-sm text-[var(--text-secondary)]">UI 视觉规范库</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleAdd} disabled={adding} className="gap-1.5">
          {adding ? "导入中..." : "+ 上传规范"}
        </Button>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {addError && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-2">
          <p className="text-sm text-[var(--destructive)]">{addError}</p>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">加载中···</p>
      ) : specs.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[var(--text-secondary)]">尚未上传任何 UI 规范</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            点击右上角「上传规范」，选择包含 README.md 或 design-tokens.json 的规范目录
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {specs.map((spec) => (
            <div
              key={spec.name}
              className="rounded-lg border border-[var(--border)] transition-colors hover:border-[var(--accent-color)]/40"
            >
              {/* 头部 */}
              <div
                className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3"
                onClick={() => editingSpec !== spec.name && toggleExpand(spec.name)}
              >
                <div className="flex items-center gap-2 min-w-0 group">
                  {editingSpec === spec.name ? (
                    <div className="flex flex-col gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameInput}
                          onChange={(e) => { setRenameInput(e.target.value); setRenameError(null) }}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); confirmRename(spec.name) }
                            else if (e.key === "Escape") { e.preventDefault(); cancelRename() }
                          }}
                          onBlur={() => confirmRename(spec.name)}
                          disabled={renamingSpec === spec.name}
                          className={cn(
                            "h-7 px-2 text-sm font-medium rounded border bg-transparent outline-none",
                            renameError
                              ? "border-[var(--destructive)] text-[var(--destructive)]"
                              : "border-[var(--accent-color)] text-[var(--text-primary)]"
                          )}
                        />
                        {renamingSpec === spec.name && (
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
                      <span className="text-sm font-medium text-[var(--text-primary)]">{spec.name}</span>
                      <button
                        onClick={(e) => startRename(spec.name, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-[var(--accent-color)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-color)] shrink-0"
                        title="重命名"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(spec.name) }}
                        title="删除规范"
                        disabled={deletingSpec === spec.name}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                {editingSpec !== spec.name && (
                  <span
                    className={cn(
                      "text-[10px] text-[var(--text-tertiary)] transition-transform duration-200 inline-block shrink-0",
                      expandedSpecs.has(spec.name) && "rotate-180"
                    )}
                  >
                    ▼
                  </span>
                )}
              </div>

              {/* 展开内容 */}
              {expandedSpecs.has(spec.name) && (
                <div className="border-t border-[var(--border)] px-4 py-4 space-y-5">
                  {loadingContent.has(spec.name) ? (
                    <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                  ) : specContents[spec.name] ? (() => {
                    const sc = specContents[spec.name]
                    const colorGroups = sc.tokensRaw ? parseColorGroups(sc.tokensRaw) : []
                    const typography = sc.tokensRaw ? parseTypography(sc.tokensRaw) : []
                    const pt = sc.tokensRaw ? extractPlaygroundTokens(sc.tokensRaw) : null

                    return (
                      <>
                        {/* README */}
                        {sc.readme && (
                          <PrdViewer markdown={sc.readme} isStreaming={false} />
                        )}

                        {/* 颜色系统（分组） */}
                        {colorGroups.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">颜色系统</p>
                            <div className="space-y-2">
                              {colorGroups.map(group => (
                                <div key={group.label}>
                                  <p className="mb-1 text-[10px] text-[var(--text-tertiary)] capitalize">{group.label}</p>
                                  <div className="flex flex-wrap gap-2">
                                    {group.colors.map(c => (
                                      <div key={c.name} className="flex items-center gap-1.5">
                                        <span
                                          className="size-4 rounded-sm border border-[var(--border)] shrink-0"
                                          style={{ backgroundColor: c.value }}
                                          title={c.value}
                                        />
                                        <span className="text-[10px] text-[var(--text-secondary)]">{c.name || c.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 字体排版 */}
                        {typography.length > 0 && pt && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">字体排版</p>
                            <div className="space-y-1">
                              {typography.map(t => (
                                <div key={t.label} className="flex items-baseline gap-3">
                                  <span style={{ fontSize: t.size, color: pt.primary, lineHeight: 1.3 }}>
                                    这是{t.label}文字
                                  </span>
                                  <span className="text-[10px] text-[var(--text-tertiary)]">{t.size}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 组件 Playground */}
                        {pt && (
                          <div>
                            <p className="mb-3 text-xs font-medium text-[var(--text-tertiary)]">组件预览</p>
                            <div className="space-y-3">
                              {/* 按钮 */}
                              <div className="flex flex-wrap gap-2">
                                <button style={{
                                  background: pt.primary, color: '#fff', border: 'none',
                                  borderRadius: pt.radius, padding: '7px 16px', fontSize: 13,
                                  cursor: 'default', fontWeight: 500,
                                }}>主要按钮</button>
                                <button style={{
                                  background: 'transparent', color: pt.primary,
                                  border: `1.5px solid ${pt.primary}`,
                                  borderRadius: pt.radius, padding: '6px 16px', fontSize: 13,
                                  cursor: 'default',
                                }}>次要按钮</button>
                                <button style={{
                                  background: pt.error, color: '#fff', border: 'none',
                                  borderRadius: pt.radius, padding: '7px 16px', fontSize: 13,
                                  cursor: 'default', fontWeight: 500,
                                }}>危险操作</button>
                              </div>

                              {/* 输入框 */}
                              <div className="flex flex-wrap gap-2">
                                <input
                                  readOnly
                                  placeholder="默认状态..."
                                  style={{
                                    border: '1.5px solid #d1d5db',
                                    borderRadius: pt.radius, padding: '7px 12px',
                                    fontSize: 13, outline: 'none',
                                    width: 130,
                                    background: '#fff', color: '#374151',
                                  }}
                                />
                                <input
                                  readOnly
                                  placeholder="聚焦状态..."
                                  style={{
                                    border: `1.5px solid ${pt.primary}`,
                                    borderRadius: pt.radius, padding: '7px 12px',
                                    fontSize: 13, outline: 'none',
                                    width: 130,
                                    background: '#fff', color: '#374151',
                                    boxShadow: `0 0 0 3px ${pt.primary}22`,
                                  }}
                                />
                              </div>

                              {/* 状态徽章 */}
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { label: '成功', bg: pt.successBg, color: pt.success },
                                  { label: '警告', bg: pt.warningBg, color: pt.warning },
                                  { label: '错误', bg: pt.errorBg,   color: pt.error   },
                                ].map(b => (
                                  <span key={b.label} style={{
                                    background: b.bg, color: b.color,
                                    borderRadius: 99, padding: '3px 10px',
                                    fontSize: 12, fontWeight: 500,
                                  }}>{b.label}</span>
                                ))}
                              </div>

                              {/* 卡片 */}
                              <div style={{
                                background: '#fff',
                                borderRadius: pt.radius,
                                boxShadow: pt.shadow,
                                padding: '12px 16px',
                                maxWidth: 280,
                              }}>
                                <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>卡片标题</p>
                                <p style={{ fontSize: 12, color: '#6b7280' }}>这是卡片内容区域，展示圆角和阴影效果。</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {!sc.readme && colorGroups.length === 0 && (
                          <p className="text-xs text-[var(--text-tertiary)]">暂无可展示内容</p>
                        )}
                      </>
                    )
                  })() : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirm(null)}>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-[var(--shadow-xl)] w-80" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[var(--text-primary)]">删除「{deleteConfirm}」？</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">规范目录将被永久删除，无法恢复。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all duration-150 active:scale-[0.97]">
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deletingSpec === deleteConfirm}
                className="rounded-lg bg-[var(--destructive)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50 transition-all duration-150 active:scale-[0.97]"
              >
                {deletingSpec === deleteConfirm ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
