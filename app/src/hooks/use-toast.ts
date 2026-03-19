import { createContext, useContext, useState, useCallback, useRef } from "react"

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

export function useToastState(): ToastContextValue {
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

  return { toasts, toast, dismiss }
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return ctx
}
