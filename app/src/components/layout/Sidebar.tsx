import { useNavigate, useLocation } from "react-router-dom"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { cn } from "@/lib/utils"

interface SidebarProject {
  id: string
  name: string
  currentPhase: string
  completedCount: number
  totalPhases: number
}

interface SidebarProps {
  projects: SidebarProject[]
  activeProjectId?: string
  onNewProject: () => void
}

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  prototype: "原型设计",
  review: "评审",
}

function Sidebar({ projects, activeProjectId, onNewProject }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (projectId: string) => {
    if (activeProjectId) return activeProjectId === projectId
    return location.pathname.startsWith(`/project/${projectId}`)
  }

  const isAllDone = (completedCount: number, totalPhases: number) =>
    completedCount >= totalPhases

  return (
    <aside
      data-slot="sidebar"
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--secondary)]"
    >
      {/* Section label */}
      <div className="px-5 pt-5 pb-3">
        <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-[11px] font-medium uppercase tracking-[3px] text-[var(--text-muted)]">
          PROJECT
        </span>
      </div>

      {/* Divider */}
      <div className="mx-5 mb-2 h-px bg-[var(--border)]" />

      {/* Project list */}
      <nav className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-1">
          {projects.map((project) => {
            const active = isActive(project.id)
            const done = isAllDone(project.completedCount, project.totalPhases)
            const progress =
              project.totalPhases > 0
                ? Math.round((project.completedCount / project.totalPhases) * 100)
                : 0

            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/project/${project.id}/${project.currentPhase}`
                    )
                  }
                  className={cn(
                    "group flex w-full items-start gap-3 px-3 py-3 text-left",
                    "transition-colors duration-[var(--duration-terminal)] ease-[var(--ease-terminal)]",
                    active
                      ? "bg-[var(--background)]"
                      : "hover:bg-[var(--background)]/60"
                  )}
                >
                  {/* Status stripe */}
                  <span
                    className={cn(
                      "mt-0.5 block shrink-0 self-stretch transition-all",
                      active ? "w-[4px]" : "w-[3px]",
                      done
                        ? "bg-[#9E9E9E]"
                        : "bg-[var(--yellow)]"
                    )}
                  />

                  {/* Content */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span
                      className={cn(
                        "truncate text-sm",
                        active
                          ? "font-semibold text-[var(--dark)]"
                          : "font-medium text-[var(--dark)]"
                      )}
                    >
                      {project.name}
                    </span>

                    <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-[10px] text-[var(--text-muted)]">
                      {PHASE_LABELS[project.currentPhase] ?? project.currentPhase}
                    </span>

                    <ProgressBar value={progress} className="h-1" />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom: New project button */}
      <div className="border-t border-[var(--border)] p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={onNewProject}
        >
          <Plus className="size-4" />
          NEW
        </Button>
      </div>
    </aside>
  )
}

export { Sidebar }
export type { SidebarProps, SidebarProject }
