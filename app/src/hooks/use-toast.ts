import React, { createContext, useContext, useState, useCallback, useRef } from "react"

export type ToastVariant = "success" | "error" | "info" | "warning"

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

export interface ToastContextValue {
  toasts: ToastItem[]
  toast: (message: string, variant?: ToastVariant, duration?: number) => void
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

let idCounter = 0

export function useToastState(): ToastContextValue & {
  setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>>
  timersRef: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>
} {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 3000) => {
      const id = `toast-${++idCounter}`
      const item: ToastItem = { id, message, variant, duration }

      setToasts((prev) => {
        // Keep max 3 visible — drop oldest if needed
        const next = [...prev, item]
        return next.length > 3 ? next.slice(next.length - 3) : next
      })

      const timer = setTimeout(() => {
        timersRef.current.delete(id)
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)

      timersRef.current.set(id, timer)
    },
    []
  )

  return { toasts, toast, dismiss, setToasts, timersRef }
}

// ── Module-level Toast API (works outside React component tree) ──────────

type ToastSetter = React.Dispatch<React.SetStateAction<ToastItem[]>>
let globalSetToasts: ToastSetter | null = null
let globalTimersRef: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>> | null = null

export function registerGlobalToast(
  setter: ToastSetter,
  timers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>
) {
  globalSetToasts = setter
  globalTimersRef = timers
}

export function globalToast(message: string, variant: ToastVariant = "info", duration = 3000) {
  if (!globalSetToasts) return
  const id = `toast-${++idCounter}`
  const item: ToastItem = { id, message, variant, duration }

  globalSetToasts((prev) => {
    const next = [...prev, item]
    return next.length > 3 ? next.slice(next.length - 3) : next
  })

  if (globalTimersRef) {
    const timer = setTimeout(() => {
      globalTimersRef?.current.delete(id)
      globalSetToasts?.((prev) => prev.filter((t) => t.id !== id))
    }, duration)
    globalTimersRef.current.set(id, timer)
  }
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return ctx
}
