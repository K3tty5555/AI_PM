import type { CSSProperties } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Plus, Settings, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SidebarProject {
  id: string
  name: string
  currentPhase: string
  completedCount: number
  totalPhases: number
}

export interface SidebarPhase {
  id: string
  label: string
  status: "completed" | "current" | "pending"
}

interface SidebarProps {
  open: boolean
  // Dashboard context
  projects: SidebarProject[]
  activeProjectId?: string
  onNewProject: () => void
  // Project context
  projectName?: string
  projectPhases?: SidebarPhase[]
  activePhase?: string  // kept for caller convenience; phase highlight driven by phase.status
  onPhaseClick?: (phaseId: string) => void
}

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  prototype: "原型设计",
  review: "需求评审",
}

const TOOLS = [
  { path: "/tools/priority",  label: "需求优先级" },
  { path: "/tools/weekly",    label: "工作周报"   },
  { path: "/tools/knowledge", label: "知识库"     },
  { path: "/tools/persona",   label: "产品分身"   },
  { path: "/tools/data",      label: "数据洞察"   },
  { path: "/tools/interview", label: "调研访谈"   },
]

function PhaseStatusIcon({ status }: { status: SidebarPhase["status"] }) {
  if (status === "completed") {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-[var(--success-light)]">
        <Check className="size-2.5 text-[var(--success)] stroke-[2.5]" />
      </span>
    )
  }
  if (status === "current") {
    return (
      <span className="flex size-4 items-center justify-center">
        <span className="size-2 rounded-full bg-[var(--accent-color)]" />
      </span>
    )
  }
  return (
    <span className="flex size-4 items-center justify-center">
      <span className="size-2 rounded-full border border-[var(--text-tertiary)]" />
    </span>
  )
}

function Sidebar({
  open,
  projects,
  activeProjectId,
  onNewProject,
  projectName,
  projectPhases,
  activePhase: _activePhase,
  onPhaseClick,
}: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const isProjectActive = (projectId: string) => {
    if (activeProjectId) return activeProjectId === projectId
    return location.pathname.startsWith(`/project/${projectId}`)
  }

  const isInProjectContext = !!projectPhases && projectPhases.length > 0

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "fixed top-[44px] left-0 bottom-0 z-20",
        "flex w-[220px] flex-col",
        "border-r border-[var(--border)]",
        "bg-[var(--bg-sidebar)] backdrop-blur-[20px]",
      )}
      style={{
        WebkitBackdropFilter: "blur(20px)",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        visibility: open ? "visible" : "hidden",
      } as CSSProperties}
    >
      {/* App logo */}
      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex items-center gap-2 px-4 py-3 hover:opacity-70 transition-opacity text-left"
      >
        <span className="flex size-5 items-center justify-center rounded bg-[var(--accent-color)] shrink-0">
          <span className="text-[9px] font-bold text-white">AI</span>
        </span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">
          AI PM
        </span>
      </button>

      <div className="mx-3 h-px bg-[var(--border)]" />

      {/* Main nav area */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">

        {/* PROJECT context: phase list */}
        {isInProjectContext && (
          <div className="mb-3">
            {projectName && (
              <p className="px-3 pt-1 pb-2 text-[11px] font-medium text-[var(--text-tertiary)] truncate">
                {projectName}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {projectPhases!.map((phase) => (
                <li key={phase.id}>
                  <button
                    type="button"
                    onClick={() => onPhaseClick?.(phase.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left",
                      "transition-colors duration-[var(--dur-base)]",
                      phase.status === "current"
                        ? "bg-[var(--active-bg)]"
                        : "hover:bg-[var(--hover-bg)]",
                    )}
                  >
                    {/* Left accent bar for current phase */}
                    {phase.status === "current" && (
                      <span
                        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--accent-color)]"
                        style={{ animation: "slideInLeft 200ms var(--ease-decelerate)" }}
                      />
                    )}
                    <PhaseStatusIcon status={phase.status} />
                    <span
                      className={cn(
                        "text-sm",
                        phase.status === "current"
                          ? "font-medium text-[var(--text-primary)]"
                          : phase.status === "completed"
                            ? "text-[var(--text-secondary)]"
                            : "text-[var(--text-tertiary)]",
                      )}
                    >
                      {phase.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* DASHBOARD context: project list */}
        {!isInProjectContext && (
          <>
            <p className="px-3 pb-2 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              项目
            </p>
            <ul className="flex flex-col gap-0.5 mb-3">
              {projects.map((project) => {
                const active = isProjectActive(project.id)
                const done = project.completedCount >= project.totalPhases
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/project/${project.id}/${project.currentPhase}`)}
                      className={cn(
                        "group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left",
                        "transition-colors duration-[var(--dur-base)]",
                        active ? "bg-[var(--active-bg)]" : "hover:bg-[var(--hover-bg)]",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--accent-color)]" />
                      )}
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          done ? "bg-[var(--success)]" : "bg-[var(--accent-color)]",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "truncate text-sm",
                          active ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                        )}>
                          {project.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                          {PHASE_LABELS[project.currentPhase] ?? project.currentPhase}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* TOOLS section — always visible */}
        <div className="mx-1 mb-2 h-px bg-[var(--border)]" />
        <p className="px-3 pb-1.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          工具
        </p>
        <ul className="flex flex-col gap-0.5">
          {TOOLS.map((tool) => {
            const toolActive = location.pathname === tool.path
            return (
              <li key={tool.path}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(activeProjectId ? `${tool.path}?projectId=${activeProjectId}` : tool.path)
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left",
                    "transition-colors duration-[var(--dur-base)]",
                    toolActive
                      ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <span className="text-[13px]">{tool.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom: New project + Settings */}
      <div className="border-t border-[var(--border)] px-2 py-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={onNewProject}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left",
            "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
            "transition-colors duration-[var(--dur-base)] group",
          )}
        >
          <Plus className="size-3.5 transition-transform duration-150 group-hover:rotate-90" />
          <span className="text-[13px]">新建项目</span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left",
            location.pathname === "/settings"
              ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
            "transition-colors duration-[var(--dur-base)]",
          )}
        >
          <Settings className="size-3.5" />
          <span className="text-[13px]">设置</span>
        </button>
      </div>
    </aside>
  )
}

export { Sidebar }
export type { SidebarProps }
