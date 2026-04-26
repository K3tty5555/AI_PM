import { useCallback, useEffect, useState } from "react"
import { api, type InstinctEntry } from "@/lib/tauri-api"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SkeletonList } from "@/components/ui/skeleton"
import { ChevronDown, ChevronRight, CheckCircle2, Trash2, CheckCheck, XCircle } from "lucide-react"

// ─── Type label mapping ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  writing: "写作风格",
  workflow: "流程偏好",
}

// ─── Group instincts by type ─────────────────────────────────────────────────

interface InstinctGroup {
  type: string
  label: string
  items: InstinctEntry[]
  avgConfidence: number
}

function groupByType(entries: InstinctEntry[]): InstinctGroup[] {
  const map = new Map<string, InstinctEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.type) ?? []
    list.push(entry)
    map.set(entry.type, list)
  }

  // Stable order: writing first, then workflow, then any others
  const order = ["writing", "workflow"]
  const sorted = [...map.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  return sorted.map(([type, items]) => {
    const avg = items.reduce((s, e) => s + e.confidence, 0) / items.length
    return {
      type,
      label: TYPE_LABELS[type] ?? type,
      items,
      avgConfidence: Math.round(avg * 100) / 100,
    }
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InstinctPanel() {
  const [entries, setEntries] = useState<InstinctEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<InstinctEntry | null>(null)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const data = await api.listInstincts()
      setEntries(data)
    } catch {
      // silently fail — empty state will show
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      busy ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleConfirm = async (id: string) => {
    markBusy(id, true)
    try {
      await api.confirmInstinct(id)
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, confidence: 0.9 } : e))
      )
    } finally {
      markBusy(id, false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    markBusy(id, true)
    try {
      await api.deleteInstinct(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } finally {
      markBusy(id, false)
      setDeleteTarget(null)
    }
  }

  const handleConfirmAll = async () => {
    const pending = entries.filter((e) => e.confidence < 0.9)
    for (const e of pending) {
      markBusy(e.id, true)
    }
    try {
      await Promise.all(pending.map((e) => api.confirmInstinct(e.id)))
      setEntries((prev) =>
        prev.map((e) => (e.confidence < 0.9 ? { ...e, confidence: 0.9 } : e))
      )
    } finally {
      for (const e of pending) {
        markBusy(e.id, false)
      }
    }
  }

  const handleClearAll = async () => {
    setClearAllOpen(false)
    const ids = entries.map((e) => e.id)
    for (const id of ids) markBusy(id, true)
    try {
      await Promise.all(ids.map((id) => api.deleteInstinct(id)))
      setEntries([])
    } finally {
      for (const id of ids) markBusy(id, false)
    }
  }

  const toggleCollapse = (type: string) => {
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  // ─── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <SkeletonList count={5} />
      </div>
    )
  }

  // ─── Empty state ────────────────────────────────────────────────────────

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          暂无习惯记录。完成更多项目后，系统会自动学习你的偏好。
        </p>
      </div>
    )
  }

  // ─── Groups ─────────────────────────────────────────────────────────────

  const groups = groupByType(entries)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.type] ?? false

        return (
          <div
            key={group.type}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            {/* Group header */}
            <button
              onClick={() => toggleCollapse(group.type)}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--hover-bg)]"
            >
              {isCollapsed ? (
                <ChevronRight className="size-4 text-[var(--text-tertiary)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--text-tertiary)]" />
              )}
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {group.label}
              </span>
              <Badge variant="outline" className="ml-1">
                {group.items.length} 条
              </Badge>
              <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                平均置信度 {group.avgConfidence.toFixed(2)}
              </span>
            </button>

            {/* Items */}
            {!isCollapsed && (
              <div className="flex flex-col gap-3 px-5 pb-4">
                {group.items.map((item) => (
                  <InstinctCard
                    key={item.id}
                    item={item}
                    busy={busyIds.has(item.id)}
                    onConfirm={() => handleConfirm(item.id)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Batch actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={handleConfirmAll}>
          <CheckCheck className="size-3.5" />
          全部确认
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setClearAllOpen(true)}
          className="text-[var(--destructive)] hover:text-[var(--destructive)]"
        >
          <XCircle className="size-3.5" />
          全部清除
        </Button>
      </div>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除习惯记录"
        description={`确定要删除「${deleteTarget?.description ?? ""}」吗？删除后系统将不再参考此偏好。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Clear all confirm dialog */}
      <ConfirmDialog
        open={clearAllOpen}
        title="清除全部习惯"
        description="确定要清除所有已学习的习惯记录吗？此操作不可撤销。"
        confirmLabel="全部清除"
        variant="danger"
        onConfirm={handleClearAll}
        onCancel={() => setClearAllOpen(false)}
      />
    </div>
  )
}

// ─── Single instinct card ────────────────────────────────────────────────────

interface InstinctCardProps {
  item: InstinctEntry
  busy: boolean
  onConfirm: () => void
  onDelete: () => void
}

function InstinctCard({ item, busy, onConfirm, onDelete }: InstinctCardProps) {
  const isActive = item.confidence >= 0.7

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isActive
          ? "border-[var(--accent-color)]/20 bg-[var(--accent-light)]"
          : "border-[var(--border)] bg-[var(--background)]"
      }`}
    >
      {/* Description */}
      <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">
        {item.description}
      </p>

      {/* Confidence bar row */}
      <div className="mb-2 flex items-center gap-3">
        <ProgressBar value={item.confidence * 100} className="flex-1" />
        <span className="min-w-[2.5rem] text-right text-xs tabular-nums text-[var(--text-secondary)]">
          {item.confidence.toFixed(2)}
        </span>
        {isActive && (
          <Badge variant="success" className="ml-1">
            已生效
          </Badge>
        )}
      </div>

      {/* Meta info + actions */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">
          观察 {item.observations} 次 · 来自 {item.sourceProjects.length} 个项目
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={busy || item.confidence >= 0.9}
            onClick={onConfirm}
          >
            <CheckCircle2 className="size-3" />
            确认
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={onDelete}
            className="text-[var(--destructive)] hover:text-[var(--destructive)]"
          >
            <Trash2 className="size-3" />
            删除
          </Button>
        </div>
      </div>
    </div>
  )
}
