import { cn } from "@/lib/utils"

interface Stage {
  id: string
  label: string
}

interface StageNavProps {
  stages: Stage[]
  currentStage: string
  completedStages: string[]
  onStageClick?: (stageId: string) => void
  className?: string
}

function StageNav({
  stages,
  currentStage,
  completedStages,
  onStageClick,
  className,
}: StageNavProps) {
  const getStageStatus = (stageId: string) => {
    if (completedStages.includes(stageId)) return "completed"
    if (stageId === currentStage) return "current"
    return "locked"
  }

  const isLineActive = (index: number) => {
    if (index >= stages.length - 1) return false
    const stageId = stages[index].id
    return completedStages.includes(stageId)
  }

  return (
    <div
      data-slot="stage-nav"
      className={cn("flex items-start justify-center gap-0", className)}
    >
      {stages.map((stage, index) => {
        const status = getStageStatus(stage.id)

        return (
          <div key={stage.id} className="flex items-start">
            {/* Stage node + label */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={false}
                onClick={() => onStageClick?.(stage.id)}
                className={cn(
                  "relative flex items-center justify-center",
                  "w-12 h-12",
                  "transition-all duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
                  "outline-none",
                  // Hexagon clip-path
                  "[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]",
                  status === "completed" && [
                    "bg-[var(--yellow)] text-white",
                    "cursor-pointer hover:shadow-[var(--yellow-glow)]",
                  ],
                  status === "current" && [
                    "bg-transparent",
                    "cursor-pointer",
                  ],
                  status === "locked" && [
                    "bg-transparent",
                    "cursor-pointer opacity-50",
                    "hover:opacity-75",
                  ]
                )}
                aria-label={`${stage.label} - ${status}`}
              >
                {/* Inner hexagon for border effect */}
                <span
                  className={cn(
                    "absolute inset-0",
                    "[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]",
                    status === "completed" && "bg-[var(--yellow)]",
                    status === "current" && "bg-[var(--yellow)]",
                    status === "locked" && "bg-[var(--border)]",
                  )}
                />
                <span
                  className={cn(
                    "absolute inset-[2px]",
                    "[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]",
                    status === "completed" && "bg-[var(--yellow)]",
                    status === "current" && "bg-[var(--background)]",
                    status === "locked" && "bg-[var(--background)]",
                  )}
                />
                {/* Index number */}
                <span
                  className={cn(
                    "relative z-10 text-xs font-bold",
                    "font-terminal",
                    status === "completed" && "text-[var(--dark)]",
                    status === "current" && "text-[var(--dark)]",
                    status === "locked" && "text-[var(--text-muted)]",
                  )}
                >
                  {index + 1}
                </span>
                {/* Pulse ring for current stage */}
                {status === "current" && (
                  <span
                    className={cn(
                      "absolute inset-0",
                      "[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]",
                      "animate-[hexPulse_2s_ease-in-out_infinite]",
                    )}
                  />
                )}
              </button>
              {/* Stage label */}
              <span
                className={cn(
                  "text-[11px] text-center whitespace-nowrap leading-tight",
                  "font-terminal",
                  status === "completed" && "text-[var(--dark)] font-medium",
                  status === "current" && "text-[var(--dark)] font-semibold",
                  status === "locked" && "text-[var(--text-muted)]",
                )}
              >
                {stage.label}
              </span>
            </div>

            {/* Connector line */}
            {index < stages.length - 1 && (
              <div className="flex items-center h-12 px-1">
                <div
                  className={cn(
                    "w-8 h-[2px]",
                    "transition-colors duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
                    isLineActive(index)
                      ? "bg-[var(--yellow)]"
                      : "bg-[var(--border)]"
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { StageNav }
export type { Stage, StageNavProps }
