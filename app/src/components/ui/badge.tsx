import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex items-center",
    "px-2.5 py-0.5",
    "rounded-full",
    "text-xs font-medium",
    "transition-colors duration-[200ms]",
    "select-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-[var(--accent-light)] text-[var(--accent-color)]",
        outline: "bg-transparent text-[var(--text-secondary)] border border-[var(--border)]",
        success: "bg-[var(--success-light)] text-[var(--success)]",
        destructive: "bg-[var(--destructive)]/10 text-[var(--destructive)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
