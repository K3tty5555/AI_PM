"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { RarityStripeCard } from "@/components/rarity-stripe-card"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface DashboardProject {
  id: string
  name: string
  description: string | null
  currentPhase: string
  completedCount: number
  totalPhases: number
  updatedAt: string
  createdAt: string
}

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  prototype: "原型设计",
  review: "评审",
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return dateStr
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects")
      const data = await res.json()
      if (Array.isArray(data)) {
        setProjects(data)
      }
    } catch (err) {
      console.error("Failed to load projects:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setConfirmId(id)
  }

  const handleConfirmDelete = async () => {
    if (!confirmId) return
    const id = confirmId
    setConfirmId(null)
    setDeletingId(id)
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" })
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      console.error("Failed to delete project:", err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreated = (project: { id: string; name: string }) => {
    setDialogOpen(false)
    router.push(`/project/${project.id}/requirement`)
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto max-w-[800px]">
        <div className="mb-8 flex items-center justify-between">
          <div className="h-6 w-40 bg-[var(--secondary)]" />
          <div className="h-9 w-28 bg-[var(--secondary)]" />
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[88px] border border-[var(--border)] bg-[var(--secondary)]/50"
              style={{
                animation: `fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s both`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (projects.length === 0) {
    return (
      <>
        <div className="flex h-full items-center justify-center">
          <div
            className="flex flex-col items-center gap-6"
            style={{ animation: "fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1)" }}
          >
            {/* Hexagon icon */}
            <div className="relative flex h-20 w-20 items-center justify-center">
              <svg
                viewBox="0 0 80 80"
                width="80"
                height="80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polygon
                  points="40,4 72,22 72,58 40,76 8,58 8,22"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1.5"
                />
                <polygon
                  points="40,16 60,27 60,49 40,60 20,49 20,27"
                  fill="var(--yellow-bg)"
                  stroke="var(--yellow)"
                  strokeWidth="1"
                />
              </svg>
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold text-[var(--dark)]">
                还没有项目
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                开始你的第一个产品需求
              </p>
            </div>

            <Button
              variant="primary"
              onClick={() => setDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="size-4" />
              新建项目
            </Button>
          </div>
        </div>

        <NewProjectDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreated={handleCreated}
        />
        <ConfirmDialog
          open={confirmId !== null}
          title="// DELETE_PROJECT"
          description="确认删除该项目？项目数据库记录和本地所有输出文件将被永久删除，此操作不可撤销。"
          confirmLabel="删除"
          cancelLabel="取消"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmId(null)}
        />
      </>
    )
  }

  // Project list
  return (
    <>
      <div className="mx-auto max-w-[800px]">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs font-medium uppercase tracking-[3px] text-[var(--text-muted)]">
            // PROJECTS
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="gap-2"
          >
            <Plus className="size-3.5" />
            新建项目
          </Button>
        </div>

        {/* Divider */}
        <div className="mb-6 h-px bg-[var(--border)]" />

        {/* Project cards */}
        <div className="flex flex-col gap-4">
          {projects.map((project, index) => {
            const isComplete =
              project.completedCount >= project.totalPhases
            const progress =
              project.totalPhases > 0
                ? Math.round(
                    (project.completedCount / project.totalPhases) * 100
                  )
                : 0
            const phaseLabel = isComplete
              ? "已完成"
              : (PHASE_LABELS[project.currentPhase] ?? project.currentPhase)

            return (
              <div
                key={project.id}
                style={{
                  animation: `fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) ${index * 0.08}s both`,
                }}
              >
                <RarityStripeCard
                  rarity={isComplete ? "gray" : "gold"}
                  className="cursor-pointer transition-shadow hover:shadow-[0_0_20px_rgba(255,250,0,0.35)]"
                  onClick={() =>
                    router.push(
                      `/project/${project.id}/${project.currentPhase}`
                    )
                  }
                >
                  <div className="group/card flex items-center justify-between gap-4">
                    {/* Left: name + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="truncate text-base font-semibold text-[var(--dark)]">
                          {project.name}
                        </span>
                        <Badge variant={isComplete ? "outline" : "default"}>
                          {phaseLabel}
                        </Badge>
                      </div>
                      <p className="mt-1.5 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
                        {formatDate(project.updatedAt)}
                      </p>
                    </div>

                    {/* Right: progress + delete */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex w-[140px] items-center gap-3">
                        <ProgressBar value={progress} animated className="h-2 flex-1" />
                        <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs tabular-nums text-[var(--text-muted)]">
                          {project.completedCount}/{project.totalPhases}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, project.id)}
                        className="invisible flex size-7 items-center justify-center text-[var(--text-muted)] transition-all hover:text-red-500 group-hover/card:visible"
                        title="删除项目"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </RarityStripeCard>
              </div>
            )
          })}
        </div>
      </div>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
      <ConfirmDialog
        open={confirmId !== null}
        title="// DELETE_PROJECT"
        description="确认删除该项目？项目数据库记录和本地所有输出文件将被永久删除，此操作不可撤销。"
        confirmLabel="删除"
        cancelLabel="取消"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmId(null)}
      />
    </>
  )
}
