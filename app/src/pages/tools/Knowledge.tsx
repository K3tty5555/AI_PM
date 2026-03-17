import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api, type KnowledgeEntry } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)]">LOADING...</span>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline">KNOWLEDGE</Badge>
          <span className="text-sm text-[var(--text-muted)]">产品知识库</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "取消" : "+ 添加"}
        </Button>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* 分类标签 */}
      <div className="mt-4 flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => {
          const count = entries.filter((e) => e.category === cat.key).length
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "px-3 py-1 text-xs transition-colors font-terminal",
                activeCategory === cat.key
                  ? "bg-[var(--yellow)] text-[var(--dark)]"
                  : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--dark)]"
              )}
            >
              {cat.label} {count > 0 && `(${count})`}
            </button>
          )
        })}
      </div>

      {/* 添加表单 */}
      {showAdd && (
        <div className="mt-4 border border-[var(--yellow)]/30 p-4">
          <div className="mb-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="标题"
              className={cn(
                "w-full h-9 px-3 text-sm",
                "bg-transparent border border-[var(--border)]",
                "placeholder:text-[var(--text-muted)]",
                "outline-none focus:border-[var(--yellow)] transition-[border-color]"
              )}
            />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="内容（支持 Markdown）"
            rows={4}
            className={cn(
              "w-full px-3 py-2 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "outline-none resize-none focus:border-[var(--yellow)] transition-[border-color]"
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
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            该分类暂无条目，点击右上角「+ 添加」记录第一条经验
          </p>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="group border border-[var(--border)] p-4 hover:border-[var(--yellow)]/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[var(--dark)]">{entry.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
                    {entry.content.replace(/^#[^\n]+\n+/, "").slice(0, 120)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(entry.category, entry.id)}
                  className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)] transition-opacity"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
