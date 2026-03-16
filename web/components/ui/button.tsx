"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "border text-sm font-medium whitespace-nowrap",
    "transition-all outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-[var(--yellow)]/50",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--yellow)] text-[var(--dark)] border-transparent font-semibold",
          "hover:shadow-[var(--yellow-glow)]",
          "active:bg-[#e6e100]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--dark)] border-[var(--border)]",
          "hover:border-[var(--yellow)] hover:text-[var(--dark)]",
        ].join(" "),
        default: [
          "bg-[var(--yellow)] text-[var(--dark)] border-transparent font-semibold",
          "hover:shadow-[var(--yellow-glow)]",
          "active:bg-[#e6e100]",
        ].join(" "),
        outline: [
          "bg-transparent text-[var(--dark)] border-[var(--border)]",
          "hover:border-[var(--yellow)] hover:text-[var(--dark)]",
        ].join(" "),
        secondary: [
          "bg-[var(--secondary)] text-[var(--secondary-foreground)] border-transparent",
          "hover:bg-[#ebebeb]",
        ].join(" "),
        destructive: "bg-[var(--destructive)] text-white border-transparent hover:bg-[var(--destructive)]/90",
        link: "text-[var(--dark)] underline-offset-4 hover:underline border-transparent",
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
