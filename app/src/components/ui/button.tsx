import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "rounded-lg border text-sm font-medium whitespace-nowrap",
    "transition-all outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/40",
    "active:scale-[0.97] active:duration-[100ms]",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--accent-color)] text-white border-transparent font-semibold",
          "hover:brightness-105",
          "duration-[var(--dur-base)] ease-[var(--ease-standard)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--text-primary)] border-[var(--border)]",
          "hover:bg-[var(--hover-bg)] hover:border-[var(--accent-color)]/40",
          "duration-[var(--dur-base)] ease-[var(--ease-standard)]",
        ].join(" "),
        default: [
          "bg-[var(--accent-color)] text-white border-transparent font-semibold",
          "hover:brightness-105",
          "duration-[var(--dur-base)] ease-[var(--ease-standard)]",
        ].join(" "),
        outline: [
          "bg-transparent text-[var(--text-primary)] border-[var(--border)]",
          "hover:bg-[var(--hover-bg)] hover:border-[var(--accent-color)]/40",
          "duration-[var(--dur-base)] ease-[var(--ease-standard)]",
        ].join(" "),
        secondary: [
          "bg-[var(--secondary)] text-[var(--text-primary)] border-transparent",
          "hover:bg-[var(--active-bg)]",
          "duration-[var(--dur-base)] ease-[var(--ease-standard)]",
        ].join(" "),
        destructive: [
          "bg-[var(--destructive)] text-white border-transparent",
          "hover:brightness-110",
          "duration-[var(--dur-base)] ease-[var(--ease-standard)]",
        ].join(" "),
        link: "text-[var(--accent-color)] underline-offset-4 hover:underline border-transparent",
      },
      size: {
        default: "h-9 gap-2 px-4",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-7 gap-1.5 px-3 text-[0.8rem]",
        lg: "h-10 gap-2 px-5 text-base",
        icon: "size-9",
        "icon-xs": "size-6",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
