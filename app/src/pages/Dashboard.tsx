import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { api } from "@/lib/tauri-api"

interface DashboardProject {
  id: string
  name: string
  description: string | null
  currentPhase: string
  completedCount: number
  totalPhases: number
  completedPhases: string[]
  updatedAt: string
  createdAt: string
}

const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  analytics: "埋点设计",
  prototype: "原型设计",
  review: "评审",
}

const PHASE_ORDER = ["requirement", "analysis", "research", "stories", "prd", "analytics", "prototype", "review"] as const

function PhaseMiniMap({ completedPhases }: { completedPhases: string[] }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {PHASE_ORDER.map((phase) => {
        const done = completedPhases.includes(phase)
        return (
          <div
            key={phase}
            className="w-2 h-2 rounded-full"
            style={{
              background: done ? "var(--accent-color)" : "var(--border)",
            }}
          />
        )
      })}
    </div>
  )
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

export function DashboardPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const filteredProjects = search.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : projects

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.listProjects()
      setProjects(data)
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
    try {
      await api.deleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      console.error("Failed to delete project:", err)
    }
  }

  const handleCreated = (project: { id: string; name: string }) => {
    setDialogOpen(false)
    navigate(`/project/${project.id}/requirement`)
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto max-w-[800px]">
        <div className="mb-8 flex items-center justify-between">
          <div className="h-6 w-40 rounded-md bg-[var(--secondary)]" />
          <div className="h-9 w-28 rounded-md bg-[var(--secondary)]" />
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[88px] rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50"
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-light)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                还没有项目
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
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
          title="删除项目"
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
          <h1 className="text-base font-semibold text-[var(--text-primary)]">项目</h1>
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

        {/* Search */}
        {projects.length > 3 && (
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目..."
              className="w-full h-9 px-3 rounded-lg text-sm bg-[var(--secondary)] border border-[var(--border)] placeholder:text-[var(--text-tertiary)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)] transition-colors duration-200"
            />
          </div>
        )}

        {/* Project cards */}
        <div className="flex flex-col gap-4">
          {filteredProjects.map((project, index) => {
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
                <div
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 cursor-pointer transition-all duration-200 hover:shadow-[0_4px_24px_rgba(0,0,0,0.08)] active:scale-[0.99]"
                  onClick={() => navigate(`/project/${project.id}/${project.currentPhase}`)}
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
                      <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                        {formatDate(project.updatedAt)}
                      </p>
                      <PhaseMiniMap completedPhases={project.completedPhases} />
                    </div>

                    {/* Right: progress + delete */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex w-[140px] items-center gap-3">
                        <ProgressBar value={progress} animated className="h-2 flex-1" />
                        <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                          {project.completedCount}/{project.totalPhases}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, project.id)}
                        className="invisible flex size-7 items-center justify-center text-[var(--text-secondary)] transition-all hover:text-red-500 group-hover/card:visible"
                        title="删除项目"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {filteredProjects.length === 0 && search && (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">没有匹配结果</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">没有匹配「{search}」的项目</p>
            </div>
          )}
        </div>
      </div>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
      <ConfirmDialog
        open={confirmId !== null}
        title="删除项目"
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
