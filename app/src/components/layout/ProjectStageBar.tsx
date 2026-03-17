import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { StageNav, type Stage } from "@/components/stage-nav"
import { api } from "@/lib/tauri-api"
import { getCachedProject, setCachedProject } from "@/lib/project-cache"

const STAGES: Stage[] = [
  { id: "requirement", label: "需求收集" },
  { id: "analysis", label: "需求分析" },
  { id: "research", label: "竞品研究" },
  { id: "stories", label: "用户故事" },
  { id: "prd", label: "PRD" },
  { id: "prototype", label: "原型设计" },
  { id: "review", label: "评审" },
]

function ProjectStageBar() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(() =>
    projectId ? getCachedProject(projectId) ?? null : null
  )

  useEffect(() => {
    if (!projectId) return

    api.getProject(projectId)
      .then((data) => {
        if (data && data.id) {
          setCachedProject(projectId, data)
          setProject(data)
        }
      })
      .catch((err) => console.error("Failed to load project:", err))
  }, [projectId])

  if (!project) {
    return (
      <div className="flex h-20 items-center justify-center border-b border-[var(--border)] bg-[var(--background)]">
        <span className="font-terminal text-xs text-[var(--text-muted)]">
          LOADING...
        </span>
      </div>
    )
  }

  const completedStages = project.phases
    .filter((p) => p.status === "completed")
    .map((p) => p.phase)

  const handleStageClick = (stageId: string) => {
    navigate(`/project/${projectId}/${stageId}`)
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)] px-6 py-4">
      <StageNav
        stages={STAGES}
        currentStage={project.currentPhase}
        completedStages={completedStages}
        onStageClick={handleStageClick}
      />
    </div>
  )
}

export { ProjectStageBar }
