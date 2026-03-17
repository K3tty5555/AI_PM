import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/tauri-api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (project: { id: string; name: string }) => void
}

function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState("")
  const [teamMode, setTeamMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Focus name input on open
  useEffect(() => {
    if (open) {
      setName("")
      setTeamMode(false)
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
      const project = await api.createProject(trimmedName, teamMode)
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        className="w-full max-w-[480px] rounded-xl bg-[var(--background)] p-6 shadow-xl"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* 标题 */}
        <h2 className="mb-6 text-base font-semibold text-[var(--text-primary)]">新建项目</h2>

        <form onSubmit={handleSubmit}>
          {/* Project name */}
          <div className="mb-6">
            <label
              htmlFor="project-name"
              className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
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
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors duration-[var(--duration-terminal)] ease-[var(--ease-terminal)] placeholder:text-[var(--text-muted)]/50 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            {error && (
              <p className="mt-1.5 text-xs text-[var(--destructive)]">
                {error}
              </p>
            )}
          </div>

          {/* Team mode toggle */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setTeamMode(!teamMode)}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <span className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors duration-[var(--duration-terminal)]",
                teamMode
                  ? "border-[var(--accent-color)] bg-[var(--accent-color)]"
                  : "border-[var(--border)] bg-transparent group-hover:border-[var(--accent-color)]"
              )}>
                {teamMode && (
                  <span className="block h-2 w-2 bg-white" />
                )}
              </span>
              <span className="text-sm text-[var(--text-muted)]">多代理模式（复杂需求）</span>
            </button>
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
