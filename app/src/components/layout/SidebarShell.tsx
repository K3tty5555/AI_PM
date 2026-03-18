import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { Sidebar, type SidebarProject, type SidebarPhase } from "./Sidebar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { api } from "@/lib/tauri-api"

const PHASE_ORDER = [
  "requirement", "analysis", "research", "stories", "prd", "prototype", "review",
]

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  research: "竞品研究",
  analysis: "需求分析",
  stories: "用户故事",
  prd: "PRD 撰写",
  prototype: "原型设计",
  review: "需求评审",
}

function SidebarShell({ open }: { open: boolean }) {
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState<string | undefined>()
  const [projectPhases, setProjectPhases] = useState<SidebarPhase[] | undefined>()
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

  const handleNewProject = () => setDialogOpen(true)

  const handleCreated = (project: { id: string; name: string }) => {
    setDialogOpen(false)
    setProjects((prev) => [
      {
        id: project.id,
        name: project.name,
        currentPhase: "requirement",
        completedCount: 0,
        totalPhases: 7,
      },
      ...prev,
    ])
    navigate(`/project/${project.id}/requirement`)
  }

  const handlePhaseClick = (phaseId: string) => {
    if (activeProjectId) navigate(`/project/${activeProjectId}/${phaseId}`)
  }

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
