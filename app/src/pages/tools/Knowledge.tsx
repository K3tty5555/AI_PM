import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { api, type KnowledgeEntry } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"
import { X, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const CATEGORIES = [
  { key: "patterns",   label: "最佳模式" },
  { key: "decisions",  label: "决策记录" },
  { key: "pitfalls",   label: "踩坑经验" },
  { key: "metrics",    label: "指标设计" },
  { key: "playbooks",  label: "打法手册" },
  { key: "insights",   label: "产品洞察" },
]

export function ToolKnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [activeCategory, setActiveCategory] = useState("pitfalls")
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<KnowledgeEntry[] | null>(null)
  const [drawerEntry, setDrawerEntry] = useState<KnowledgeEntry | null>(null)
  const [drawerContent, setDrawerContent] = useState("")
  const [drawerLoading, setDrawerLoading] = useState(false)

  const loadEntries = useCallback(async () => {
    try {
      const data = await api.listKnowledge()
      setEntries(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(() => {
      api.searchKnowledge(searchQuery).then(setSearchResults).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filtered = entries.filter((e) => e.category === activeCategory)

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setSaving(true)
    try {
      await api.addKnowledge({ category: activeCategory, title: newTitle.trim(), content: newContent.trim() })
      setNewTitle("")
      setNewContent("")
      setShowAdd(false)
      await loadEntries()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [activeCategory, newTitle, newContent, loadEntries])

  const handleDelete = useCallback(async (category: string, id: string) => {
    try {
      await api.deleteKnowledge(category, id)
      await loadEntries()
    } catch (err) {
      console.error("Failed to delete entry:", err)
    }
  }, [loadEntries])

  const handleOpenDrawer = useCallback(async (entry: KnowledgeEntry) => {
    setDrawerEntry(entry)
    setDrawerContent("")
    setDrawerLoading(true)
    try {
      const content = await api.getKnowledgeContent(entry.category, entry.id)
      setDrawerContent(content)
    } catch {
      setDrawerContent("_无法加载内容_")
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px] text-[var(--text-secondary)]">加载中···</span>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[var(--text-primary)]">知识库</h1>
          <span className="text-sm text-[var(--text-secondary)]">产品知识库</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "取消" : "+ 添加"}
        </Button>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* 搜索框 */}
      <div className="mt-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索知识库..."
          className={cn(
            "w-full rounded-lg h-9 px-3 text-sm",
            "bg-transparent border border-[var(--border)]",
            "placeholder:text-[var(--text-secondary)]",
            "outline-none focus:border-[var(--accent-color)] transition-[border-color]"
          )}
        />
      </div>

      {/* 分类标签：搜索时隐藏 */}
      {!searchResults && (
        <div className="mt-4 border-b border-[var(--border)] flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => {
            const count = entries.filter((e) => e.category === cat.key).length
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  activeCategory === cat.key
                    ? "border-b-2 border-[var(--accent-color)] text-[var(--text-primary)] font-medium"
                    : "border-b-2 border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {cat.label} {count > 0 && `(${count})`}
              </button>
            )
          })}
        </div>
      )}

      {/* 添加表单 */}
      {showAdd && (
        <div className="mt-4 rounded-lg border border-[var(--accent-color)]/30 p-4">
          <div className="mb-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="标题"
              className={cn(
                "w-full rounded-lg h-9 px-3 text-sm",
                "bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-secondary)]",
                "outline-none focus:border-[var(--accent-color)] transition-[border-color]"
              )}
            />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="内容（支持 Markdown）"
            rows={4}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-secondary)]",
              "outline-none resize-none focus:border-[var(--accent-color)] transition-[border-color]"
            )}
          />
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !newTitle.trim() || !newContent.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      )}

      {/* 条目列表 */}
      <div className="mt-4 space-y-2">
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
              未找到相关知识
            </p>
          ) : (
            searchResults.map((entry) => (
              <div key={`${entry.category}-${entry.id}`} className="group rounded-lg border border-[var(--border)] p-4 hover:border-[var(--accent-color)]/40 transition-colors cursor-pointer" onClick={() => handleOpenDrawer(entry)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--secondary)] px-1.5 py-0.5 rounded">
                        {CATEGORIES.find((c) => c.key === entry.category)?.label ?? entry.category}
                      </span>
                    </div>
                    <p className="font-medium text-sm text-[var(--text-primary)]">{entry.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                      {entry.content.replace(/^#[^\n]+\n+/, "").slice(0, 120)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(entry.category, entry.id) }}
                    className="shrink-0 text-[10px] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)] transition-opacity"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
            该分类暂无条目，点击右上角「+ 添加」记录第一条经验
          </p>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="group rounded-lg border border-[var(--border)] p-4 hover:border-[var(--accent-color)]/40 transition-colors cursor-pointer" onClick={() => handleOpenDrawer(entry)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[var(--text-primary)]">{entry.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                    {entry.content.replace(/^#[^\n]+\n+/, "").slice(0, 120)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(entry.category, entry.id) }}
                  className="shrink-0 text-[10px] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)] transition-opacity"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Knowledge detail drawer */}
      {drawerEntry && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/20 backdrop-blur-[2px]"
            onClick={() => setDrawerEntry(null)}
          />
          {/* Panel */}
          <div className="w-[480px] max-w-[90vw] bg-[var(--background)] border-l border-[var(--border)] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                  {drawerEntry.title}
                </h2>
                <span className="text-[12px] text-[var(--text-tertiary)]">
                  {CATEGORIES.find(c => c.key === drawerEntry.category)?.label ?? drawerEntry.category}
                </span>
              </div>
              <button
                onClick={() => setDrawerEntry(null)}
                className="ml-3 shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {drawerLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                  <Loader2 className="size-4 animate-spin" />
                  加载中...
                </div>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {drawerContent}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
