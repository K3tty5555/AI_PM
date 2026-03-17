import { useEffect, useState } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { Sidebar, type SidebarProject, type SidebarPhase } from "./Sidebar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { api } from "@/lib/tauri-api"

const PHASE_ORDER = [
  "requirement", "research", "analysis", "stories", "prd", "prototype", "review",
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

function SidebarShell() {
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState<string | undefined>()
  const [projectPhases, setProjectPhases] = useState<SidebarPhase[] | undefined>()
  const { id: activeProjectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Load project list
  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch((err) => console.error("Failed to load projects:", err))
  }, [])

  // Load current project phases when inside a project
  useEffect(() => {
    if (!activeProjectId) {
      setProjectName(undefined)
      setProjectPhases(undefined)
      return
    }

    api.getProject(activeProjectId)
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
          else if (id === project.currentPhase) status = "current"
          return { id, label: PHASE_LABELS[id] ?? id, status }
        })

        setProjectPhases(phases)
      })
      .catch((err) => console.error("Failed to load project:", err))
  }, [activeProjectId, location.pathname])

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

  const activePhase = activeProjectId
    ? location.pathname.split("/").pop()
    : undefined

  return (
    <>
      <Sidebar
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
