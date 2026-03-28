import type { CSSProperties } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import {
  Plus, ChevronLeft,
  Sun, Moon,
  Inbox, ScanSearch, Globe, Users, ScrollText, Activity, Layers, ClipboardCheck, Milestone, MessageSquare,
  Zap, CalendarDays, BarChart2, Mic, Library, Bot, Palette, Sparkles, Presentation,
  CheckCircle2, SkipForward, Settings2,
  FolderOpen, Pencil, Trash2, ArrowRight, RefreshCw, FileText,
  Star,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PHASE_LABELS } from "@/lib/phase-meta"
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu"

export interface SidebarProject {
  id: string
  name: string
  currentPhase: string
  completedCount: number
  totalPhases: number
  status?: 'active' | 'completed'
}

export interface SidebarPhase {
  id: string
  label: string
  status: "completed" | "in-progress" | "current" | "pending" | "skipped"
}

interface SidebarProps {
  open: boolean
  // Dashboard context
  projects: SidebarProject[]
  activeProjectId?: string
  onNewProject: () => void
  onDeleteProject?: (id: string) => void
  onRenameProject?: (id: string) => void
  // Favorites
  favorites: string[]
  onToggleFavorite: (id: string) => void
  // Project context
  projectName?: string
  projectPhases?: SidebarPhase[]
  activePhase?: string  // current URL phase — drives row highlight
  onPhaseClick?: (phaseId: string) => void
  // Project status
  projectStatus?: 'active' | 'completed'
  onStatusChange?: (status: 'active' | 'completed') => void
  // Project settings
  onOpenSettings?: () => void
  // Theme
  themePreference: "light" | "dark" | "system"
  resolvedTheme: "light" | "dark"
  onCycleTheme: () => void
}

const VALID_PHASES = new Set(Object.keys(PHASE_LABELS))

/** Sanitize currentPhase from backend — fall back to "requirement" for unknown values */
function safePhase(phase: string): string {
  return VALID_PHASES.has(phase) ? phase : "requirement"
}

const PHASE_ICONS: Record<string, React.ElementType> = {
  "office-hours": MessageSquare,
  requirement:   Inbox,
  analysis:      ScanSearch,
  research:      Globe,
  stories:       Users,
  prd:           ScrollText,
  analytics:     Activity,
  prototype:     Layers,
  review:        ClipboardCheck,
  retrospective: Milestone,
}

const TOOLS_ACTION = [
  { path: "/tools/priority",  label: "优先级评估", icon: Zap         },
  { path: "/tools/weekly",    label: "工作周报",   icon: CalendarDays },
  { path: "/tools/data",      label: "数据洞察",   icon: BarChart2    },
  { path: "/tools/interview", label: "调研访谈",   icon: Mic          },
]

const TOOLS_RESOURCE = [
  { path: "/tools/knowledge",   label: "知识库",   icon: Library  },
  { path: "/tools/persona",     label: "产品分身", icon: Bot      },
  { path: "/tools/design-spec", label: "设计规范", icon: Palette  },
  { path: "/tools/illustration", label: "AI 插图", icon: Sparkles },
  { path: "/tools/pptx",         label: "演示文稿", icon: Presentation },
]

