import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (project: { id: string; name: string }) => void
}

function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Focus name input on open
  useEffect(() => {
    if (open) {
      setName("")
      setError("")
      setSubmitting(false)
      // Delay to let the DOM render
      const timer = setTimeout(() => nameInputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("项目名称不能为空")
      nameInputRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const project = await invoke<{ id: string; name: string }>("create_project", { name: trimmedName })
      onCreated(project)
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : "创建项目失败")
      setSubmitting(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose()
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      style={{ animation: "fadeInUp 0.2s ease-out" }}
    >
      <div
        className="w-full max-w-[480px] border border-[var(--border)] bg-[var(--background)] p-8 shadow-[0_4px_24px_rgba(0,0,0,0.08)]"
        style={{ animation: "fadeInUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Title — HUD label style */}
        <div className="mb-8">
          <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs font-medium uppercase tracking-[3px] text-[var(--text-muted)]">
            NEW_PROJECT
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Project name */}
          <div className="mb-6">
            <label
              htmlFor="project-name"
              className="mb-2 block text-sm font-medium text-[var(--dark)]"
            >
              项目名称
            </label>
            <input
              ref={nameInputRef}
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError("")
              }}
              placeholder="输入项目名称"
              className="h-10 w-full border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--dark)] outline-none transition-colors duration-[var(--duration-terminal)] ease-[var(--ease-terminal)] placeholder:text-[var(--text-muted)]/50 focus:border-[var(--yellow)]"
            />
            {error && (
              <p className="mt-1.5 text-xs text-[var(--destructive)]">
                {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "创建中..." : "创建项目"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { NewProjectDialog }
export type { NewProjectDialogProps }
