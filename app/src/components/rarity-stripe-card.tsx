import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const rarityStripeCardVariants = cva(
  [
    "relative",
    "bg-[var(--card)] text-[var(--card-foreground)]",
    "border border-[var(--border)]",
    "shadow-[0_2px_16px_rgba(0,0,0,0.04)]",
    "transition-shadow duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
    "hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]",
    "p-5 pl-7",
  ].join(" "),
  {
    variants: {
      rarity: {
        gold: "before:bg-[#fffa00]",
        teal: "before:bg-[#4ECDC4]",
        gray: "before:bg-[#9E9E9E]",
      },
    },
    defaultVariants: {
      rarity: "gold",
    },
  }
)

interface RarityStripeCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof rarityStripeCardVariants> {
  children: React.ReactNode
}

function RarityStripeCard({
  rarity,
  className,
  children,
  ...props
}: RarityStripeCardProps) {
  return (
    <div
      data-slot="rarity-stripe-card"
      className={cn(
        rarityStripeCardVariants({ rarity, className }),
        // The left stripe via pseudo-element
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:content-['']"
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { RarityStripeCard, rarityStripeCardVariants }