function PhaseIcon({ phaseId, status }: { phaseId: string; status: SidebarPhase["status"] }) {
  if (status === "completed") {
    return (
      <CheckCircle2
        className="size-4 shrink-0"
        style={{ color: "var(--success)" }}
        strokeWidth={1.75}
      />
    )
  }
  if (status === "skipped") {
    return (
      <SkipForward
        className="size-4 shrink-0"
        style={{ color: "var(--text-tertiary)", opacity: 0.5 }}
        strokeWidth={1.75}
      />
    )
  }
  if (status === "in-progress") {
    return (
      <svg className="size-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: "var(--accent-color)" }}>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )
  }
  const Icon = PHASE_ICONS[phaseId] ?? Inbox
  return (
    <Icon
      className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110"
      style={{ color: status === "current" ? "var(--accent-color)" : "var(--text-tertiary)" }}
      strokeWidth={1.75}
    />
  )
}

function Sidebar({
  open,
  projects,
  activeProjectId,
  onNewProject,
  onDeleteProject,
  onRenameProject,
  favorites,
  onToggleFavorite,
  projectName,
  projectPhases,
  activePhase,
  onPhaseClick,
  projectStatus,
  onStatusChange,
  onOpenSettings,
  themePreference,
  resolvedTheme: _resolvedTheme,
  onCycleTheme,
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
      data-tauri-drag-region
      className={cn(
        "fixed top-0 left-[72px] bottom-0 z-20",
        "flex w-[180px] flex-col",
        "border-r border-[var(--border)]",
        "bg-[var(--bg-sidebar)] backdrop-blur-[20px]",
      )}
      style={{
        WebkitBackdropFilter: "blur(20px)",
        WebkitAppRegion: "drag",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        visibility: open ? "visible" : "hidden",
      } as CSSProperties}
    >
      {/* Top drag zone — matches 44px title bar height */}
      <div
        data-tauri-drag-region
        className="h-[44px] shrink-0"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      />

      {/* Main nav area */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        {/* Project back button */}
        {isInProjectContext && (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-1 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors duration-150 group"
          >
            <ChevronLeft
              className="size-3.5 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors"
              strokeWidth={1.75}
            />
            <span className="text-[13px] font-medium truncate">{projectName ?? "项目"}</span>
          </button>
        )}

        {/* PROJECT context: phase list */}
        {isInProjectContext && (
          <div className="mb-3">
            <p className="px-3 pb-2 pt-1 text-[11px] font-medium text-[var(--text-tertiary)]">
              阶段
            </p>
            <ul className="flex flex-col gap-0.5">
              {projectPhases!.map((phase) => {
                const phaseCtxItems: ContextMenuItem[] = [
                  { label: "跳转到此阶段", icon: ArrowRight, action: () => onPhaseClick?.(phase.id) },
                  { label: "重新生成", icon: RefreshCw, action: () => onPhaseClick?.(phase.id), hidden: phase.status !== "completed" },
                  { label: "查看输出文件", icon: FileText, action: () => onPhaseClick?.(phase.id), hidden: phase.status !== "completed" },
                ]
                return (
                <li key={phase.id}>
                  <ContextMenu items={phaseCtxItems}>
                  <button
                    type="button"
                    onClick={() => onPhaseClick?.(phase.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left",
                      "transition-colors duration-[var(--dur-base)]",
                      activePhase === phase.id
                        ? "bg-[var(--active-bg)]"
                        : "hover:bg-[var(--hover-bg)]",
                    )}
                  >
                    {/* Left accent bar for currently viewed phase */}
                    {activePhase === phase.id && (
                      <span
                        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--accent-color)]"
                        style={{ animation: "slideInLeft 200ms var(--ease-decelerate)" }}
                      />
                    )}
                    <PhaseIcon phaseId={phase.id} status={phase.status} />
                    <span
                      className={cn(
                        "text-sm",
                        activePhase === phase.id
                          ? "font-medium text-[var(--text-primary)]"
                          : phase.status === "completed"
                            ? "text-[var(--text-secondary)]"
                            : phase.status === "skipped"
                              ? "text-[var(--text-tertiary)] opacity-50 line-through"
                              : "text-[var(--text-tertiary)]",
                      )}
                    >
                      {phase.label}
                    </span>
                  </button>
                  </ContextMenu>
                </li>
                )
              })}
            </ul>
            {onStatusChange && (
              <>
                <div className="mx-3 mt-2 h-px bg-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => onStatusChange(projectStatus === 'completed' ? 'active' : 'completed')}
                  className={cn(
                    "mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs",
                    "transition-colors duration-[var(--dur-base)]",
                    projectStatus === 'completed'
                      ? "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"
                  )}
                >
                  <CheckCircle2
                    className="size-3.5 shrink-0"
                    style={{ color: projectStatus === 'completed' ? 'var(--success)' : 'var(--text-tertiary)' }}
                    strokeWidth={1.75}
                  />
                  {projectStatus === 'completed' ? '重新激活项目' : '完成项目'}
                </button>
              </>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors duration-[var(--dur-base)]"
              >
                <Settings2 className="size-3.5 shrink-0" strokeWidth={1.75} />
                项目设置
              </button>
            )}
          </div>
        )}

        {/* DASHBOARD context: favorites + project list */}
        {!isInProjectContext && (
          <>
            {/* Favorites section */}
            {favorites.length > 0 && (() => {
              const favProjects = favorites
                .map((fid) => projects.find((p) => p.id === fid))
                .filter((p): p is SidebarProject => !!p)
              return favProjects.length > 0 ? (
                <div className="mb-2">
                  <p className="px-3 pb-2 pt-1 text-[11px] font-medium text-[var(--text-tertiary)]">收藏</p>
                  <ul className="flex flex-col gap-0.5">
                    {favProjects.map((project) => {
                      const active = isProjectActive(project.id)
                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/project/${project.id}/${safePhase(project.currentPhase)}`)}
                            className={cn(
                              "group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left",
                              "transition-colors duration-[var(--dur-base)]",
                              active ? "bg-[var(--active-bg)]" : "hover:bg-[var(--hover-bg)]",
                            )}
                          >
                            {active && (
                              <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--accent-color)]" />
                            )}
                            <Star
                              className="size-3.5 shrink-0"
                              strokeWidth={1.75}
                              style={{ color: "var(--accent-color)", fill: "var(--accent-color)" }}
                            />
                            <p className={cn(
                              "truncate text-sm",
                              active ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                            )}>
                              {project.name}
                            </p>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="mx-3 mt-2 h-px bg-[var(--border)]" />
                </div>
              ) : null
            })()}

            <p className="px-3 pb-2 pt-1 text-[11px] font-medium text-[var(--text-tertiary)]">项目</p>
            <ul className="flex flex-col gap-0.5 mb-3 max-h-[240px] overflow-y-auto">
              {projects.map((project) => {
                const active = isProjectActive(project.id)
                const done = project.status === 'completed' || project.completedCount >= project.totalPhases
                const isFav = favorites.includes(project.id)
                const projectCtxItems: ContextMenuItem[] = [
                  { label: isFav ? "取消收藏" : "收藏", icon: Star, action: () => onToggleFavorite(project.id) },
                  { label: "打开项目", icon: FolderOpen, action: () => navigate(`/project/${project.id}/${safePhase(project.currentPhase)}`) },
                  { label: "重命名", icon: Pencil, action: () => onRenameProject?.(project.id), hidden: !onRenameProject, separator: true },
                  { label: "删除", icon: Trash2, action: () => onDeleteProject?.(project.id), variant: "destructive", hidden: !onDeleteProject },
                ]
                return (
                  <li key={project.id}>
                    <ContextMenu items={projectCtxItems}>
                    <button
                      type="button"
                      onClick={() => navigate(`/project/${project.id}/${safePhase(project.currentPhase)}`)}
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
                          "size-2 shrink-0 rounded-full",
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
                    </ContextMenu>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* TOOLS section — always visible */}
        <div className="mx-1 mb-2 h-px bg-[var(--border)]" />

        <ul className="flex flex-col gap-0.5 mb-0">
          {TOOLS_ACTION.map((tool) => {
            const toolActive = location.pathname.startsWith(tool.path)
            const Icon = tool.icon
            return (
              <li key={tool.path}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(activeProjectId ? `${tool.path}?projectId=${activeProjectId}` : tool.path)
                  }
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-md px-3 py-[7px] text-left",
                    "transition-colors duration-[var(--dur-base)]",
                    toolActive
                      ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon
                    className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:scale-110"
                    strokeWidth={1.75}
                    style={{ color: toolActive ? "var(--accent-color)" : "var(--text-tertiary)" }}
                  />
                  <span className="text-[13px]">{tool.label}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mx-3 my-1.5 h-px bg-[var(--border)]" />

        <ul className="flex flex-col gap-0.5">
          {TOOLS_RESOURCE.map((tool) => {
            const toolActive = location.pathname.startsWith(tool.path)
            const Icon = tool.icon
            return (
              <li key={tool.path}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(activeProjectId ? `${tool.path}?projectId=${activeProjectId}` : tool.path)
                  }
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-md px-3 py-[7px] text-left",
                    "transition-colors duration-[var(--dur-base)]",
                    toolActive
                      ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon
                    className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:scale-110"
                    strokeWidth={1.75}
                    style={{ color: toolActive ? "var(--accent-color)" : "var(--text-tertiary)" }}
                  />
                  <span className="text-[13px]">{tool.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom: New project + Settings + Theme toggle */}
      <div className="border-t border-[var(--border)] px-2 py-2 flex flex-col gap-1" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        {/* New project */}
        <button
          type="button"
          onClick={onNewProject}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left",
            "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
            "transition-colors duration-[var(--dur-base)] group",
          )}
        >
          <Plus className="size-3.5 transition-transform duration-150 group-hover:rotate-90" strokeWidth={1.75} />
          <span className="text-[13px]">新建项目</span>
        </button>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCycleTheme}
            title={themePreference === "light" ? "切换深色" : "切换浅色"}
            className="flex size-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors duration-150"
          >
            {themePreference === "dark"
              ? <Sun className="size-3.5 transition-transform duration-300 ease-out" strokeWidth={1.75} />
              : <Moon className="size-3.5 transition-transform duration-300 ease-out" strokeWidth={1.75} />
            }
          </button>
        </div>
      </div>
    </aside>
  )
}

export { Sidebar }
export type { SidebarProps }
