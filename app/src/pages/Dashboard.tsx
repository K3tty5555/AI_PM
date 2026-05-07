import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Clock, ArrowRight, CheckSquare, FolderSearch, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProjectCard } from "@/components/project-card"
import { BatchActionBar } from "@/components/BatchActionBar"
import { useFavorites } from "@/hooks/use-favorites"
import { useToast } from "@/hooks/use-toast"
import { useRecent } from "@/hooks/use-recent"
import { useProjectActions } from "@/hooks/use-project-actions"
import { useBatchSelect } from "@/hooks/use-batch-select"
import { api, type ProjectSummary } from "@/lib/tauri-api"
import { translateError } from "@/lib/error-messages"
import { cn } from "@/lib/utils"

function OnboardingDialog({ onDismiss, onGoSettings }: { onDismiss: () => void; onGoSettings: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-modal="true" aria-labelledby="dialog-title-onboarding">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-[var(--shadow-xl)] w-96">
        <p id="dialog-title-onboarding" className="text-base font-semibold text-[var(--text-primary)]">欢迎使用 AI PM</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
          使用 AI 功能前，需要先配置 Claude API Key。
          前往设置页填写后，即可开始使用完整功能。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all duration-150 active:scale-[0.97]"
          >
            稍后再说
          </button>
          <button
            onClick={onGoSettings}
            className="rounded-lg bg-[var(--accent-color)] px-4 py-1.5 text-sm text-white hover:opacity-90 transition-all duration-150 active:scale-[0.97]"
          >
            前往设置
          </button>
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { isFavorite, toggleFavorite } = useFavorites()
  const { recentItems } = useRecent()
  const { toast } = useToast()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [sortOrder, setSortOrder] = useState<'updatedAt' | 'createdAt'>('updatedAt')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Disk drift detection (T9): on-disk projects not yet in DB
  const [unimportedCount, setUnimportedCount] = useState(0)
  const [unimportedDismissed, setUnimportedDismissed] = useState(
    () => localStorage.getItem("disk-drift-dismissed") === "1",
  )
  const [importing, setImporting] = useState(false)

  // Batch delete confirmation
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)

  const {
    renameState,
    setRenameInput,
    setRenameError,
    startRename,
    startRenameById,
    cancelRename,
    confirmRename,
  } = useProjectActions(setProjects)

  const filteredProjects = projects
    .filter((p) => {
      const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      if (sortOrder === 'updatedAt') return b.updatedAt.localeCompare(a.updatedAt)
      return a.createdAt.localeCompare(b.createdAt)
    })

  const batch = useBatchSelect({ items: filteredProjects })

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.listProjects()
      setProjects(data)
    } catch (err) {
      console.error("Failed to load projects:", err)
      toast("项目列表加载失败", "error")
    } finally {
      setLoading(false)
    }
  }, [])

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

  // T9: detect unimported projects on disk
  useEffect(() => {
    if (unimportedDismissed) return
    let cancelled = false
    ;(async () => {
      try {
        const projectsDir = await api.getProjectsDir()
        if (!projectsDir) return
        const base = `${projectsDir.replace(/\/$/, "")}/projects`
        const results = await api.scanLegacyProjects(base)
        if (cancelled) return
        const pending = results.filter((p) => !p.alreadyExists).length
        setUnimportedCount(pending)
      } catch (err) {
        console.warn("[Dashboard] disk drift scan skipped:", err)
      }
    })()
    return () => { cancelled = true }
  }, [unimportedDismissed])

  const handleImportFromDisk = useCallback(async () => {
    setImporting(true)
    try {
      const projectsDir = await api.getProjectsDir()
      const base = `${projectsDir.replace(/\/$/, "")}/projects`
      const results = await api.scanLegacyProjects(base)
      const toImport = results.filter((p) => !p.alreadyExists)
      if (toImport.length === 0) {
        toast("没有可导入的项目", "info")
        setUnimportedCount(0)
        return
      }
      const result = await api.importLegacyProjects(toImport)
      if (result.imported > 0) {
        toast(`已导入 ${result.imported} 个项目`, "success")
        setUnimportedCount(0)
        await fetchProjects()
        window.dispatchEvent(new Event("projects-updated"))
      } else {
        toast("导入失败，请前往设置页查看详情", "error")
      }
    } catch (err) {
      console.error("[Dashboard] import from disk:", err)
      toast(translateError(err), "error")
    } finally {
      setImporting(false)
    }
  }, [fetchProjects, toast])

  const handleDismissDrift = useCallback(() => {
    localStorage.setItem("disk-drift-dismissed", "1")
    setUnimportedDismissed(true)
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
      toast("删除项目失败", "error")
    }
  }

  const handleToggleStatus = useCallback(async (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation()
    const newStatus = project.status === 'completed' ? 'active' : 'completed'
    try {
      await api.setProjectStatus(project.id, newStatus)
      setProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, status: newStatus } : p))
      window.dispatchEvent(new Event("projects-updated"))
    } catch (err) {
      console.error("Failed to update project status:", err)
      toast("更新项目状态失败", "error")
    }
  }, [])

  // ── Batch operations ──────────────────────────────────────────────────

  const handleBatchArchive = useCallback(async () => {
    const ids = Array.from(batch.selectedIds)
    try {
      const result = await api.batchSetProjectStatus(ids, "completed")
      if (result.succeeded.length > 0) {
        setProjects((prev) =>
          prev.map((p) =>
            result.succeeded.includes(p.id) ? { ...p, status: "completed" } : p,
          ),
        )
        toast(`已归档 ${result.succeeded.length} 个项目`, "success")
        window.dispatchEvent(new Event("projects-updated"))
      }
      if (result.failed.length > 0) {
        toast(`${result.failed.length} 个项目归档失败`, "error")
      }
    } catch (err) {
      toast(translateError(err), "error")
    }
    batch.exitSelectionMode()
  }, [batch.selectedIds, batch.exitSelectionMode, toast])

  const handleBatchExport = useCallback(async () => {
    const ids = Array.from(batch.selectedIds)
    setExporting(true)
    try {
      const zipPath = await api.exportProjectsZip(ids)
      toast("导出完成", "success")
      api.revealFile(zipPath).catch(console.error)
    } catch (err) {
      toast(translateError(err), "error")
    } finally {
      setExporting(false)
      batch.exitSelectionMode()
    }
  }, [batch.selectedIds, batch.exitSelectionMode, toast])

  const handleBatchDeleteConfirm = useCallback(async () => {
    setBatchDeleteConfirm(false)
    const ids = Array.from(batch.selectedIds)
    try {
      const result = await api.batchDeleteProjects(ids)
      if (result.succeeded.length > 0) {
        setProjects((prev) => prev.filter((p) => !result.succeeded.includes(p.id)))
        toast(`已删除 ${result.succeeded.length} 个项目`, "success")
        window.dispatchEvent(new Event("projects-updated"))
      }
      if (result.failed.length > 0) {
        toast(`${result.failed.length} 个项目删除失败`, "error")
      }
    } catch (err) {
      toast(translateError(err), "error")
    }
    batch.exitSelectionMode()
  }, [batch.selectedIds, batch.exitSelectionMode, toast])

  const handleToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      batch.toggleSelect(id, shiftKey)
    },
    [batch.toggleSelect],
  )

  // ── End batch operations ──────────────────────────────────────────────

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

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setDialogOpen(true)}
                className="gap-2"
              >
                <Plus className="size-4" strokeWidth={1.75} />
                新建项目
              </Button>
              {unimportedCount > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleImportFromDisk}
                  disabled={importing}
                  className="gap-2"
                >
                  <FolderSearch className="size-4" strokeWidth={1.75} />
                  {importing ? "导入中..." : `导入磁盘项目（${unimportedCount}）`}
                </Button>
              )}
            </div>
            {unimportedCount > 0 && (
              <p className="max-w-[420px] text-center text-[12px] text-[var(--text-tertiary)]">
                检测到 {unimportedCount} 个 CLI 创建但未入客户端的项目，可一键导入
              </p>
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
        {showOnboarding && <OnboardingDialog onDismiss={dismissOnboarding} onGoSettings={goToSettings} />}
      </>
    )
  }

  // Project list
  return (
    <>
      <div className={cn("layout-cards", batch.selectionMode && "pb-20")}>
        {/* Disk drift banner (T9) */}
        {unimportedCount > 0 && !unimportedDismissed && (
          <div
            className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--accent-color)]/5 px-4 py-3"
            style={{ animation: "fadeInUp 200ms var(--ease-decelerate)" }}
          >
            <FolderSearch className="size-4 shrink-0 text-[var(--accent-color)]" strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--text-primary)]">
                检测到 <span className="font-semibold text-[var(--accent-color)]">{unimportedCount}</span> 个磁盘项目未入客户端
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                CLI 创建的项目会写入磁盘但不进数据库，导入后可在客户端查看
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleImportFromDisk}
              disabled={importing}
              className="shrink-0"
            >
              {importing ? "导入中..." : "立即导入"}
            </Button>
            <button
              type="button"
              onClick={handleDismissDrift}
              className="shrink-0 rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              aria-label="忽略"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">项目</h1>
          <div className="flex items-center gap-2">
            {filteredProjects.length > 1 && (
              <Button
                variant={batch.selectionMode ? "secondary" : "ghost"}
                size="sm"
                onClick={batch.selectionMode ? batch.exitSelectionMode : batch.enterSelectionMode}
                className="gap-1.5"
              >
                <CheckSquare className="size-3.5" strokeWidth={1.75} />
                {batch.selectionMode ? "取消" : "选择"}
              </Button>
            )}
            {!batch.selectionMode && (
              <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="size-3.5" strokeWidth={1.75} />
                新建项目
              </Button>
            )}
          </div>
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
            className="text-xs text-[var(--text-secondary)] bg-transparent border border-[var(--border)] rounded-lg px-2 py-1 outline-none cursor-pointer"
          >
            <option value="updatedAt">最近更新</option>
            <option value="createdAt">最早创建</option>
          </select>
        </div>

        {/* Recent access (hidden in selection mode) */}
        {!batch.selectionMode && recentItems.length > 0 && (
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
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          role={batch.selectionMode ? "listbox" : undefined}
          aria-multiselectable={batch.selectionMode ? true : undefined}
        >
          {filteredProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              isFavorite={isFavorite(project.id)}
              renameState={renameState}
              selectionMode={batch.selectionMode}
              isSelected={batch.selectedIds.has(project.id)}
              onToggleSelect={handleToggleSelect}
              onToggleFavorite={() => toggleFavorite(project.id)}
              onToggleStatus={(e) => handleToggleStatus(e, project)}
              onDelete={(e) => handleDelete(e, project.id)}
              rename={{
                start: (e) => startRename(project, e),
                startById: () => startRenameById(project),
                cancel: cancelRename,
                confirm: () => confirmRename(project),
                onInputChange: (value) => { setRenameInput(value); setRenameError("") },
              }}
            />
          ))}

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

      {/* Batch action bar */}
      {batch.selectionMode && (
        <BatchActionBar
          selectedCount={batch.selectedIds.size}
          totalCount={filteredProjects.length}
          isAllSelected={batch.isAllSelected}
          onToggleSelectAll={batch.toggleSelectAll}
          onArchive={handleBatchArchive}
          onExport={handleBatchExport}
          onDelete={() => setBatchDeleteConfirm(true)}
          onExit={batch.exitSelectionMode}
          exporting={exporting}
        />
      )}

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
      <ConfirmDialog
        open={batchDeleteConfirm}
        title="批量删除项目"
        description={`确认删除选中的 ${batch.selectedIds.size} 个项目？所有项目的数据库记录和本地输出文件将被永久删除，此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        variant="danger"
        onConfirm={handleBatchDeleteConfirm}
        onCancel={() => setBatchDeleteConfirm(false)}
      />
      {showOnboarding && <OnboardingDialog onDismiss={dismissOnboarding} onGoSettings={goToSettings} />}
    </>
  )
}
