import { useState, useEffect, useCallback } from "react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { api, type UiSpecEntry, type UiSpecContent } from "@/lib/tauri-api"
import { PrdViewer } from "@/components/prd-viewer"
import { cn } from "@/lib/utils"

function parseColors(tokensRaw: string): Array<{ name: string; value: string }> {
  try {
    const tokens = JSON.parse(tokensRaw)
    const colors = tokens.colors ?? tokens.color ?? {}
    return Object.entries(colors).map(([name, value]) => ({
      name,
      value: typeof value === 'string' ? value : (value as { value?: string }).value ?? ''
    })).filter(c => c.value)
  } catch {
    return []
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
    if (!specContents[name]) {
      setLoadingContent(prev => new Set(prev).add(name))
      try {
        const content = await api.getUiSpecContent(name)
        setSpecContents(prev => ({ ...prev, [name]: content }))
      } catch { /* silently ignore */ } finally {
        setLoadingContent(prev => { const s = new Set(prev); s.delete(name); return s })
      }
    }
  }, [specContents])

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
                className="flex cursor-pointer items-center justify-between px-4 py-3"
                onClick={() => toggleExpand(spec.name)}
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">{spec.name}</span>
                <span
                  className={cn(
                    "text-[10px] text-[var(--text-tertiary)] transition-transform duration-200 inline-block",
                    expandedSpecs.has(spec.name) && "rotate-180"
                  )}
                >
                  ▼
                </span>
              </div>

              {/* 展开内容 */}
              {expandedSpecs.has(spec.name) && (
                <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">
                  {loadingContent.has(spec.name) ? (
                    <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                  ) : specContents[spec.name] ? (
                    <>
                      {specContents[spec.name].tokensRaw && (() => {
                        const colors = parseColors(specContents[spec.name].tokensRaw!)
                        return colors.length > 0 ? (
                          <div>
                            <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">颜色</p>
                            <div className="flex flex-wrap gap-3">
                              {colors.map(c => (
                                <div key={c.name} className="flex items-center gap-1.5">
                                  <span
                                    className="size-4 rounded-sm border border-[var(--border)] shrink-0"
                                    style={{ backgroundColor: c.value }}
                                  />
                                  <span className="text-[11px] text-[var(--text-secondary)]">{c.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null
                      })()}
                      {specContents[spec.name].readme && (
                        <PrdViewer markdown={specContents[spec.name].readme!} isStreaming={false} />
                      )}
                      {!specContents[spec.name].readme && !specContents[spec.name].tokensRaw && (
                        <p className="text-xs text-[var(--text-tertiary)]">暂无可展示内容</p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
