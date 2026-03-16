import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex items-center",
    "px-2.5 py-0.5",
    "text-xs font-medium uppercase tracking-[1.5px]",
    "font-[var(--font-geist-mono),_'Courier_New',_Courier,_monospace]",
    "border",
    "transition-colors duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
    "select-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-[var(--yellow)] text-[var(--dark)] border-transparent",
        outline: "bg-transparent text-[var(--text-muted)] border-[var(--border)]",
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
