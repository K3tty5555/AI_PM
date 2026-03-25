import { useState, useEffect, useCallback } from "react"
import { BrainstormChat } from "@/components/brainstorm-chat"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

// ─── Props ─────────────────────────────────────────────────────────────────

interface PhaseShellProps {
  projectId: string
  phase: string
  phaseLabel: string
  brainstormEnabled: boolean
  children: React.ReactNode // 常规模式内容
  onBrainstormGenerate: () => void
}

// ─── Component ─────────────────────────────────────────────────────────────

export function PhaseShell({
  projectId,
  phase,
  phaseLabel,
  brainstormEnabled,
  children,
  onBrainstormGenerate,
}: PhaseShellProps) {
  const [mode, setMode] = useState<"normal" | "brainstorm">("normal")
  const [messageCount, setMessageCount] = useState(0)
  const [isSkipped, setIsSkipped] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // Lightweight count query — no event listeners, no conflict with BrainstormChat's hook
  const refreshCount = useCallback(() => {
    api.brainstormMessageCount(projectId, phase).then(setMessageCount).catch(() => {})
  }, [projectId, phase])

  useEffect(() => { refreshCount() }, [refreshCount])

  // Check if this phase is skipped
  useEffect(() => {
    api.getProject(projectId).then((project) => {
      if (!project) return
      const phaseData = project.phases.find((p: any) => p.phase === phase)
      setIsSkipped(phaseData?.status === "skipped")
    }).catch(() => {})
  }, [projectId, phase])

  const handleRestore = useCallback(async () => {
    setRestoring(true)
    try {
      await api.unskipPhase(projectId, phase)
      setIsSkipped(false)
      window.dispatchEvent(new CustomEvent("project-phase-updated", { detail: { projectId } }))
    } catch {
      // silent
    } finally {
      setRestoring(false)
    }
  }, [projectId, phase])

  // First-time onboarding hint
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!brainstormEnabled) return
    const key = "brainstorm-onboarded"
    if (!localStorage.getItem(key)) {
      setShowOnboarding(true)
    }
  }, [brainstormEnabled])

  const dismissOnboarding = () => {
    localStorage.setItem("brainstorm-onboarded", "1")
    setShowOnboarding(false)
  }

  if (!brainstormEnabled) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Segmented Control */}
      <div className="flex items-center gap-3 mb-4">
        <SegmentedControl
          mode={mode}
          onChange={(m) => {
            setMode(m)
            if (m === "normal") refreshCount()
            if (showOnboarding) dismissOnboarding()
          }}
          messageCount={messageCount}
        />

        {/* Onboarding hint */}
        {showOnboarding && (
          <div className="flex items-center gap-2 animate-[fadeInUp_300ms_var(--ease-decelerate)]">
            <span className="text-[12px] text-[var(--text-secondary)]">
              试试「先聊聊」，和 AI 讨论后再生成
            </span>
            <button
              onClick={dismissOnboarding}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              知道了
            </button>
          </div>
        )}
      </div>

      {/* Skipped phase banner */}
      {isSkipped && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
          <span className="text-[13px] text-[var(--text-secondary)]">此阶段已标记为跳过</span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? "恢复中..." : "恢复并生成"}
          </Button>
        </div>
      )}

      {/* Content area */}
      {mode === "normal" ? (
        children
      ) : (
        <BrainstormChat
          projectId={projectId}
          phase={phase}
          phaseLabel={phaseLabel}
          onGenerate={() => {
            setMode("normal")
            // 延迟一帧让模式切换完成、常规模式组件挂载后再触发生成
            requestAnimationFrame(() => onBrainstormGenerate())
          }}
        />
      )}
    </div>
  )
}

// ─── Segmented Control ─────────────────────────────────────────────────────

function SegmentedControl({
  mode,
  onChange,
  messageCount,
}: {
  mode: "normal" | "brainstorm"
  onChange: (mode: "normal" | "brainstorm") => void
  messageCount: number
}) {
  return (
    <div
      className="inline-flex rounded-full border border-[var(--border)] bg-[var(--secondary)] p-0.5"
      role="radiogroup"
      aria-label="生成模式"
    >
      <button
        role="radio"
        aria-checked={mode === "normal"}
        onClick={() => onChange("normal")}
        className={cn(
          "rounded-full px-4 py-1 text-[13px] font-medium transition-all duration-200 cursor-pointer",
          mode === "normal"
            ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-secondary)]"
        )}
      >
        直接生成
      </button>
      <button
        role="radio"
        aria-checked={mode === "brainstorm"}
        onClick={() => onChange("brainstorm")}
        className={cn(
          "relative rounded-full px-4 py-1 text-[13px] font-medium transition-all duration-200 cursor-pointer",
          mode === "brainstorm"
            ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-secondary)]"
        )}
      >
        先聊聊
        {messageCount > 0 && mode !== "brainstorm" && (
          <span className="absolute -top-1 -right-1 size-4 rounded-full bg-[var(--accent-color)] text-[10px] text-white flex items-center justify-center">
            {messageCount > 9 ? "9+" : messageCount}
          </span>
        )}
      </button>
    </div>
  )
}
