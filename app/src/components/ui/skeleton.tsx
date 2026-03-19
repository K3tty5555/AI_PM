import { cn } from "@/lib/utils"

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-4 w-full rounded-md",
        className
      )}
      style={{
        backgroundColor: "var(--secondary)",
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, var(--background) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  )
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 && "w-3/5")}
        />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <Skeleton className="h-5 w-2/3 mb-4" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <Skeleton className="mt-6 h-8 w-24" />
    </div>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="flex-1 h-3.5" />
        </div>
      ))}
    </div>
  )
}
