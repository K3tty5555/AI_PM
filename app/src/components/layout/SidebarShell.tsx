import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { Sidebar, type SidebarProject, type SidebarPhase } from "./Sidebar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { useFavorites } from "@/hooks/use-favorites"
import { api } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { PHASE_ORDER, PHASE_LABELS } from "@/lib/phase-meta"

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
  const { toast } = useToast()
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState<string | undefined>()
  const [projectPhases, setProjectPhases] = useState<SidebarPhase[] | undefined>()
  const [projectStatus, setProjectStatus] = useState<'active' | 'completed' | undefined>()
  const { favorites, toggleFavorite } = useFavorites()
  const { id: activeProjectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const activePhase = activeProjectId
    ? location.pathname.split("/").pop()
    : undefined

  // Load project list — on mount and when returning to dashboard
  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch((err) => console.error("Failed to load projects:", err))
  }, [activeProjectId])

  // Load current project phases when inside a project
  const loadProjectPhases = useCallback((projectId: string, currentPhase: string | undefined) => {
    api.getProject(projectId)
      .then((project) => {
        if (!project?.id) return
        setProjectName(project.name)
        setProjectStatus(project.status === 'completed' ? 'completed' : 'active')

        const phaseStatusMap = new Map<string, string>(
          project.phases.map((p: any) => [p.phase, p.status])
        )

        const phases: SidebarPhase[] = PHASE_ORDER.map((id) => {
          const backendStatus = phaseStatusMap.get(id)
          let status: SidebarPhase["status"] = "pending"
          if (backendStatus === "completed") status = "completed"
          else if (backendStatus === "in_progress") status = "in-progress"
          else if (id === currentPhase) status = "current"
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
      toast("更新项目状态失败", "error")
    }
  }, [activeProjectId])

  return (
    <>
      <Sidebar
        open={open}
        projects={projects}
        activeProjectId={activeProjectId}
        onNewProject={handleNewProject}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
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
