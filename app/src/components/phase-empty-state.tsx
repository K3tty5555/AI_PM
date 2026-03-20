import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PhaseEmptyStateProps {
  /** Phase label shown as title, e.g. "需求分析报告" */
  phaseLabel: string
  /** Human-readable description, e.g. "需求分析报告" */
  description: string
  /** Called when user clicks the generate button */
  onGenerate: () => void
  /** If provided, shows a "skip this step" link */
  onSkip?: () => void
  disabled?: boolean
  className?: string
}

export function PhaseEmptyState({
  phaseLabel: _phaseLabel,
  description,
  onGenerate,
  onSkip,
  disabled,
  className,
}: PhaseEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-24 gap-5",
        "animate-[fadeInUp_300ms_var(--ease-decelerate)]",
        className,
      )}
    >
      {/* Rounded icon container */}
      <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--accent-light)]">
        <span className="text-xl text-[var(--accent-color)]">✦</span>
      </div>

      {/* Labels */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {description}
        </span>
        <span className="text-[13px] text-[var(--text-secondary)]">
          尚未生成内容，点击下方按钮开始
        </span>
      </div>

      {/* CTA */}
      <div className="mt-1 flex flex-col items-center gap-2">
        <Button
          variant="primary"
          onClick={onGenerate}
          disabled={disabled}
        >
          开始生成
        </Button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={disabled}
            className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
          >
            跳过此步 →
          </button>
        )}
      </div>
    </div>
  )
}
