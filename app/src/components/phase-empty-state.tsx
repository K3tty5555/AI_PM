import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PhaseEmptyStateProps {
  /** HUD label shown above the hex, e.g. "ANALYSIS" */
  phaseLabel: string
  /** Human-readable description, e.g. "需求分析报告" */
  description: string
  /** Called when user clicks the generate button */
  onGenerate: () => void
  disabled?: boolean
  className?: string
}

export function PhaseEmptyState({
  phaseLabel,
  description,
  onGenerate,
  disabled,
  className,
}: PhaseEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-24 gap-6",
        className,
      )}
    >
      {/* Hexagon placeholder */}
      <div
        className="flex items-center justify-center w-16 h-16 opacity-20"
        style={{
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          background: "var(--border)",
        }}
      >
        <span className="font-terminal text-xs uppercase tracking-[2px] text-[var(--text-muted)]">
          {phaseLabel.slice(0, 2)}
        </span>
      </div>

      {/* Labels */}
      <div className="flex flex-col items-center gap-2">
        <span className="font-terminal text-[10px] uppercase tracking-[3px] text-[var(--text-muted)]">
          {phaseLabel}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          尚未生成{description}
        </span>
      </div>

      {/* Generate button */}
      <Button
        variant="primary"
        onClick={onGenerate}
        disabled={disabled}
      >
        开始生成 →
      </Button>
    </div>
  )
}
