import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, CheckCircle2, RotateCcw, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

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
  status: 'active' | 'completed'
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
    <div className="flex items-center gap-[3px]">
      {PHASE_ORDER.map((phase) => {
        const done = completedPhases.includes(phase)
        return (
          <div
            key={phase}
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: done ? "var(--accent-color)" : "var(--border)" }}
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [sortOrder, setSortOrder] = useState<'updatedAt' | 'createdAt'>('updatedAt')

  // Inline rename state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string>("")
  const isConfirmingRef = useRef(false)

  const filteredProjects = projects
    .filter((p) => {
      const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      const key = sortOrder === 'updatedAt' ? 'updatedAt' : 'createdAt'
      return b[key].localeCompare(a[key])
    })

  const startRename = useCallback((project: DashboardProject, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProjectId(project.id)
    setRenameInput(project.name)
    setRenameError("")
    isConfirmingRef.current = false
  }, [])

  const cancelRename = useCallback(() => {
    setEditingProjectId(null)
    setRenameInput("")
    setRenameError("")
    isConfirmingRef.current = false
  }, [])

  const confirmRename = useCallback(async (project: DashboardProject) => {
    if (isConfirmingRef.current) return
    const newName = renameInput.trim()
    if (!newName) {
      setRenameError("名称不能为空")
      return
    }
    if (newName === project.name) {
      cancelRename()
      return
    }
    isConfirmingRef.current = true
    setRenamingProjectId(project.id)
    setRenameError("")
    try {
      await api.renameProject(project.id, newName)
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, name: newName } : p))
      setEditingProjectId(null)
      setRenameInput("")
    } catch (err) {
      setRenameError(String(err))
      isConfirmingRef.current = false
    } finally {
      setRenamingProjectId(null)
    }
  }, [renameInput, cancelRename])

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

  const handleToggleStatus = useCallback(async (e: React.MouseEvent, project: DashboardProject) => {
    e.stopPropagation()
    const newStatus = project.status === 'completed' ? 'active' : 'completed'
    try {
      await api.setProjectStatus(project.id, newStatus)
      setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, status: newStatus } : p))
      window.dispatchEvent(new Event("projects-updated"))
    } catch (err) {
      console.error("Failed to update project status:", err)
    }
  }, [])

  const handleCreated = (project: { id: string; name: string }) => {
    setDialogOpen(false)
    navigate(`/project/${project.id}/requirement`)
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="layout-cards">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-[22px] w-16 rounded-md bg-[var(--secondary)]" />
          <div className="h-8 w-24 rounded-md bg-[var(--secondary)]" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[148px] rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50"
              style={{ animation: `fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s both` }}
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
              <Plus className="size-4" strokeWidth={1.75} />
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
      <div className="layout-cards">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">项目</h1>
          <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="size-3.5" strokeWidth={1.75} />
            新建项目
          </Button>
        </div>

        {/* Search */}
        {projects.length > 4 && (
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

        {/* Filter tabs + sort */}
        <div className="mb-4 flex items-center">
          {(['all', 'active', 'completed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors",
                statusFilter === s
                  ? "border-b-2 border-[var(--accent-color)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {({ all: '全部', active: '进行中', completed: '已完成' } as const)[s]}
            </button>
          ))}
          <div className="flex-1" />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
            className="text-xs text-[var(--text-secondary)] bg-transparent border border-[var(--border)] rounded px-2 py-1 outline-none cursor-pointer"
          >
            <option value="updatedAt">最近更新</option>
            <option value="createdAt">最早创建</option>
          </select>
        </div>

        {/* Project cards grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project, index) => {
            const isComplete = project.completedCount >= project.totalPhases
            const progress =
              project.totalPhases > 0
                ? Math.round((project.completedCount / project.totalPhases) * 100)
                : 0
            const phaseLabel = isComplete
              ? "已完成"
              : (PHASE_LABELS[project.currentPhase] ?? project.currentPhase)

            return (
              <div
                key={project.id}
                className="group/card relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 cursor-pointer
                           transition-all duration-200
                           hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:-translate-y-[1px]
                           active:scale-[0.99] active:shadow-none"
                onClick={() => navigate(`/project/${project.id}/${project.currentPhase}`)}
                style={{
                  animation: `fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) ${index * 0.08}s both`,
                }}
              >
                {/* Card action buttons — top-right, revealed on hover */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={(e) => handleToggleStatus(e, project)}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md transition-all duration-150",
                      project.status === 'completed'
                        ? "text-[var(--success)] hover:bg-[var(--success)]/10"
                        : "text-[var(--text-tertiary)] hover:text-[var(--success)] hover:bg-[var(--success)]/10"
                    )}
                    title={project.status === 'completed' ? '重新激活' : '标记完成'}
                  >
                    {project.status === 'completed'
                      ? <RotateCcw className="size-3.5" strokeWidth={1.75} />
                      : <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
                    }
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="flex size-6 items-center justify-center rounded-md
                               text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                    title="删除项目"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </button>
                </div>

                {/* Project name */}
                <div className="flex items-start gap-2 pr-6 mb-3">
                  {editingProjectId === project.id ? (
                    <div className="flex flex-col gap-1 min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameInput}
                          onChange={(e) => { setRenameInput(e.target.value); setRenameError("") }}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); confirmRename(project) }
                            else if (e.key === "Escape") { e.preventDefault(); cancelRename() }
                          }}
                          onBlur={() => confirmRename(project)}
                          disabled={renamingProjectId === project.id}
                          className={cn(
                            "h-8 px-2 text-[15px] font-semibold rounded border bg-transparent outline-none w-full",
                            renameError
                              ? "border-[var(--destructive)] text-[var(--destructive)]"
                              : "border-[var(--accent-color)] text-[var(--text-primary)]"
                          )}
                        />
                        {renamingProjectId === project.id && (
                          <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                          </svg>
                        )}
                      </div>
                      {renameError && (
                        <span className="text-[10px] text-[var(--destructive)]">{renameError}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0 group/name">
                      <span className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug truncate">
                        {project.name}
                      </span>
                      <button
                        onClick={(e) => startRename(project, e)}
                        className="opacity-0 group-hover/name:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-[var(--accent-color)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-color)] shrink-0"
                        title="重命名"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {project.status === 'completed' && (
                        <span className="ml-1 rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] text-[var(--success)] font-medium shrink-0">
                          已完成
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Phase badge */}
                <Badge variant={isComplete ? "outline" : "default"} className="mb-3">
                  {phaseLabel}
                </Badge>

                {/* Progress bar */}
                <div className="mb-3">
                  <ProgressBar value={progress} className="h-[2px]" />
                </div>

                {/* Footer: phase dots + date */}
                <div className="flex items-center justify-between">
                  <PhaseMiniMap completedPhases={project.completedPhases} />
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {formatDate(project.updatedAt)}
                  </span>
                </div>
              </div>
            )
          })}

          {filteredProjects.length === 0 && (search || statusFilter !== 'all') && (
            <div className="col-span-full py-16 text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">没有匹配结果</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {search
                  ? `没有匹配「${search}」的项目`
                  : statusFilter === 'completed' ? '暂无已完成的项目' : '暂无进行中的项目'}
              </p>
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
