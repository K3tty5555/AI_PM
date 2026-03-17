import { useState, useEffect } from "react"
import { api, type ProjectSummary } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface ProjectSelectorProps {
  toolKey: string  // e.g. "interview", "data" — used as localStorage key
  value: string | null
  onChange: (projectId: string | null) => void
  className?: string
}

export function ProjectSelector({ toolKey, value, onChange, className }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    onChange(id)
    if (id) {
      localStorage.setItem(`tool-binding:${toolKey}`, id)
    } else {
      localStorage.removeItem(`tool-binding:${toolKey}`)
    }
  }

  const selectedProject = projects.find((p) => p.id === value)

  return (
    <div
      className={cn(
        "flex items-center gap-3 pb-3 mb-4 border-b border-[var(--border)]",
        className,
      )}
    >
      <span className="text-[11px] font-medium text-[var(--text-tertiary)] shrink-0">
        绑定项目
      </span>
      <select
        value={value ?? ""}
        onChange={handleChange}
        className={cn(
          "flex-1 h-8 px-2 text-sm bg-transparent border border-[var(--border)]",
          "text-[var(--dark)] outline-none",
          "focus:border-[var(--yellow)] transition-colors duration-[var(--duration-terminal)]"
        )}
      >
        <option value="">— 不绑定 —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {selectedProject && (
        <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
          运行后自动保存上下文
        </span>
      )}
    </div>
  )
}
