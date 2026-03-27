import { useState, useCallback, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { api, type DiagnosticItem, type DiagnosticSummary } from "@/lib/tauri-api"

export function useDiagnostics() {
  const [items, setItems] = useState<DiagnosticItem[]>([])
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null)
  const [running, setRunning] = useState(false)
  const unlisteners = useRef<UnlistenFn[]>([])

  const run = useCallback(async (detailed: boolean) => {
    // Clean up previous listeners
    for (const fn of unlisteners.current) fn()
    unlisteners.current = []

    setItems([])
    setSummary(null)
    setRunning(true)

    const unlisten1 = await listen<DiagnosticItem>("diagnostic_item", (e) => {
      setItems((prev) => [...prev, e.payload])
    })
    const unlisten2 = await listen<DiagnosticSummary>("diagnostic_done", (e) => {
      setSummary(e.payload)
      setRunning(false)
    })
    unlisteners.current = [unlisten1, unlisten2]

    try {
      await api.runDiagnostics(detailed)
    } catch {
      setRunning(false)
    }
  }, [])

  const cancel = useCallback(async () => {
    for (const fn of unlisteners.current) fn()
    unlisteners.current = []
    setRunning(false)
    await api.cancelDiagnostics().catch(() => {})
  }, [])

  const reset = useCallback(() => {
    for (const fn of unlisteners.current) fn()
    unlisteners.current = []
    setItems([])
    setSummary(null)
    setRunning(false)
  }, [])

  return { items, summary, running, run, cancel, reset }
}
