import { useState, useCallback, useEffect } from "react"
import { X, Save, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { api, type PrdFileEntry, type PrototypeVersionEntry } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface PrdEntryDraft {
  file: string
  label: string
  parent: string
}

interface ProtoEntryDraft {
  dir: string
  label: string
}

interface VersionManagerDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  /** "prd" | "prototype" */
  mode: "prd" | "prototype"
  /** 当前的版本列表，传入即可（无需重新拉取） */
  prdEntries?: PrdFileEntry[]
  prototypeEntries?: PrototypeVersionEntry[]
  /** 保存成功后回调 */
  onSaved?: () => void
}

export function VersionManagerDialog({
  open,
  onClose,
  projectId,
  mode,
  prdEntries = [],
  prototypeEntries = [],
  onSaved,
}: VersionManagerDialogProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [prdDrafts, setPrdDrafts] = useState<PrdEntryDraft[]>([])
  const [protoDrafts, setProtoDrafts] = useState<ProtoEntryDraft[]>([])

  // Sync drafts when entries change
  useEffect(() => {
    if (!open) return
    if (mode === "prd") {
      setPrdDrafts(prdEntries.map((e) => ({
        file: e.file,
        label: e.customLabel ?? "",
        parent: e.parent ?? "",
      })))
    } else {
      setProtoDrafts(prototypeEntries.map((e) => ({
        dir: e.dir,
        label: e.customLabel ?? "",
      })))
    }
  }, [open, mode, prdEntries, prototypeEntries])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      if (mode === "prd") {
        for (const d of prdDrafts) {
          await api.setPrdVersionMeta({
            projectId,
            file: d.file,
            label: d.label.trim() || null,
            parent: d.parent.trim() || null,
          })
        }
      } else {
        for (const d of protoDrafts) {
          await api.setPrototypeVersionMeta({
            projectId,
            dir: d.dir,
            label: d.label.trim() || null,
          })
        }
      }
      toast("版本元数据已保存", "success")
      onSaved?.()
      onClose()
    } catch (err) {
      console.error("[VersionManager] save failed:", err)
      toast(`保存失败：${String(err)}`, "error")
    } finally {
      setSaving(false)
    }
  }, [mode, projectId, prdDrafts, protoDrafts, onSaved, onClose, toast])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const title = mode === "prd" ? "PRD 版本管理" : "原型版本管理"
  const description =
    mode === "prd"
      ? "为每个 PRD 文件设置业务标签和父版本（评审反馈版可指向上游版本）。留空则使用从文件名识别的默认标签。"
      : "为每个原型目录设置业务标签。留空则使用目录后缀作为默认标签。"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[680px] max-h-[80vh] overflow-y-auto rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-tertiary)]">{description}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="h-px bg-[var(--border)] mb-4" />

        {/* PRD draft list */}
        {mode === "prd" && (
          <div className="space-y-3">
            {prdDrafts.length === 0 && (
              <p className="text-center text-sm text-[var(--text-tertiary)] py-6">
                还没有 PRD 文件
              </p>
            )}
            {prdDrafts.map((draft, i) => {
              const entry = prdEntries[i]
              return (
                <div
                  key={draft.file}
                  className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-[12px] text-[var(--text-secondary)] truncate flex-1">
                      {draft.file}
                    </span>
                    <span className="rounded bg-[var(--accent-color)]/10 px-1.5 py-0.5 text-[11px] text-[var(--accent-color)]">
                      默认 {entry?.label ?? "未版本"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">业务标签</label>
                      <input
                        type="text"
                        value={draft.label}
                        onChange={(e) => {
                          const next = [...prdDrafts]
                          next[i] = { ...next[i], label: e.target.value }
                          setPrdDrafts(next)
                        }}
                        placeholder="例：V1.1 搜题场景"
                        className={cn(
                          "w-full rounded-md px-2 py-1 text-[12px]",
                          "bg-transparent border border-[var(--border)]",
                          "outline-none focus:border-[var(--accent-color)] transition-[border-color]",
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                        父版本（评审反馈版指向上游）
                      </label>
                      <input
                        type="text"
                        value={draft.parent}
                        onChange={(e) => {
                          const next = [...prdDrafts]
                          next[i] = { ...next[i], parent: e.target.value }
                          setPrdDrafts(next)
                        }}
                        placeholder="例：V1.0"
                        className={cn(
                          "w-full rounded-md px-2 py-1 text-[12px]",
                          "bg-transparent border border-[var(--border)]",
                          "outline-none focus:border-[var(--accent-color)] transition-[border-color]",
                        )}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Prototype draft list */}
        {mode === "prototype" && (
          <div className="space-y-3">
            {protoDrafts.length === 0 && (
              <p className="text-center text-sm text-[var(--text-tertiary)] py-6">
                还没有原型目录
              </p>
            )}
            {protoDrafts.map((draft, i) => {
              const entry = prototypeEntries[i]
              return (
                <div
                  key={draft.dir}
                  className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-[12px] text-[var(--text-secondary)] truncate flex-1">
                      {draft.dir}
                    </span>
                    <span className="rounded bg-[var(--accent-color)]/10 px-1.5 py-0.5 text-[11px] text-[var(--accent-color)]">
                      默认 {entry?.label ?? "—"}
                    </span>
                    {entry?.hasManifest && (
                      <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                        多页
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">业务标签</label>
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(e) => {
                        const next = [...protoDrafts]
                        next[i] = { ...next[i], label: e.target.value }
                        setProtoDrafts(next)
                      }}
                      placeholder="例：V1.1+V1.2 共用 / V1.3 精准教学"
                      className={cn(
                        "w-full rounded-md px-2 py-1 text-[12px]",
                        "bg-transparent border border-[var(--border)]",
                        "outline-none focus:border-[var(--accent-color)] transition-[border-color]",
                      )}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="h-px bg-[var(--border)] my-4" />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="size-3.5 animate-spin mr-1" /> : <Save className="size-3.5 mr-1" />}
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  )
}
