"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar, type SidebarProject } from "./sidebar"
import { NewProjectDialog } from "@/components/new-project-dialog"

function SidebarShell() {
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const params = useParams()
  const router = useRouter()
  const activeProjectId = params?.id as string | undefined

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data)
        }
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
    router.push(`/project/${project.id}/requirement`)
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
