import { useState, useEffect, useRef } from "react"
import { api, type ProjectSummary } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface ProjectSelectorProps {
  toolKey: string
  value: string | null
  onChange: (projectId: string | null) => void
  className?: string
  /** 当前工具运行产出的文件路径（用于导入到项目引用目录） */
  outputFile?: string | null
}

export function ProjectSelector({ toolKey, value, onChange, className, outputFile }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<"success" | "error" | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === "__new__") {
      setCreating(true)
      setTimeout(() => inputRef.current?.focus(), 50)
      return
    }
    const id = val || null
    onChange(id)
    if (id) {
      localStorage.setItem(`tool-binding:${toolKey}`, id)
    } else {
      localStorage.removeItem(`tool-binding:${toolKey}`)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const detail = await api.createProject(name)
      // ProjectDetail lacks completedCount/totalPhases/completedPhases — map to ProjectSummary
      const summary: ProjectSummary = {
        id: detail.id,
        name: detail.name,
        description: detail.description,
        currentPhase: detail.currentPhase,
        outputDir: detail.outputDir,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        status: detail.status,
        completedCount: 0,
        totalPhases: detail.phases.length,
        completedPhases: detail.phases.filter((p) => p.status === "completed").map((p) => p.id),
      }
      setProjects((prev) => [summary, ...prev])
      onChange(summary.id)
      localStorage.setItem(`tool-binding:${toolKey}`, summary.id)
      setCreating(false)
      setNewName("")
    } catch (err) {
      console.error("Failed to create project:", err)
    }
  }

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate()
    if (e.key === "Escape") { setCreating(false); setNewName("") }
  }

  const handleImport = async () => {
    if (!value || !outputFile) return
    setImporting(true)
    setImportResult(null)
    try {
      await api.uploadReferenceFile(value, outputFile)
      setImportResult("success")
      setTimeout(() => setImportResult(null), 3000)
    } catch (err) {
      console.error("Failed to import:", err)
      setImportResult("error")
      setTimeout(() => setImportResult(null), 3000)
    } finally {
      setImporting(false)
    }
  }

  const selectedProject = projects.find((p) => p.id === value)

  return (
    <div className={cn("flex flex-col gap-2 pb-3 mb-4 border-b border-[var(--border)]", className)}>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-medium text-[var(--text-tertiary)] shrink-0">
          绑定项目
        </span>

        {creating ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              placeholder="输入项目名称，回车创建"
              className="flex-1 h-8 px-2 text-sm bg-transparent border border-[var(--accent-color)] text-[var(--text-primary)] outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="h-8 px-3 text-[12px] font-medium bg-[var(--accent-color)] text-white disabled:opacity-40 transition-opacity"
            >
              创建
            </button>
            <button
              onClick={() => { setCreating(false); setNewName("") }}
              className="h-8 px-2 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              取消
            </button>
          </div>
        ) : (
          <select
            value={value ?? ""}
            onChange={handleChange}
            className={cn(
              "flex-1 h-8 px-2 text-sm bg-transparent border border-[var(--border)]",
              "text-[var(--text-primary)] outline-none",
              "focus:border-[var(--accent-color)] transition-colors"
            )}
          >
            <option value="">— 不绑定 —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="__new__">+ 新建项目</option>
          </select>
        )}

        {selectedProject && !creating && (
          <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
            运行后自动保存上下文
          </span>
        )}
      </div>

      {/* Import to project button */}
      {value && outputFile && !creating && (
        <div className="flex items-center gap-2 pl-[68px]">
          <button
            onClick={handleImport}
            disabled={importing}
            className="text-[12px] text-[var(--accent-color)] hover:opacity-70 transition-opacity disabled:opacity-40"
          >
            {importing ? "导入中..." : "将产出物导入到项目引用目录"}
          </button>
          {importResult === "success" && (
            <span className="text-[11px] text-[var(--success)]">已导入</span>
          )}
          {importResult === "error" && (
            <span className="text-[11px] text-[var(--destructive)]">导入失败</span>
          )}
        </div>
      )}
    </div>
  )
}
