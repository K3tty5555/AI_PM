"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { StageNav, type Stage } from "@/components/stage-nav"

const STAGES: Stage[] = [
  { id: "requirement", label: "需求收集" },
  { id: "analysis", label: "需求分析" },
  { id: "research", label: "竞品研究" },
  { id: "stories", label: "用户故事" },
  { id: "prd", label: "PRD" },
  { id: "prototype", label: "原型设计" },
  { id: "review", label: "评审" },
]

interface ProjectPhaseData {
  phase: string
  status: string
}

interface ProjectData {
  id: string
  currentPhase: string
  phases: ProjectPhaseData[]
}

function ProjectStageBar() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string
  const [project, setProject] = useState<ProjectData | null>(null)

  useEffect(() => {
    if (!projectId) return

    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) {
          setProject(data)
        }
      })
      .catch((err) => console.error("Failed to load project:", err))
  }, [projectId])

  if (!project) {
    return (
      <div className="flex h-20 items-center justify-center border-b border-[var(--border)] bg-[var(--background)]">
        <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
          LOADING...
        </span>
      </div>
    )
  }

  const completedStages = project.phases
    .filter((p) => p.status === "completed")
    .map((p) => p.phase)

  const handleStageClick = (stageId: string) => {
    router.push(`/project/${projectId}/${stageId}`)
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
