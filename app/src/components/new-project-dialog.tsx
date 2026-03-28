import { useEffect, useRef, useState } from "react"
import { Briefcase, Users, Wrench, Layers } from "lucide-react"
import { api, type ProjectType, type Industry, PROJECT_TYPE_META } from "@/lib/tauri-api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TYPE_ICONS: Record<ProjectType, typeof Layers> = {
  general: Layers,
  "to-b": Briefcase,
  "to-c": Users,
  internal: Wrench,
}

const INDUSTRY_OPTIONS: { value: Industry; label: string; accent: string }[] = [
  { value: "general", label: "通用/不指定", accent: "#374151" },
  { value: "finance", label: "金融/法律", accent: "#1E3A5F" },
  { value: "healthcare", label: "医疗/健康", accent: "#0D7377" },
  { value: "tech", label: "科技/互联网", accent: "#4F46E5" },
  { value: "education", label: "教育", accent: "#1B4F72" },
  { value: "ecommerce", label: "电商/零售", accent: "#DC2626" },
  { value: "enterprise", label: "企业内部工具", accent: "#374151" },
]

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (project: { id: string; name: string }) => void
}

function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState("")
  const [projectType, setProjectType] = useState<ProjectType>("general")
  const [industry, setIndustry] = useState<Industry>("general")
  const [teamMode, setTeamMode] = useState(false)
  const [isApiMode, setIsApiMode] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      api.getConfig().then(cfg => setIsApiMode(cfg.backend === "api")).catch((err) => console.error("[NewProjectDialog]", err))
    }
  }, [open])

  // Focus name input on open
  useEffect(() => {
    if (open) {
      setName("")
      setProjectType("general")
      setIndustry("general")
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
      const project = await api.createProject(trimmedName, teamMode, projectType, industry)
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title-new-project"
    >
      <div
        className="w-full max-w-[480px] rounded-xl bg-[var(--background)] p-6 shadow-[var(--shadow-xl)]"
        style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
      >
        {/* 标题 */}
        <h2 id="dialog-title-new-project" className="mb-6 text-base font-semibold text-[var(--text-primary)]">新建项目</h2>

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
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            {error && (
              <p className="mt-1.5 text-xs text-[var(--destructive)]">
                {error}
              </p>
            )}
          </div>

          {/* Project type selector */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
              项目类型
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROJECT_TYPE_META) as ProjectType[]).map((type) => {
                const meta = PROJECT_TYPE_META[type]
                const Icon = TYPE_ICONS[type]
                const selected = projectType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setProjectType(type)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all duration-150",
                      selected
                        ? "border-[var(--accent-color)] bg-[var(--accent-light)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent-color)]/40",
                    )}
                  >
                    <Icon className="size-4 shrink-0 mt-0.5" style={{ color: selected ? "var(--accent-color)" : "var(--text-tertiary)" }} strokeWidth={1.75} />
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium", selected ? "text-[var(--accent-color)]" : "text-[var(--text-primary)]")}>
                        {meta.label}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-snug mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
              创建后可在项目设置中更改
            </p>
          </div>

          {/* Industry selector */}
          <div className="mb-6">
            <label
              htmlFor="project-industry"
              className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
            >
              行业
            </label>
            <div className="relative">
              <select
                id="project-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry)}
                className="h-10 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 pr-8 text-sm text-[var(--text-primary)] outline-none transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              >
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-2 rounded-full"
                style={{ backgroundColor: INDUSTRY_OPTIONS.find(o => o.value === industry)?.accent ?? "#374151" }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
              选择行业（可选，影响配色推荐）
            </p>
          </div>

          {/* Team mode toggle */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setTeamMode(!teamMode)}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <span className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors duration-[var(--dur-base)]",
                teamMode
                  ? "border-[var(--accent-color)] bg-[var(--accent-color)]"
                  : "border-[var(--border)] bg-transparent group-hover:border-[var(--accent-color)]"
              )}>
                {teamMode && (
                  <span className="block h-2 w-2 bg-white" />
                )}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">多代理模式（复杂需求）</span>
            </button>
            {teamMode && isApiMode && (
              <p className="mt-2 ml-7 text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                API 模式下为增强提示词，不会真正并行执行。切换到 Claude CLI 后端可启用完整多代理协作。
              </p>
            )}
            {teamMode && !isApiMode && (
              <p className="mt-2 ml-7 text-[12px] text-[var(--accent-color)] leading-relaxed">
                CLI 模式：Claude Code 将并行派出多个 Agent 协同完成各阶段任务。
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
