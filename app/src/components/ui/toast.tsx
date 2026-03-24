import React, { useState, useEffect } from "react"
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ToastContext,
  useToastState,
  registerGlobalToast,
  type ToastItem as ToastItemType,
  type ToastVariant,
} from "@/hooks/use-toast"

/* ── Variant config ──────────────────────────────────────────── */

const variantConfig: Record<
  ToastVariant,
  { icon: React.ElementType; barColor: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    barColor: "bg-[var(--success)]",
    iconColor: "text-[var(--success)]",
  },
  error: {
    icon: XCircle,
    barColor: "bg-[var(--destructive)]",
    iconColor: "text-[var(--destructive)]",
  },
  info: {
    icon: Info,
    barColor: "bg-[var(--accent-color)]",
    iconColor: "text-[var(--accent-color)]",
  },
  warning: {
    icon: AlertTriangle,
    barColor: "bg-[var(--warning)]",
    iconColor: "text-[var(--warning)]",
  },
}

/* ── Single toast ────────────────────────────────────────────── */

function ToastItemComponent({
  item,
  onDismiss,
}: {
  item: ToastItemType
  onDismiss: (id: string) => void
}) {
  const [exiting, setExiting] = useState(false)
  const { icon: Icon, barColor, iconColor } = variantConfig[item.variant]

  // Start exit animation 300ms before removal
  useEffect(() => {
    const exitDelay = Math.max(item.duration - 300, 0)
    const timer = setTimeout(() => setExiting(true), exitDelay)
    return () => clearTimeout(timer)
  }, [item.duration])

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex items-center gap-3",
        "min-w-[320px] max-w-[420px] overflow-hidden",
        "rounded-lg bg-[var(--card)] shadow-[var(--shadow-lg)]",
        "border border-[var(--border)]",
        exiting ? "animate-[fadeOut_300ms_ease_forwards]" : "animate-[slideInRight_300ms_ease_both]"
      )}
    >
      {/* Left color bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", barColor)} />

      {/* Icon */}
      <div className={cn("ml-4 shrink-0", iconColor)}>
        <Icon className="size-[18px]" />
      </div>

      {/* Message */}
      <p className="flex-1 py-3 pr-2 text-sm text-[var(--text-primary)]">{item.message}</p>

      {/* Close */}
      <button
        onClick={() => onDismiss(item.id)}
        aria-label="关闭"
        className={cn(
          "mr-3 shrink-0 rounded p-1",
          "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          "hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
        )}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

/* ── Provider ────────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const state = useToastState()

  // Register module-level toast API for background stream notifications
  React.useEffect(() => {
    registerGlobalToast(state.setToasts, state.timersRef)
  }, [state.setToasts, state.timersRef])

  return (
    <ToastContext.Provider value={state}>
      {children}

      {/* Toast container — fixed top-right */}
      <div
        role="region"
        aria-live="polite"
        aria-label="通知"
        className="pointer-events-none fixed z-60 flex flex-col gap-2"
        style={{ top: 56, right: 24 }}
      >
        {state.toasts.map((item) => (
          <ToastItemComponent key={item.id} item={item} onDismiss={state.dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
