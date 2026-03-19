import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { Sidebar, type SidebarProject, type SidebarPhase } from "./Sidebar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { api } from "@/lib/tauri-api"

const PHASE_ORDER = [
  "requirement", "analysis", "research", "stories", "prd", "analytics", "prototype", "review", "retrospective",
]

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  research: "竞品研究",
  analysis: "需求分析",
  stories: "用户故事",
  prd: "PRD 撰写",
  analytics: "埋点设计",
  prototype: "原型设计",
  review: "需求评审",
  retrospective: "项目复盘（可选）",
}

function SidebarShell({
  open,
  onToggle: _onToggle,
  themePreference,
  resolvedTheme,
  onCycleTheme,
}: {
  open: boolean
  onToggle: () => void
  themePreference: "light" | "dark" | "system"
  resolvedTheme: "light" | "dark"
  onCycleTheme: () => void
}) {
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState<string | undefined>()
  const [projectPhases, setProjectPhases] = useState<SidebarPhase[] | undefined>()
  const [projectStatus, setProjectStatus] = useState<'active' | 'completed' | undefined>()
  const { id: activeProjectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const activePhase = activeProjectId
    ? location.pathname.split("/").pop()
    : undefined

  // Load project list
  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch((err) => console.error("Failed to load projects:", err))
  }, [])

  // Load current project phases when inside a project
  const loadProjectPhases = useCallback((projectId: string, currentPhase: string | undefined) => {
    api.getProject(projectId)
      .then((project) => {
        if (!project?.id) return
        setProjectName(project.name)
        setProjectStatus(project.status === 'completed' ? 'completed' : 'active')

        const completedPhases = new Set(
          project.phases
            .filter((p: any) => p.status === "completed")
            .map((p: any) => p.phase)
        )

        const phases: SidebarPhase[] = PHASE_ORDER.map((id) => {
          let status: SidebarPhase["status"] = "pending"
          if (completedPhases.has(id)) status = "completed"
          else if (id === currentPhase) status = "current"  // URL wins only if not completed
          return { id, label: PHASE_LABELS[id] ?? id, status }
        })

        setProjectPhases(phases)
      })
      .catch((err) => console.error("Failed to load project:", err))
  }, [])

  useEffect(() => {
    if (!activeProjectId) {
      setProjectName(undefined)
      setProjectPhases(undefined)
      setProjectStatus(undefined)
      return
    }
    loadProjectPhases(activeProjectId, activePhase)
  }, [activeProjectId, location.pathname, loadProjectPhases])

  // Listen for phase completion events dispatched by use-ai-stream
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId } = (e as CustomEvent).detail
      if (projectId === activeProjectId && activeProjectId) {
        loadProjectPhases(activeProjectId, activePhase)
      }
    }
    window.addEventListener("project-phase-updated", handler)
    return () => window.removeEventListener("project-phase-updated", handler)
  }, [activeProjectId, activePhase, loadProjectPhases])

  // Listen for ⌘N shortcut: open new project dialog via custom event
  useEffect(() => {
    const handler = () => setDialogOpen(true)
    window.addEventListener("open-new-project-dialog", handler)
    return () => window.removeEventListener("open-new-project-dialog", handler)
  }, [])

  // Listen for project list changes (e.g. after import from Settings)
  useEffect(() => {
    const handler = () => {
      api.listProjects()
        .then(setProjects)
        .catch((err) => console.error("Failed to reload projects:", err))
    }
    window.addEventListener("projects-updated", handler)
    return () => window.removeEventListener("projects-updated", handler)
  }, [])

  const handleNewProject = () => setDialogOpen(true)

  const handleCreated = (project: { id: string; name: string }) => {
    setDialogOpen(false)
    setProjects((prev) => [
      {
        id: project.id,
        name: project.name,
        currentPhase: "requirement",
        completedCount: 0,
        totalPhases: 9,
      },
      ...prev,
    ])
    navigate(`/project/${project.id}/requirement`)
  }

  const handlePhaseClick = (phaseId: string) => {
    if (activeProjectId) navigate(`/project/${activeProjectId}/${phaseId}`)
  }

  const handleStatusChange = useCallback(async (status: 'active' | 'completed') => {
    if (!activeProjectId) return
    try {
      await api.setProjectStatus(activeProjectId, status)
      setProjectStatus(status)
      // Reload project list so dashboard reflects the new status
      const updated = await api.listProjects()
      setProjects(updated)
    } catch (err) {
      console.error("Failed to update project status:", err)
    }
  }, [activeProjectId])

  return (
    <>
      <Sidebar
        open={open}
        projects={projects}
        activeProjectId={activeProjectId}
        onNewProject={handleNewProject}
        projectName={projectName}
        projectPhases={projectPhases}
        activePhase={activePhase}
        onPhaseClick={handlePhaseClick}
        projectStatus={projectStatus}
        onStatusChange={handleStatusChange}
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        onCycleTheme={onCycleTheme}
      />
      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  )
}

export { SidebarShell }
