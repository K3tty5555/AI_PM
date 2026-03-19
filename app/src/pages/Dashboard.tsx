import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, CheckCircle2, RotateCcw, Pencil, FolderOpen, ExternalLink, GripVertical, Clock, Star, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu"
import { useFavorites } from "@/hooks/use-favorites"
import { useRecent } from "@/hooks/use-recent"
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
  outputDir: string
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

const SORT_ORDER_KEY = "project-sort-order"

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
  const { isFavorite, toggleFavorite } = useFavorites()
  const { recentItems } = useRecent()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [sortOrder, setSortOrder] = useState<'updatedAt' | 'createdAt'>('updatedAt')
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Inline rename state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string>("")
  const isConfirmingRef = useRef(false)

  // Drag-to-reorder state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const dragCounterRef = useRef(0)

  const getCustomOrder = useCallback((): Record<string, number> => {
    try {
      const raw = localStorage.getItem(SORT_ORDER_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }, [])

  const saveCustomOrder = useCallback((order: Record<string, number>) => {
    localStorage.setItem(SORT_ORDER_KEY, JSON.stringify(order))
  }, [])

  const [customOrder, setCustomOrder] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("project-sort-order")
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  const handleDragStart = useCallback((e: React.DragEvent, projectId: string) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", projectId)
    setDraggedId(projectId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDropTargetId(null)
    dragCounterRef.current = 0
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent, projectId: string) => {
    e.preventDefault()
    dragCounterRef.current++
    setDropTargetId(projectId)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      setDropTargetId(null)
      dragCounterRef.current = 0
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    dragCounterRef.current = 0
    const sourceId = e.dataTransfer.getData("text/plain")
    if (!sourceId || sourceId === targetId) {
      setDraggedId(null)
      setDropTargetId(null)
      return
    }

    // Reorder the filtered list: move sourceId before targetId
    setProjects(prev => {
      const arr = [...prev]
      const srcIdx = arr.findIndex(p => p.id === sourceId)
      const tgtIdx = arr.findIndex(p => p.id === targetId)
      if (srcIdx === -1 || tgtIdx === -1) return prev

      const [moved] = arr.splice(srcIdx, 1)
      const insertIdx = tgtIdx > srcIdx ? tgtIdx - 1 : tgtIdx
      arr.splice(insertIdx, 0, moved)

      // Persist new order
      const newOrder: Record<string, number> = {}
      arr.forEach((p, i) => { newOrder[p.id] = i })
      saveCustomOrder(newOrder)
      setCustomOrder(newOrder)

      return arr
    })

    setDraggedId(null)
    setDropTargetId(null)
  }, [saveCustomOrder])

  const filteredProjects = projects
    .filter((p) => {
      const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      // If both items have a custom sort order, use that first
      const aOrder = customOrder[a.id]
      const bOrder = customOrder[b.id]
      if (aOrder !== undefined && bOrder !== undefined) {
        return aOrder - bOrder
      }
      // Items with custom order come before those without
      if (aOrder !== undefined) return -1
      if (bOrder !== undefined) return 1
      // Fallback to date-based sort
      const key = sortOrder === 'updatedAt' ? 'updatedAt' : 'createdAt'
      return b[key].localeCompare(a[key])
    })

  const startRename = useCallback((project: DashboardProject, e: React.MouseEvent) => {
    if (renamingProjectId !== null) return
    e.stopPropagation()
    setEditingProjectId(project.id)
    setRenameInput(project.name)
    setRenameError("")
    isConfirmingRef.current = false
  }, [renamingProjectId])

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
      isConfirmingRef.current = false
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
      // Apply saved custom order on initial load
      const order = getCustomOrder()
      if (Object.keys(order).length > 0) {
        data.sort((a: DashboardProject, b: DashboardProject) => {
          const aO = order[a.id]
          const bO = order[b.id]
          if (aO !== undefined && bO !== undefined) return aO - bO
          if (aO !== undefined) return -1
          if (bO !== undefined) return 1
          return b.updatedAt.localeCompare(a.updatedAt)
        })
      }
      setProjects(data)
    } catch (err) {
      console.error("Failed to load projects:", err)
    } finally {
      setLoading(false)
    }
  }, [getCustomOrder])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    api.getConfig().then((cfg) => {
      if (!cfg.hasConfig && !localStorage.getItem("onboarding-dismissed")) {
        setShowOnboarding(true)
      }
    }).catch((err) => console.error("[Dashboard] getConfig:", err))
  }, [])

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

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem("onboarding-dismissed", "1")
    setShowOnboarding(false)
  }, [])

  const goToSettings = useCallback(() => {
    dismissOnboarding()
    navigate("/settings")
  }, [dismissOnboarding, navigate])

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
        {showOnboarding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl w-96">
              <p className="text-base font-semibold text-[var(--text-primary)]">欢迎使用 AI PM</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                使用 AI 功能前，需要先配置 Claude API Key。
                前往设置页填写后，即可开始使用完整功能。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={dismissOnboarding}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                >
                  稍后再说
                </button>
                <button
                  onClick={goToSettings}
                  className="rounded-lg bg-[var(--accent-color)] px-4 py-1.5 text-sm text-white hover:opacity-90"
                >
                  去设置
                </button>
              </div>
            </div>
          </div>
        )}
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

        {/* Recent access */}
        {recentItems.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Clock className="size-3.5 text-[var(--text-tertiary)]" strokeWidth={1.75} />
              <span className="text-[11px] font-medium text-[var(--text-tertiary)]">最近访问</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
                    "text-[13px] text-[var(--text-primary)]",
                    "bg-[var(--secondary)] hover:bg-[var(--hover-bg)]",
                    "border border-[var(--border)]",
                    "transition-colors duration-150",
                  )}
                >
                  <ArrowRight className="size-3 text-[var(--text-tertiary)]" strokeWidth={1.75} />
                  <span className="truncate max-w-[180px]">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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

            const isFav = isFavorite(project.id)
            const contextItems: ContextMenuItem[] = [
              { label: isFav ? "取消收藏" : "收藏", icon: Star, action: () => toggleFavorite(project.id) },
              { label: "打开项目", icon: FolderOpen, action: () => navigate(`/project/${project.id}/requirement`) },
              { label: "重命名", icon: Pencil, action: () => { setEditingProjectId(project.id); setRenameInput(project.name); setRenameError(""); isConfirmingRef.current = false }, separator: true },
              { label: "在 Finder 中显示", icon: ExternalLink, action: () => api.revealFile(project.outputDir).catch(console.error) },
              { label: "删除项目", icon: Trash2, action: () => setConfirmId(project.id), variant: "destructive" as const },
            ]

            const isDragged = draggedId === project.id
            const isDropTarget = dropTargetId === project.id && draggedId !== project.id

            return (
              <ContextMenu key={project.id} items={contextItems}>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, project.id)}
                onDragEnd={handleDragEnd}
                onDragEnter={(e) => handleDragEnter(e, project.id)}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, project.id)}
                className={cn(
                  "group/card relative rounded-xl border bg-[var(--card)] p-5 cursor-pointer",
                  "transition-all duration-200",
                  "hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px]",
                  "active:scale-[0.99] active:shadow-none",
                  isDragged && "opacity-50",
                  isDropTarget && "border-[var(--accent-color)] shadow-[0_0_0_1px_var(--accent-color)]",
                  !isDropTarget && "border-[var(--border)]"
                )}
                onClick={() => navigate(`/project/${project.id}/${project.currentPhase}`)}
                style={{
                  animation: `fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) ${index * 0.08}s both`,
                }}
              >
                {/* Drag grip — top-left, revealed on hover */}
                <div className="absolute top-3 left-3 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 cursor-grab active:cursor-grabbing">
                  <GripVertical className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                </div>

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
              </ContextMenu>
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
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl w-96">
            <p className="text-base font-semibold text-[var(--text-primary)]">欢迎使用 AI PM</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              使用 AI 功能前，需要先配置 Claude API Key。
              前往设置页填写后，即可开始使用完整功能。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={dismissOnboarding}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              >
                稍后再说
              </button>
              <button
                onClick={goToSettings}
                className="rounded-lg bg-[var(--accent-color)] px-4 py-1.5 text-sm text-white hover:opacity-90"
              >
                去设置
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
