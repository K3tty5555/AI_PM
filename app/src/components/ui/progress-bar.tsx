import { cn } from "@/lib/utils"

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
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
        "relative h-0.5 w-full overflow-hidden rounded-full",
        "bg-[var(--border)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full",
          "transition-[width] duration-[300ms] ease-[var(--ease-standard)]",
          animated && "animate-[progressFill_0.8s_var(--ease-decelerate)_forwards]"
        )}
        style={{
          width: `${clampedValue}%`,
          background: "var(--accent-color)",
          ["--progress-value" as string]: `${clampedValue}%`,
        }}
      />
    </div>
  )
}

export { ProgressBar }
