import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-xl bg-[var(--card)] text-[var(--card-foreground)]",
        "border border-[var(--border)]",
        "shadow-[0_2px_16px_rgba(0,0,0,0.04)]",
        "transition-shadow duration-200",
        "hover:shadow-[0_4px_24px_rgba(0,0,0,0.08)]",
        "p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 pb-4", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-base font-semibold leading-tight text-[var(--text-primary)]", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-[var(--text-secondary)]", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-content"
      className={cn("", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center pt-4", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
