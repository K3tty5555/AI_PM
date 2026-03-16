import { cn } from "@/lib/utils"

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Progress value between 0 and 100 */
  value: number
  /** Whether to animate the fill on mount */
  animated?: boolean
}

function ProgressBar({
  value,
  animated = false,
  className,
  ...props
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div
      data-slot="progress-bar"
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-2 w-full overflow-hidden",
        "bg-[var(--secondary)] border border-[var(--border)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
          animated && "animate-[progressFill_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards]"
        )}
        style={{
          width: `${clampedValue}%`,
          background: "linear-gradient(90deg, #fffa00, rgba(255, 250, 0, 0.3))",
          ["--progress-value" as string]: `${clampedValue}%`,
        }}
      />
    </div>
  )
}

export { ProgressBar }
