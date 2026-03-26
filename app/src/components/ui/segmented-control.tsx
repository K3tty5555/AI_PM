import { cn } from "@/lib/utils"

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  items: { key: T; label: string }[]
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  items,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("flex gap-1 rounded-lg bg-[var(--secondary)] p-1", className)} role="tablist">
      {items.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-[13px] transition-colors",
            value === key
              ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
