import { useEffect, useState, useCallback } from "react"
import { X, Lock } from "lucide-react"
import { api } from "@/lib/tauri-api"
import { PHASE_ORDER, PHASE_LABELS, REQUIRED_PHASES } from "@/lib/phase-meta"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface ProjectSettingsDrawerProps {
  open: boolean
  projectId: string
  onClose: () => void
}

const PHASE_DESCRIPTIONS: Record<string, string> = {
  requirement: "收集和整理产品需求",
  analysis: "深入分析需求，提炼核心功能",
  research: "竞品调研和市场分析",
  stories: "拆解为用户故事和验收标准",
  prd: "撰写产品需求文档",
  analytics: "设计数据埋点和指标",
  prototype: "生成可交互原型",
  review: "多角色评审 PRD",
  retrospective: "项目复盘和知识沉淀",
}

export function ProjectSettingsDrawer({ open, projectId, onClose }: ProjectSettingsDrawerProps) {
  const { toast } = useToast()
  const [phaseStatuses, setPhaseStatuses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const loadPhases = useCallback(async () => {
    try {
      const project = await api.getProject(projectId)
      if (!project) return
      const map: Record<string, string> = {}
      for (const p of project.phases) {
        map[p.phase] = p.status
      }
      setPhaseStatuses(map)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) {
      setLoading(true)
      loadPhases()
    }
  }, [open, loadPhases])

  const handleToggle = useCallback(async (phase: string, currentStatus: string) => {
    const isEnabled = currentStatus !== "skipped"
    try {
      if (isEnabled) {
        await api.skipPhases(projectId, [phase])
        setPhaseStatuses((prev) => ({ ...prev, [phase]: "skipped" }))
        toast(`已跳过「${PHASE_LABELS[phase]}」`, "success")
      } else {
        await api.unskipPhase(projectId, phase)
        setPhaseStatuses((prev) => ({ ...prev, [phase]: "pending" }))
        toast(`已恢复「${PHASE_LABELS[phase]}」`, "success")
      }
      window.dispatchEvent(new CustomEvent("project-phase-updated", { detail: { projectId } }))
    } catch (err) {
      toast(String(err), "error")
    }
  }, [projectId, toast])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }} />

      {/* Drawer */}
      <div
        className="relative w-[480px] max-w-full h-full bg-[var(--background)] border-l border-[var(--border)] shadow-[var(--shadow-xl)] overflow-y-auto"
        style={{ animation: "slideInRight 200ms var(--ease-decelerate)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--background)] border-b border-[var(--border)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">项目设置</h2>
          <button onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Phase toggles */}
        <div className="px-6 py-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4">阶段管理</h3>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-[var(--secondary)] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {PHASE_ORDER.map((phase) => {
                const status = phaseStatuses[phase] ?? "pending"
                const isRequired = (REQUIRED_PHASES as readonly string[]).includes(phase)
                const isCompleted = status === "completed"
                const isSkipped = status === "skipped"
                const disabled = isRequired || isCompleted
                const enabled = !isSkipped

                return (
                  <div
                    key={phase}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2.5",
                      "transition-colors duration-150",
                      disabled ? "opacity-60" : "hover:bg-[var(--hover-bg)]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {PHASE_LABELS[phase]}
                        </span>
                        {isRequired && <Lock className="size-3 text-[var(--text-tertiary)]" strokeWidth={2} />}
                        {isCompleted && (
                          <span className="text-[10px] text-[var(--success)] bg-[var(--success-light)] px-1.5 py-0.5 rounded">
                            已完成
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        {PHASE_DESCRIPTIONS[phase]}
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={disabled}
                        onChange={() => handleToggle(phase, status)}
                        className="sr-only peer"
                      />
                      <div className={cn(
                        "w-9 h-5 rounded-full transition-colors",
                        "after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:size-4 after:transition-all",
                        enabled ? "bg-[var(--accent-color)] peer-checked:after:translate-x-full" : "bg-[var(--border)]",
                        disabled && "cursor-not-allowed",
                      )} />
                    </label>
                  </div>
                )
              })}
            </div>
          )}

          <p className="mt-4 text-[11px] text-[var(--text-tertiary)]">
            核心阶段（需求收集、PRD）不可关闭。已完成的阶段不可回退。
          </p>
        </div>
      </div>
    </div>
  )
}
