import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const accentStripeCardVariants = cva(
  [
    "relative",
    "bg-[var(--card)] text-[var(--card-foreground)]",
    "border border-[var(--border)]",
    "shadow-[var(--shadow-sm)]",
    "transition-shadow duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
    "hover:shadow-[var(--shadow-md)]",
    "p-5 pl-7",
  ].join(" "),
  {
    variants: {
      accent: {
        gold: "before:bg-[var(--accent-color)]",
        teal: "before:bg-[var(--success)]",
        gray: "before:bg-[var(--text-tertiary)]",
      },
    },
    defaultVariants: {
      accent: "gold",
    },
  }
)

interface AccentStripeCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof accentStripeCardVariants> {
  children: React.ReactNode
}

function AccentStripeCard({
  accent,
  className,
  children,
  ...props
}: AccentStripeCardProps) {
  return (
    <div
      data-slot="accent-stripe-card"
      className={cn(
        accentStripeCardVariants({ accent, className }),
        // The left stripe via pseudo-element
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:content-['']"
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { AccentStripeCard, accentStripeCardVariants }
