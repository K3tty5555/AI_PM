import { useNavigate } from "react-router-dom"
import { Trash2, CheckCircle2, RotateCcw, Pencil, FolderOpen, ExternalLink, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ProgressBar } from "@/components/ui/progress-bar"
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu"
import type { RenameState } from "@/hooks/use-project-actions"
import { cn, FILE_MANAGER_LABEL } from "@/lib/utils"
import { PHASE_ORDER, PHASE_LABELS } from "@/lib/phase-meta"
import { api } from "@/lib/tauri-api"

interface DashboardProject {
  id: string
  name: string
  description: string | null
  currentPhase: string
  completedCount: number
  totalPhases: number
  completedPhases: string[]
  updatedAt: string
  createdAt: string
  status: "active" | "completed"
  outputDir: string
}

function PhaseMiniMap({ completedPhases }: { completedPhases: string[] }) {
  return (
    <div className="flex items-center gap-[3px]">
      {PHASE_ORDER.map((phase) => {
        const done = completedPhases.includes(phase)
        return (
          <div
            key={phase}
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: done ? "var(--accent-color)" : "var(--border)" }}
          />
        )
      })}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return dateStr
  }
}

export interface ProjectCardProps {
  project: DashboardProject
  index: number
  isFavorite: boolean
  renameState: RenameState
  onToggleFavorite: () => void
  onToggleStatus: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  rename: {
    start: (e: React.MouseEvent) => void
    startById: () => void
    cancel: () => void
    confirm: () => void
    onInputChange: (value: string) => void
  }
}

export function ProjectCard({
  project,
  index,
  isFavorite: isFav,
  renameState,
  onToggleFavorite,
  onToggleStatus,
  onDelete,
  rename,
}: ProjectCardProps) {
  const navigate = useNavigate()

  const isComplete = project.completedCount >= project.totalPhases
  const progress =
    project.totalPhases > 0
      ? Math.round((project.completedCount / project.totalPhases) * 100)
      : 0
  const phaseLabel = isComplete
    ? "已完成"
    : (PHASE_LABELS[project.currentPhase] ?? project.currentPhase)

  const isEditing = renameState.editingId === project.id
  const isRenaming = renameState.loadingId === project.id

  const contextItems: ContextMenuItem[] = [
    { label: isFav ? "取消收藏" : "收藏", icon: Star, action: onToggleFavorite },
    { label: "打开项目", icon: FolderOpen, action: () => navigate(`/project/${project.id}/requirement`) },
    { label: "重命名", icon: Pencil, action: rename.startById, separator: true },
    { label: `在 ${FILE_MANAGER_LABEL} 中显示`, icon: ExternalLink, action: () => api.revealFile(project.outputDir).catch(console.error) },
    { label: "删除项目", icon: Trash2, action: () => onDelete({ stopPropagation: () => {} } as React.MouseEvent), variant: "destructive" as const },
  ]

  return (
    <ContextMenu items={contextItems}>
      <div
        className={cn(
          "group/card relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 cursor-pointer",
          "transition-all duration-200",
          "hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px]",
          "active:scale-[0.99] active:shadow-none",
        )}
        onClick={() => navigate(`/project/${project.id}/${project.currentPhase}`)}
        style={{
          animation: `fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) ${index * 0.08}s both`,
        }}
      >
        {/* Card action buttons -- top-right, revealed on hover */}
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
          <button
            onClick={onToggleStatus}
            className={cn(
              "flex size-6 items-center justify-center rounded-md transition-all duration-150",
              project.status === "completed"
                ? "text-[var(--success)] hover:bg-[var(--success)]/10"
                : "text-[var(--text-tertiary)] hover:text-[var(--success)] hover:bg-[var(--success)]/10",
            )}
            title={project.status === "completed" ? "重新激活" : "标记完成"}
          >
            {project.status === "completed" ? (
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            onClick={onDelete}
            className="flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-all duration-150"
            title="删除项目"
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Project name */}
        <div className="flex items-start gap-2 pr-6 mb-3">
          {isEditing ? (
            <div className="flex flex-col gap-1 min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={renameState.input}
                  onChange={(e) => {
                    rename.onInputChange(e.target.value)
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      rename.confirm()
                    } else if (e.key === "Escape") {
                      e.preventDefault()
                      rename.cancel()
                    }
                  }}
                  onBlur={() => rename.confirm()}
                  disabled={isRenaming}
                  className={cn(
                    "h-9 px-2.5 text-[15px] font-semibold rounded-lg border outline-none w-full transition-colors duration-200",
                    "bg-[var(--card)] text-[var(--text-primary)]",
                    renameState.error
                      ? "border-[var(--destructive)] focus:ring-2 focus:ring-[rgba(220,38,38,0.15)]"
                      : "border-[rgba(0,0,0,0.12)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]",
                  )}
                />
                {isRenaming && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                )}
              </div>
              {renameState.error && (
                <span className="text-[10px] text-[var(--destructive)]">{renameState.error}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 group/name">
              <span className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug truncate">
                {project.name}
              </span>
              <button
                onClick={rename.start}
                className="opacity-0 group-hover/name:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-[var(--accent-color)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-color)] shrink-0"
                title="重命名"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {project.status === "completed" && (
                <span className="ml-1 rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] text-[var(--success)] font-medium shrink-0">
                  已完成
                </span>
              )}
            </div>
          )}
        </div>

        {/* Phase badge */}
        <Badge variant={isComplete ? "outline" : "default"} className="mb-3">
          {phaseLabel}
        </Badge>

        {/* Progress bar */}
        <div className="mb-3">
          <ProgressBar value={progress} className="h-[2px]" />
        </div>

        {/* Footer: phase dots + date */}
        <div className="flex items-center justify-between">
          <PhaseMiniMap completedPhases={project.completedPhases} />
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {formatDate(project.updatedAt)}
          </span>
        </div>
      </div>
    </ContextMenu>
  )
}
