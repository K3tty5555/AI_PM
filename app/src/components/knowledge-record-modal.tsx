import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/tauri-api"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KnowledgeRecordModalProps {
  open: boolean
  onClose: () => void
  projectName: string
  initialContent?: string // pre-filled content (Critical/Major issues from review)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeRecordModal({
  open,
  onClose,
  projectName,
  initialContent,
}: KnowledgeRecordModalProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState("pitfalls")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Reset internal state every time the modal opens
  useEffect(() => {
    if (open) {
      const name = projectName || "本项目"
      setTitle(`${name} 评审经验`)
      setContent(
        initialContent
          ? `## 主要问题\n\n${initialContent}\n\n## 经验教训\n\n`
          : "## 主要问题\n\n## 改进建议\n\n## 经验教训\n\n",
      )
      setCategory("pitfalls")
      setError("")
      setSaving(false)
    }
  }, [open, projectName, initialContent])

  const handleSave = useCallback(async () => {
    if (!title.trim()) return
    setSaving(true)
    setError("")
    try {
      await api.addKnowledge({ category, title, content })
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [title, content, category, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title-review-knowledge"
    >
      <div className="w-[480px] bg-[var(--background)] rounded-xl border border-[var(--border)] shadow-[var(--shadow-xl)] p-5 flex flex-col gap-4">
        <h3
          id="dialog-title-review-knowledge"
          className="text-[15px] font-semibold text-[var(--text-primary)]"
        >
          记录项目经验
        </h3>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">分类</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
          <label className="text-xs text-[var(--text-secondary)]">
            内容（Markdown）
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
        </div>

        {error && (
          <p className="text-xs text-[var(--destructive)]">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  )
}
