import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Sidebar, type SidebarProject } from "./Sidebar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { api } from "@/lib/tauri-api"

function SidebarShell() {
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const { id: activeProjectId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    api.listProjects()
      .then((data) => {
        setProjects(data)
      })
      .catch((err) => console.error("Failed to load projects:", err))
  }, [])

  const handleNewProject = () => {
    setDialogOpen(true)
  }

  const handleCreated = (project: { id: string; name: string }) => {
    setDialogOpen(false)
    // Add new project to sidebar list immediately
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

  return (
    <>
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onNewProject={handleNewProject}
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
