import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { SkeletonList, SkeletonText } from "@/components/ui/skeleton"
import { PrdViewer } from "@/components/prd-viewer"
import { cn, copyRichText } from "@/lib/utils"
import { api } from "@/lib/tauri-api"
import { save } from "@tauri-apps/plugin-dialog"
import type { ToastVariant } from "@/hooks/use-toast"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HistoryListProps<T> {
  /** Load items from backend. Called on mount and when refreshKey changes. */
  loadItems: () => Promise<T[]>
  /** Read the full content for an item (by filename). */
  getContent: (filename: string) => Promise<string>
  /** Delete an item by filename. */
  deleteItem: (filename: string) => Promise<void>
  /** Extract the unique filename from an item. */
  getFilename: (item: T) => string
  /** Render the header row inside the clickable card button. */
  renderHeader: (item: T) => ReactNode
  /** Optional: render extra content below the PrdViewer for expanded items. */
  renderExtra?: (item: T, content: string) => ReactNode
  /** Transform raw content before displaying in PrdViewer. Default: identity. */
  transformContent?: (raw: string) => string
  /** Toast function from parent. */
  toast: (msg: string, variant?: ToastVariant) => void
  /** Message shown when list is empty. */
  emptyMessage?: string
  /** Bump this to trigger a reload. */
  refreshKey?: number
  /** Toolbar rendered above the list (e.g. search, time filter). */
  toolbar?: ReactNode
  /** Optional client-side filter applied after loadItems. */
  filterItems?: (items: T[]) => T[]
}

// ─── Component ──────────────────────────────────────────────────────────────

export function HistoryList<T>({
  loadItems,
  getContent,
  deleteItem,
  getFilename,
  renderHeader,
  renderExtra,
  transformContent,
  toast,
  emptyMessage = "暂无记录",
  refreshKey,
  toolbar,
  filterItems,
}: HistoryListProps<T>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const contentCache = useRef<Map<string, string>>(new Map())

  // Load items
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await loadItems()
      setItems(list)
      setExpandedFile(null)
      setConfirmDelete(null)
    } catch {
      // Error already logged by safeInvoke
    } finally {
      setLoading(false)
    }
  }, [loadItems])

  useEffect(() => { load() }, [load, refreshKey])

  // Expand / collapse
  const handleExpand = useCallback(async (filename: string) => {
    if (expandedFile === filename) {
      setExpandedFile(null)
      return
    }
    setExpandedFile(filename)
    if (contentCache.current.has(filename)) return

    setLoadingFile(filename)
    try {
      const raw = await getContent(filename)
      contentCache.current.set(filename, raw)
    } catch {
      toast("读取记录失败", "error")
      setExpandedFile(null)
    } finally {
      setLoadingFile(null)
    }
  }, [expandedFile, getContent, toast])

  // Delete
  const handleDelete = useCallback(async (filename: string) => {
    try {
      await deleteItem(filename)
      setItems((prev) => prev.filter((item) => getFilename(item) !== filename))
      setExpandedFile((prev) => (prev === filename ? null : prev))
      contentCache.current.delete(filename)
      setConfirmDelete(null)
      toast("已删除", "success")
    } catch {
      toast("删除失败", "error")
    }
  }, [deleteItem, getFilename, toast])

  // Export
  const handleExport = useCallback(async (filename: string) => {
    try {
      const content = contentCache.current.get(filename) ?? await getContent(filename)
      const savePath = await save({
        defaultPath: filename,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      })
      if (savePath) {
        await api.writeFile(savePath, content)
        toast("已导出", "success")
      }
    } catch {
      toast("导出失败", "error")
    }
  }, [getContent, toast])

  // Copy — with fallback to fetch content when cache misses
  const handleCopy = useCallback(async (filename: string) => {
    try {
      const raw = contentCache.current.get(filename) ?? await getContent(filename)
      const display = transformContent ? transformContent(raw) : raw
      await copyRichText(display)
      toast("已复制富文本", "success")
    } catch {
      toast("复制失败", "error")
    }
  }, [getContent, transformContent, toast])

  // Apply optional client-side filter
  const displayItems = filterItems ? filterItems(items) : items

  return (
    <div className="mt-4">
      {toolbar}

      {loading ? (
        <SkeletonList count={3} />
      ) : displayItems.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-2 animate-[fadeInUp_300ms_cubic-bezier(0.16,1,0.3,1)]">
          <p className="text-sm text-[var(--text-tertiary)]">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayItems.map((item) => {
            const filename = getFilename(item)
            const isExpanded = expandedFile === filename
            const cached = isExpanded ? contentCache.current.get(filename) : undefined

            return (
              <div key={filename} className="rounded-lg border border-[var(--border)] overflow-hidden">
                {/* Card header */}
                <button
                  onClick={() => handleExpand(filename)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--hover-bg)] transition-colors text-left"
                >
                  {renderHeader(item)}
                  <svg
                    className={cn("w-4 h-4 text-[var(--text-tertiary)] transition-transform shrink-0", isExpanded && "rotate-180")}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] animate-[fadeInUp_200ms_cubic-bezier(0.16,1,0.3,1)]">
                    <div className={cn(
                      "flex justify-end gap-1 px-4 py-2 border-b border-[var(--border)]",
                      confirmDelete === filename
                        ? "bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)]"
                        : "bg-[var(--secondary)]"
                    )}>
                      <Button variant="ghost" size="sm" onClick={() => handleExport(filename)}>导出</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(filename)}>复制</Button>
                      {confirmDelete === filename ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-[var(--text-tertiary)]">确认删除？</span>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(filename)} className="text-[var(--destructive)]">删除</Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>取消</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(filename)} className="text-[var(--text-tertiary)]">删除</Button>
                      )}
                    </div>
                    <div className="px-4 py-4">
                      {loadingFile === filename && !contentCache.current.has(filename) ? (
                        <SkeletonText lines={5} />
                      ) : cached != null ? (
                        <>
                          <PrdViewer
                            markdown={transformContent ? transformContent(cached) : cached}
                            isStreaming={false}
                          />
                          {renderExtra?.(item, cached)}
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
